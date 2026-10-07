import type { Db, MongoServerError } from "mongodb";
import { ObjectId } from "./db";
import { PATHS, isPathSlot, pathSlot, type AttackBoard, type AttackMember, type AttackSlot } from "./attack-map";
import type { WarMode } from "./war-mode";

// Each war mode has its own map, so each keeps its own assignments.
export const ATTACK_ASSIGNMENTS: Record<WarMode, string> = {
  regular: "attackAssignments",
  bigThings: "bigThingsAttackAssignments"
};

type AttackAssignmentDoc = {
  battlegroup: number;
  slot: AttackSlot;
  userId: ObjectId;
  updatedBy: ObjectId;
  updatedAt: Date;
};

async function loadMembers(db: Db, battlegroup: number): Promise<AttackMember[]> {
  const users = await db
    .collection("users")
    .find({ battlegroup }, { projection: { displayName: 1 } })
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
  battlegroup: 1 | 2 | 3,
  mode: WarMode = "regular"
): Promise<AttackBoard> {
  const [members, docs] = await Promise.all([
    loadMembers(db, battlegroup),
    db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS[mode]).find({ battlegroup }).toArray()
  ]);
  const byId = new Map(members.map((member) => [member.userId, member]));
  const assignments: AttackBoard["assignments"] = {};
  for (const doc of docs) {
    const member = byId.get(doc.userId.toString());
    if (member) assignments[doc.slot] = member;
  }
  return { battlegroup, members, assignments };
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
    mode,
    battlegroup,
    slot,
    userId,
    actorId,
    actorIsOfficer
  }: {
    mode: WarMode;
    battlegroup: 1 | 2 | 3;
    slot: AttackSlot;
    userId: string | null;
    actorId: string;
    actorIsOfficer: boolean;
  }
): Promise<AttackEditResult> {
  const collection = db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS[mode]);
  const members = await loadMembers(db, battlegroup);
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

  if (userId === null) {
    // Members can only leave their own spot.
    const filter = actorIsOfficer ? { battlegroup, slot } : { battlegroup, slot, userId: actor };
    await collection.deleteOne(filter);
    return { ok: true };
  }

  if (!members.some((member) => member.userId === userId)) {
    return { ok: false, status: 400, error: `That member isn't in Battlegroup ${battlegroup}.` };
  }
  const target = new ObjectId(userId);
  const doc = { battlegroup, slot, userId: target, updatedBy: actor, updatedAt: new Date() };

  if (actorIsOfficer) {
    await collection.replaceOne({ battlegroup, slot }, doc, { upsert: true });
  } else {
    // Only take the spot if it's free, already ours, or held by someone who
    // has left the battlegroup. A spot held by another member fails the filter,
    // and the upsert then hits the unique index.
    try {
      await collection.updateOne(
        { battlegroup, slot, $or: [{ userId: target }, { userId: { $nin: memberIds } }] },
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
      battlegroup,
      userId: target,
      slot: { $in: PATHS.map(pathSlot).filter((other) => other !== slot) }
    });
  }
  return { ok: true };
}
