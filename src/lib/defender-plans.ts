import { getDb, ObjectId, toObjectId } from "@/lib/db";
import {
  computeBattlegroupBoard,
  type BattlegroupBoard,
  type DefenderAssignment,
  type DefenderOverride,
  type RawRosterRow
} from "@/lib/diversity";
import { normalizeAscension } from "@/lib/ascension";

type Db = Awaited<ReturnType<typeof getDb>>;
export type DefenderList = "suggested" | "current";

const MAX_DEFENDERS_PER_MEMBER = 5;

const COLLECTIONS: Record<DefenderList, string> = {
  suggested: "suggestedDefenderAssignments",
  current: "currentDefenderAssignments"
};

// Remembers that a list has been created for a Battlegroup, so a list an
// officer deliberately emptied isn't silently regenerated.
const PLAN_STATE = "defenderPlanState";

// Older snapshots stored IDs as strings, newer ones as ObjectIds; match both.
function idFilter(value: ObjectId) {
  return { $in: [value, value.toString()] };
}

function toAssignments(board: BattlegroupBoard, list: DefenderList): DefenderAssignment[] {
  const rows = list === "current" ? board.currentDefenders : board.suggestedDefenders;
  return rows.flatMap((member) =>
    member.defenders.map((defender) => ({ championId: defender.championId, userId: member.userId }))
  );
}

async function replaceList(db: Db, battlegroup: number, list: DefenderList, assignments: DefenderAssignment[]) {
  const collection = db.collection(COLLECTIONS[list]);
  const now = new Date();
  await collection.deleteMany({ battlegroup });
  if (assignments.length > 0) {
    await collection.insertMany(
      assignments.map((assignment) => ({
        battlegroup,
        championId: new ObjectId(assignment.championId),
        userId: new ObjectId(assignment.userId),
        updatedAt: now
      }))
    );
  }
  await db
    .collection(PLAN_STATE)
    .updateOne({ battlegroup }, { $set: { battlegroup, [`${list}CreatedAt`]: now } }, { upsert: true });
}

async function readList(db: Db, battlegroup: number, list: DefenderList) {
  const docs = await db.collection(COLLECTIONS[list]).find({ battlegroup }).toArray();
  const state = await db.collection(PLAN_STATE).findOne({ battlegroup });
  const exists = docs.length > 0 || Boolean(state?.[`${list}CreatedAt`]);
  const assignments: DefenderAssignment[] = docs.map((doc) => ({
    championId: String(doc.championId),
    userId: String(doc.userId)
  }));
  return exists ? assignments : null;
}

async function loadInputs(db: Db, battlegroup: number) {
  const memberDocs = await db.collection("users").find({ battlegroup }).sort({ displayName: 1 }).toArray();
  const members = memberDocs.map((member) => ({
    userId: member._id.toString(),
    username: member.username as string,
    displayName: member.displayName as string
  }));

  const rosterDocs = await db
    .collection("rosterEntries")
    .aggregate([
      { $match: { userId: { $in: memberDocs.map((member) => member._id) } } },
      { $lookup: { from: "champions", localField: "championId", foreignField: "_id", as: "champion" } },
      { $unwind: "$champion" }
    ])
    .toArray();

  const rows: RawRosterRow[] = rosterDocs.map((row) => {
    const member = memberDocs.find((candidate) => candidate._id.equals(row.userId));
    return {
      userId: row.userId.toString(),
      username: member?.username as string,
      displayName: member?.displayName as string,
      championId: row.championId.toString(),
      championName: row.champion.name,
      championImageUrl: row.champion.imageUrl ?? null,
      stars: row.stars ?? null,
      rank: row.rank ?? null,
      sigLevel: row.sigLevel ?? null,
      rating: row.rating ?? null,
      awakened: row.awakened ?? null,
      ascended: normalizeAscension(row.ascended)
    };
  });

  const overrideDocs = await db.collection("defenderOverrides").find({ battlegroup }).toArray();
  const overrides: DefenderOverride[] = overrideDocs.map((doc) => ({
    championId: String(doc.championId),
    userId: doc.userId ? String(doc.userId) : null,
    blockedUserIds: Array.isArray(doc.blockedUserIds) ? doc.blockedUserIds.map(String) : []
  }));

  return { memberDocs, members, rows, overrides };
}

/**
 * Loads a Battlegroup's board. Both the suggested and current lists are saved
 * snapshots: the suggested list is auto-generated once (keeping any earlier
 * manual overrides) and afterwards only changes through officer edits or the
 * "Auto-suggest" action, so manual changes are never reshuffled.
 */
