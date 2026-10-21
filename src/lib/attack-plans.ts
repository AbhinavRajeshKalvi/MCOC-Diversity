import type { Db, MongoServerError } from "mongodb";
import { ObjectId } from "./db";
import {
  ATTACKERS_PER_NODE,
  PATHS,
  isPathSlot,
  pathSlot,
  type AttackBoard,
  type AttackerChampion,
  type AttackMember,
  type AttackSlot
} from "./attack-map";
import type { WarMode } from "./war-mode";

// Each war mode has its own map, so each keeps its own assignments.
export const ATTACK_ASSIGNMENTS: Record<WarMode, string> = {
  regular: "attackAssignments",
  bigThings: "bigThingsAttackAssignments"
};

type AttackAssignmentDoc = {
  allianceId: ObjectId;
  battlegroup: number;
  slot: AttackSlot;
  userId: ObjectId;
  /** Big Things only: champion ids from the holder's roster, at most ATTACKERS_PER_NODE. */
  attackers?: ObjectId[];
  updatedBy: ObjectId;
  updatedAt: Date;
};

async function loadMembers(db: Db, allianceId: ObjectId, battlegroup: number): Promise<AttackMember[]> {
  const users = await db
    .collection("users")
    .find({ allianceId, battlegroup }, { projection: { displayName: 1 } })
    .sort({ displayName: 1 })
    .toArray();
  return users.map((user) => ({ userId: user._id.toString(), displayName: user.displayName as string }));
}

/**
 * The attack map for one battlegroup. Assignments held by someone who has
 * since left the battlegroup are treated as empty.
 */
export async function loadAttackBoard(
  db: Db,
  allianceId: ObjectId,
  battlegroup: 1 | 2 | 3,
  mode: WarMode = "regular"
): Promise<AttackBoard> {
  const [members, docs] = await Promise.all([
    loadMembers(db, allianceId, battlegroup),
    db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS[mode]).find({ allianceId, battlegroup }).toArray()
  ]);
  const byId = new Map(members.map((member) => [member.userId, member]));
  const assignments: AttackBoard["assignments"] = {};
  const held: AttackAssignmentDoc[] = [];
  for (const doc of docs) {
    const member = byId.get(doc.userId.toString());
    if (member) {
      assignments[doc.slot] = member;
      held.push(doc);
    }
  }
  if (mode !== "bigThings") return { battlegroup, members, assignments };
  return { battlegroup, members, assignments, attackers: await loadAttackers(db, held) };
}

type RosterChampionRow = {
  userId: ObjectId;
  championId: ObjectId;
  stars?: number | null;
  rank?: number | null;
  champion: { name: string; imageUrl?: string | null };
};

function toAttackerChampion(row: RosterChampionRow): AttackerChampion {
  return {
    championId: row.championId.toString(),
    name: row.champion.name,
    imageUrl: row.champion.imageUrl ?? null,
    stars: row.stars ?? null,
    rank: row.rank ?? null
  };
}

/** Roster entries joined with their champion, for the given members. */
async function rosterRows(db: Db, match: Record<string, unknown>): Promise<RosterChampionRow[]> {
  return (await db
    .collection("rosterEntries")
    .aggregate([
      { $match: match },
      { $lookup: { from: "champions", localField: "championId", foreignField: "_id", as: "champion" } },
      { $unwind: "$champion" }
    ])
    .toArray()) as RosterChampionRow[];
}

/**
 * The attackers picked on each held node, in the order they were picked.
 * A champion that has since left its holder's roster is dropped.
 */
async function loadAttackers(db: Db, held: AttackAssignmentDoc[]): Promise<AttackBoard["attackers"]> {
  const picked = held.filter((doc) => doc.attackers?.length);
  const attackers: AttackBoard["attackers"] = {};
  if (picked.length === 0) return attackers;

  const rows = await rosterRows(db, {
    userId: { $in: picked.map((doc) => doc.userId) },
    championId: { $in: picked.flatMap((doc) => doc.attackers!) }
  });
  const byKey = new Map(rows.map((row) => [`${row.userId}:${row.championId}`, row]));
  for (const doc of picked) {
    const champions = doc.attackers!
      .map((championId) => byKey.get(`${doc.userId}:${championId}`))
      .filter((row): row is RosterChampionRow => Boolean(row))
      .map(toAttackerChampion);
    if (champions.length) attackers[doc.slot] = champions;
  }
  return attackers;
}

export type AttackEditResult = { ok: true } | { ok: false; status: number; error: string };

function isDuplicateKey(err: unknown): boolean {
  return (err as MongoServerError | undefined)?.code === 11000;
}