export async function loadBattlegroupBoard(db: Db, battlegroup: number) {
  const { memberDocs, members, rows, overrides } = await loadInputs(db, battlegroup);
  const build = (suggested: DefenderAssignment[] | null, current: DefenderAssignment[]) =>
    computeBattlegroupBoard(battlegroup, rows, [], members, MAX_DEFENDERS_PER_MEMBER, overrides, current, suggested);

  let suggested = await readList(db, battlegroup, "suggested");
  if (!suggested && members.length > 0) {
    suggested = toAssignments(build(null, []), "suggested");
    await replaceList(db, battlegroup, "suggested", suggested);
  }

  let current = await readList(db, battlegroup, "current");
  if (!current && suggested && suggested.length > 0) {
    current = suggested;
    await replaceList(db, battlegroup, "current", current);
  }

  return { board: build(suggested ?? [], current ?? []), memberDocs };
}

/** Rebuilds the suggested list from scratch: best defenders first, highest PI copies. */
export async function autoSuggest(db: Db, battlegroup: number) {
  const { members, rows } = await loadInputs(db, battlegroup);
  const fresh = computeBattlegroupBoard(battlegroup, rows, [], members, MAX_DEFENDERS_PER_MEMBER, [], [], null);
  const assignments = toAssignments(fresh, "suggested");
  await replaceList(db, battlegroup, "suggested", assignments);
  return assignments.length;
}

/** Replaces the current list with the saved suggested list. */
export async function publishSuggested(db: Db, battlegroup: number) {
  const { board } = await loadBattlegroupBoard(db, battlegroup);
  const assignments = toAssignments(board, "suggested");
  await replaceList(db, battlegroup, "current", assignments);
  return assignments.length;
}

export type DefenderEdit =
  | { action: "remove"; championId: string; fromUserId: string }
  | {
      action: "assign";
      championId: string;
      fromUserId: string | null;
      toUserId: string;
      replaceChampionId?: string | null;
    };

/** Moves, adds, replaces or removes one defender in the saved suggested plan. */
export async function editSuggestedPlan(
  db: Db,
  battlegroup: number,
  edit: DefenderEdit
): Promise<{ status: number; error?: string }> {
  const championObjId = toObjectId(edit.championId);
  if (!championObjId) return { status: 400, error: "Invalid champion." };

  const champion = await db.collection("champions").findOne({ _id: championObjId });
  if (!champion) return { status: 404, error: "Champion not found." };

  const { board, memberDocs } = await loadBattlegroupBoard(db, battlegroup);
  const listRows = board.suggestedDefenders;
  const additional = board.additionalPossibleDefenders;
  const listName = "suggested plan";

  const sourceRow = edit.fromUserId ? listRows.find((row) => row.userId === edit.fromUserId) : null;
  const clicked = edit.fromUserId
    ? sourceRow?.defenders.find((entry) => entry.championId === edit.championId)
    : additional.find((entry) => entry.championId === edit.championId);

  if (!clicked) {
    return {
      status: 409,
      error: edit.fromUserId
        ? `That defender is no longer in the selected member's ${listName}. Refresh and try again.`
        : "That champion is no longer available to add. Refresh and try again."
    };
  }

  const collection = db.collection(COLLECTIONS.suggested);

  if (edit.action === "remove") {
    await collection.deleteMany({ battlegroup, championId: idFilter(championObjId) });
    return { status: 200 };
  }

  if (edit.fromUserId === edit.toUserId) return { status: 400, error: "Choose a different member." };

  const toObjId = toObjectId(edit.toUserId);
  const toUser = toObjId ? memberDocs.find((member) => member._id.equals(toObjId)) : null;
  if (!toObjId || !toUser) {
    return { status: 400, error: "The selected member must belong to this Battlegroup." };
  }

  if (!clicked.owners.some((owner) => owner.userId === edit.toUserId)) {
    return { status: 400, error: `${toUser.displayName} does not own ${champion.name}.` };
  }

  const targetRow = listRows.find((row) => row.userId === edit.toUserId);
  const targetCount = targetRow?.assigned ?? 0;
  const replaceChampionId = edit.replaceChampionId ?? null;

  if (targetCount >= MAX_DEFENDERS_PER_MEMBER && !replaceChampionId) {
    return { status: 409, error: "The target member has all 5 defender slots filled. Choose a defender to replace." };
  }
  if (targetCount < MAX_DEFENDERS_PER_MEMBER && replaceChampionId) {
    return { status: 400, error: "The target member has an open slot; no replacement is needed." };
  }

  const replaceObjId = replaceChampionId ? toObjectId(replaceChampionId) : null;
  if (replaceChampionId && (!replaceObjId || !targetRow?.defenders.some((entry) => entry.championId === replaceChampionId))) {
    return { status: 409, error: `That defender is no longer in the target member's ${listName}. Refresh and try again.` };
  }

  // Only this Battlegroup's saved list changes; player rosters are untouched.
  if (replaceObjId) {
    await collection.deleteMany({ battlegroup, championId: idFilter(replaceObjId) });
  }
  await collection.deleteMany({ battlegroup, championId: idFilter(championObjId) });
  await collection.insertOne({ battlegroup, championId: championObjId, userId: toObjId, updatedAt: new Date() });

  return { status: 200 };
}