/**
 * Puts a member on a slot, or clears it when userId is null.
 * Officers can set any slot. Everyone else can only take an empty upper-island
 * node for themselves, or leave a node they hold.
 */
export async function setAttackSlot(
  db: Db,
  {
    allianceId,
    mode,
    battlegroup,
    slot,
    userId,
    actorId,
    actorIsOfficer
  }: {
    allianceId: ObjectId;
    mode: WarMode;
    battlegroup: 1 | 2 | 3;
    slot: AttackSlot;
    userId: string | null;
    actorId: string;
    actorIsOfficer: boolean;
  }
): Promise<AttackEditResult> {
  const collection = db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS[mode]);
  const members = await loadMembers(db, allianceId, battlegroup);
  const memberIds = members.map((member) => new ObjectId(member.userId));
  const actor = new ObjectId(actorId);

  if (!actorIsOfficer) {
    if (isPathSlot(slot)) return { ok: false, status: 403, error: "Only officers can assign attack paths." };
    if (!members.some((member) => member.userId === actorId)) {
      return { ok: false, status: 403, error: `You're not in Battlegroup ${battlegroup}.` };
    }
    if (userId !== null && userId !== actorId) {
      return { ok: false, status: 403, error: "You can only pick a spot for yourself." };
    }
  }

  if (mode === "bigThings") {
    return setBigThingsSlot(db, { allianceId, battlegroup, slot, userId, actor, actorIsOfficer, members });
  }

  if (userId === null) {
    // Members can only leave their own spot.
    const filter = actorIsOfficer ? { allianceId, battlegroup, slot } : { allianceId, battlegroup, slot, userId: actor };
    await collection.deleteOne(filter);
    return { ok: true };
  }

  if (!members.some((member) => member.userId === userId)) {
    return { ok: false, status: 400, error: `That member isn't in Battlegroup ${battlegroup}.` };
  }
  const target = new ObjectId(userId);
  const doc = { allianceId, battlegroup, slot, userId: target, updatedBy: actor, updatedAt: new Date() };

  if (actorIsOfficer) {
    await collection.replaceOne({ allianceId, battlegroup, slot }, doc, { upsert: true });
  } else {
    // Only take the spot if it's free, already ours, or held by someone who
    // has left the battlegroup. A spot held by another member fails the filter,
    // and the upsert then hits the unique index.
    try {
      await collection.updateOne(
        { allianceId, battlegroup, slot, $or: [{ userId: target }, { userId: { $nin: memberIds } }] },
        { $set: doc },
        { upsert: true }
      );
    } catch (err) {
      if (isDuplicateKey(err)) {
        return { ok: false, status: 409, error: "Someone else already took that spot." };
      }
      throw err;
    }
  }

  // A member runs at most one attack path, so putting them on a new path takes
  // them off their old one. Upper-island spots have no limit.
  if (isPathSlot(slot)) {
    await collection.deleteMany({
      allianceId,
      battlegroup,
      userId: target,
      slot: { $in: PATHS.map(pathSlot).filter((other) => other !== slot) }
    });
  }
  return { ok: true };
}

/**
 * The Big Things version of setAttackSlot, after its permission checks. Each
 * node holds one member and each member holds one node, so putting a member on
 * a node moves them off their old one. When an officer drops a member onto a
 * node someone else holds, the two swap; if the member had no node, the other
 * person goes back to the list. Moving clears the attackers picked for a node.
 */
async function setBigThingsSlot(
  db: Db,
  {
    allianceId,
    battlegroup,
    slot,
    userId,
    actor,
    actorIsOfficer,
    members
  }: {
    allianceId: ObjectId;
    battlegroup: 1 | 2 | 3;
    slot: AttackSlot;
    userId: string | null;
    actor: ObjectId;
    actorIsOfficer: boolean;
    members: AttackMember[];
  }
): Promise<AttackEditResult> {
  const collection = db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS.bigThings);

  if (userId === null) {
    // Members can only clear their own node.
    const filter = actorIsOfficer ? { allianceId, battlegroup, slot } : { allianceId, battlegroup, slot, userId: actor };
    await collection.deleteOne(filter);
    return { ok: true };
  }

  if (!members.some((member) => member.userId === userId)) {
    return { ok: false, status: 400, error: `That member isn't in Battlegroup ${battlegroup}.` };
  }
  const target = new ObjectId(userId);
  const memberIds = new Set(members.map((member) => member.userId));
  const docs = await collection.find({ allianceId, battlegroup }).toArray();
  const current = docs.find((doc) => doc.slot === slot);
  // Someone who has left the battlegroup doesn't really hold the node.
  const occupant = current && memberIds.has(current.userId.toString()) ? current.userId : null;
  if (occupant?.equals(target)) return { ok: true };
  if (occupant && !actorIsOfficer) {
    return { ok: false, status: 409, error: "Someone else is already on that node." };
  }
  const previous = docs.find((doc) => doc.userId.equals(target));

  const now = new Date();
  const place = (onSlot: AttackSlot, member: ObjectId) =>
    collection.replaceOne(
      { allianceId, battlegroup, slot: onSlot },
      { allianceId, battlegroup, slot: onSlot, userId: member, attackers: [], updatedBy: actor, updatedAt: now },
      { upsert: true }
    );

  try {
    if (actorIsOfficer) {
      await place(slot, target);
    } else {
      // Only take the node if it's still free (or held by someone who left).
      // If another member took it meanwhile, the upsert hits the unique index.
      await collection.updateOne(
        { allianceId, battlegroup, slot, userId: { $nin: [...memberIds].map((id) => new ObjectId(id)) } },
        { $set: { allianceId, battlegroup, slot, userId: target, attackers: [], updatedBy: actor, updatedAt: now } },
        { upsert: true }
      );
    }
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: false, status: 409, error: "Someone else just took that node." };
    throw err;
  }
  await collection.deleteMany({ allianceId, battlegroup, userId: target, slot: { $ne: slot } });
  if (occupant && previous) await place(previous.slot, occupant);
  return { ok: true };
}

/** Which member holds a Big Things node, if they're still in the battlegroup. */
async function bigThingsHolder(db: Db, allianceId: ObjectId, battlegroup: number, slot: AttackSlot) {
  const doc = await db
    .collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS.bigThings)
    .findOne({ allianceId, battlegroup, slot });
  if (!doc) return null;
  const member = await db.collection("users").findOne({ _id: doc.userId, allianceId, battlegroup }, { projection: { _id: 1 } });
  return member ? doc.userId : null;
}

/**
 * The champions the holder of a Big Things node can pick as attackers: their
 * whole roster, strongest first. Only the holder and officers can see it.
 */
export async function loadNodeRoster(
  db: Db,
  { allianceId, battlegroup, slot, actorId, actorIsOfficer }: {
    allianceId: ObjectId;
    battlegroup: 1 | 2 | 3;
    slot: AttackSlot;
    actorId: string;
    actorIsOfficer: boolean;
  }
): Promise<{ ok: true; roster: AttackerChampion[] } | { ok: false; status: number; error: string }> {
  const holder = await bigThingsHolder(db, allianceId, battlegroup, slot);
  if (!holder) return { ok: false, status: 404, error: "Nobody is on that node." };
  if (!actorIsOfficer && holder.toString() !== actorId) {
    return { ok: false, status: 403, error: "Only this player and officers can pick their attackers." };
  }
  const roster = (await rosterRows(db, { userId: holder })).map(toAttackerChampion);
  roster.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.rank ?? 0) - (a.rank ?? 0) || a.name.localeCompare(b.name));
  return { ok: true, roster };
}

/** Sets the attackers for a Big Things node. The holder and officers can set them. */
export async function setNodeAttackers(
  db: Db,
  { allianceId, battlegroup, slot, championIds, actorId, actorIsOfficer }: {
    allianceId: ObjectId;
    battlegroup: 1 | 2 | 3;
    slot: AttackSlot;
    championIds: string[];
    actorId: string;
    actorIsOfficer: boolean;
  }
): Promise<AttackEditResult> {
  const holder = await bigThingsHolder(db, allianceId, battlegroup, slot);
  if (!holder) return { ok: false, status: 404, error: "Nobody is on that node." };
  if (!actorIsOfficer && holder.toString() !== actorId) {
    return { ok: false, status: 403, error: "Only this player and officers can pick their attackers." };
  }
  const unique = [...new Set(championIds)];
  if (unique.length > ATTACKERS_PER_NODE) {
    return { ok: false, status: 400, error: `Pick at most ${ATTACKERS_PER_NODE} attackers.` };
  }
  const ids = unique.map((id) => new ObjectId(id));
  const owned = await db.collection("rosterEntries").countDocuments({ userId: holder, championId: { $in: ids } });
  if (owned !== ids.length) return { ok: false, status: 400, error: "Attackers have to come from this player's roster." };

  await db
    .collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS.bigThings)
    .updateOne(
      { allianceId, battlegroup, slot, userId: holder },
      { $set: { attackers: ids, updatedBy: new ObjectId(actorId), updatedAt: new Date() } }
    );
  return { ok: true };
}
