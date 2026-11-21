import type { Db, MongoServerError } from "mongodb";
import { ObjectId } from "./db";
import {
  ATTACKERS_PER_NODE,
  PATHS,
  UPPER_NODES,
  isPathSlot,
  isUpperNodeSlot,
  nodeSlot,
  pathSlot,
  type AttackBoard,
  type AttackerChampion,
  type AttackMember,
  type AttackSlot,
  type TakeoverRequest
} from "./attack-map";
import { lastAttackReset } from "./attack-reset";
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
  /** Regular nodes 37-50 only: the champion from the holder's roster they plan to use. */
  championId?: ObjectId | null;
  updatedBy: ObjectId;
  updatedAt: Date;
};

/** Open requests to take over a booked regular-map node. */
export const TAKEOVER_REQUESTS = "attackTakeoverRequests";

type TakeoverRequestDoc = {
  allianceId: ObjectId;
  battlegroup: number;
  slot: AttackSlot;
  requesterId: ObjectId;
  /** Who held the node when asked; the request lapses if that changes. */
  holderId: ObjectId;
  championId: ObjectId | null;
  createdAt: Date;
};

const UPPER_SLOTS = UPPER_NODES.map(nodeSlot);

/**
 * Clears regular-map bookings on nodes 37-50 (and requests for them) made
 * before the latest war reset. Paths are left alone. Called before every read
 * and change, so the reset happens on time without a scheduled job.
 */
export async function clearExpiredBookings(db: Db, allianceId: ObjectId): Promise<void> {
  const last = lastAttackReset();
  if (!last) return;
  await Promise.all([
    db
      .collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS.regular)
      .deleteMany({
        allianceId,
        slot: { $in: UPPER_SLOTS },
        $or: [{ updatedAt: { $lt: last } }, { updatedAt: { $exists: false } }]
      }),
    db.collection<TakeoverRequestDoc>(TAKEOVER_REQUESTS).deleteMany({ allianceId, createdAt: { $lt: last } })
  ]);
}

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
  if (mode === "regular") await clearExpiredBookings(db, allianceId);
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
  if (mode !== "bigThings") {
    const [champions, requests] = await Promise.all([
      loadBookedChampions(db, held),
      loadTakeoverRequests(db, allianceId, battlegroup, held, byId)
    ]);
    return { battlegroup, members, assignments, champions, requests };
  }
  return { battlegroup, members, assignments, attackers: await loadAttackers(db, held) };
}

/** The champion each booked node's holder picked, if it's still on their roster. */
async function loadBookedChampions(db: Db, held: AttackAssignmentDoc[]): Promise<AttackBoard["champions"]> {
  const picked = held.filter((doc) => doc.championId && isUpperNodeSlot(doc.slot));
  const champions: AttackBoard["champions"] = {};
  if (picked.length === 0) return champions;
  const rows = await rosterRows(db, {
    userId: { $in: picked.map((doc) => doc.userId) },
    championId: { $in: picked.map((doc) => doc.championId!) }
  });
  const byKey = new Map(rows.map((row) => [`${row.userId}:${row.championId}`, row]));
  for (const doc of picked) {
    const row = byKey.get(`${doc.userId}:${doc.championId}`);
    if (row) champions[doc.slot] = toAttackerChampion(row);
  }
  return champions;
}

/**
 * Open takeover requests in a battlegroup. A request whose node has changed
 * hands, or whose requester has left the battlegroup, has lapsed and is deleted.
 */
async function loadTakeoverRequests(
  db: Db,
  allianceId: ObjectId,
  battlegroup: number,
  held: AttackAssignmentDoc[],
  members: Map<string, AttackMember>
): Promise<TakeoverRequest[]> {
  const collection = db.collection<TakeoverRequestDoc>(TAKEOVER_REQUESTS);
  const docs = await collection.find({ allianceId, battlegroup }).sort({ createdAt: 1 }).toArray();
  if (docs.length === 0) return [];
  const holderOf = new Map(held.map((doc) => [doc.slot, doc.userId.toString()]));
  const live = docs.filter(
    (doc) => holderOf.get(doc.slot) === doc.holderId.toString() && members.has(doc.requesterId.toString())
  );
  const lapsed = docs.filter((doc) => !live.includes(doc));
  if (lapsed.length) await collection.deleteMany({ _id: { $in: lapsed.map((doc) => (doc as { _id: ObjectId })._id) } });

  const withChampion = live.filter((doc) => doc.championId);
  const rows = withChampion.length
    ? await rosterRows(db, {
        userId: { $in: withChampion.map((doc) => doc.requesterId) },
        championId: { $in: withChampion.map((doc) => doc.championId!) }
      })
    : [];
  const byKey = new Map(rows.map((row) => [`${row.userId}:${row.championId}`, row]));
  return live.map((doc) => {
    const row = doc.championId ? byKey.get(`${doc.requesterId}:${doc.championId}`) : undefined;
    return {
      id: (doc as { _id: ObjectId })._id.toString(),
      slot: doc.slot,
      requester: members.get(doc.requesterId.toString())!,
      holderId: doc.holderId.toString(),
      champion: row ? toAttackerChampion(row) : null,
      createdAt: doc.createdAt.toISOString()
    };
  });
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

/** What setAttackSlot did, so the caller can tell the alliance about a new booking. */
export type AttackSlotResult =
  | { ok: true; booked: boolean }
  | { ok: false; status: number; error: string };

function isDuplicateKey(err: unknown): boolean {
  return (err as MongoServerError | undefined)?.code === 11000;
}

async function ownsChampion(db: Db, userId: ObjectId, championId: ObjectId): Promise<boolean> {
  return (await db.collection("rosterEntries").countDocuments({ userId, championId }, { limit: 1 })) > 0;
}

/**
 * Puts a member on a slot, or clears it when userId is null.
 * Officers can set any slot. Everyone else can only book an empty node 37-50
 * for themselves (optionally saying which champion they'll use), change the
 * champion on their own booking, or leave a node they hold.
 * `moveFrom` (officers dragging a name from one node to another) clears the
 * member off that other node too.
 */
export async function setAttackSlot(
  db: Db,
  {
    allianceId,
    mode,
    battlegroup,
    slot,
    userId,
    championId = null,
    moveFrom = null,
    actorId,
    actorIsOfficer
  }: {
    allianceId: ObjectId;
    mode: WarMode;
    battlegroup: 1 | 2 | 3;
    slot: AttackSlot;
    userId: string | null;
    championId?: string | null;
    moveFrom?: AttackSlot | null;
    actorId: string;
    actorIsOfficer: boolean;
  }
): Promise<AttackSlotResult> {
  const collection = db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS[mode]);
  if (mode === "regular") await clearExpiredBookings(db, allianceId);
  const members = await loadMembers(db, allianceId, battlegroup);
  const memberIds = members.map((member) => new ObjectId(member.userId));
  const actor = new ObjectId(actorId);

  if (!actorIsOfficer) {
    if (isPathSlot(slot)) return { ok: false, status: 403, error: "Only officers can assign attack paths." };
    if (!members.some((member) => member.userId === actorId)) {
      return { ok: false, status: 403, error: `You're not in Battlegroup ${battlegroup}.` };
    }
    if (userId !== null && userId !== actorId) {
      return { ok: false, status: 403, error: "You can only book a node for yourself." };
    }
  }

  const previous = await collection.findOne({ allianceId, battlegroup, slot });
  const wasHeldBy = previous && memberIds.some((id) => id.equals(previous.userId)) ? previous.userId.toString() : null;

  if (mode === "bigThings") {
    const result = await setBigThingsSlot(db, { allianceId, battlegroup, slot, userId, actor, actorIsOfficer, members });
    return result.ok ? { ok: true, booked: userId !== null && wasHeldBy !== userId } : result;
  }

  const requests = db.collection<TakeoverRequestDoc>(TAKEOVER_REQUESTS);

  if (userId === null) {
    // Members can only leave their own spot.
    const filter = actorIsOfficer ? { allianceId, battlegroup, slot } : { allianceId, battlegroup, slot, userId: actor };
    const removed = await collection.deleteOne(filter);
    if (removed.deletedCount) await requests.deleteMany({ allianceId, battlegroup, slot });
    return { ok: true, booked: false };
  }

  if (!members.some((member) => member.userId === userId)) {
    return { ok: false, status: 400, error: `That member isn't in Battlegroup ${battlegroup}.` };
  }
  const target = new ObjectId(userId);

  let champion: ObjectId | null = null;
  if (championId) {
    if (!isUpperNodeSlot(slot)) return { ok: false, status: 400, error: "Only nodes 37-50 take a champion." };
    champion = new ObjectId(championId);
    if (!(await ownsChampion(db, target, champion))) {
      return { ok: false, status: 400, error: "That champion isn't on this player's roster." };
    }
  }
  const doc = {
    allianceId,
    battlegroup,
    slot,
    userId: target,
    ...(isUpperNodeSlot(slot) ? { championId: champion } : {}),
    updatedBy: actor,
    updatedAt: new Date()
  };

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
        return {
          ok: false,
          status: 409,
          error: "Someone else already booked that node. Tap it to ask them for it."
        };
      }
      throw err;
    }
  }

  // Requests were made to the old holder, so they lapse when the node changes hands.
  if (wasHeldBy !== userId) await requests.deleteMany({ allianceId, battlegroup, slot });

  // A member runs at most one attack path, so putting them on a new path takes
  // them off their old one. Upper-island spots have no limit.
  if (isPathSlot(slot)) {
    await collection.deleteMany({
      allianceId,
      battlegroup,
      userId: target,
      slot: { $in: PATHS.map(pathSlot).filter((other) => other !== slot) }
    });
  } else if (moveFrom && moveFrom !== slot && isUpperNodeSlot(moveFrom)) {
    const moved = await collection.deleteOne({ allianceId, battlegroup, slot: moveFrom, userId: target });
    if (moved.deletedCount) await requests.deleteMany({ allianceId, battlegroup, slot: moveFrom });
  }
  return { ok: true, booked: isUpperNodeSlot(slot) && wasHeldBy !== userId };
}

export type TakeoverResult =
  | { ok: true; holderId: ObjectId }
  | { ok: false; status: number; error: string };

/**
 * Asks the member holding a booked node (37-50) to hand it over, optionally
 * saying which champion the requester would use. Asking again replaces the
 * earlier request.
 */
export async function requestTakeover(
  db: Db,
  {
    allianceId,
    battlegroup,
    slot,
    actorId,
    championId
  }: { allianceId: ObjectId; battlegroup: 1 | 2 | 3; slot: AttackSlot; actorId: string; championId: string | null }
): Promise<TakeoverResult> {
  if (!isUpperNodeSlot(slot)) return { ok: false, status: 400, error: "Only nodes 37-50 can be booked." };
  await clearExpiredBookings(db, allianceId);
  const members = await loadMembers(db, allianceId, battlegroup);
  if (!members.some((member) => member.userId === actorId)) {
    return { ok: false, status: 403, error: `You're not in Battlegroup ${battlegroup}.` };
  }
  const held = await db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS.regular).findOne({ allianceId, battlegroup, slot });
  const holder = held && members.some((member) => member.userId === held.userId.toString()) ? held.userId : null;
  if (!holder) return { ok: false, status: 409, error: "Nobody has booked that node any more. You can book it yourself." };
  if (holder.toString() === actorId) return { ok: false, status: 400, error: "You already hold that node." };

  const requester = new ObjectId(actorId);
  let champion: ObjectId | null = null;
  if (championId) {
    champion = new ObjectId(championId);
    if (!(await ownsChampion(db, requester, champion))) {
      return { ok: false, status: 400, error: "That champion isn't on your roster." };
    }
  }
  await db.collection<TakeoverRequestDoc>(TAKEOVER_REQUESTS).updateOne(
    { allianceId, battlegroup, slot, requesterId: requester },
    { $set: { holderId: holder, championId: champion, createdAt: new Date() } },
    { upsert: true }
  );
  return { ok: true, holderId: holder };
}

export type TakeoverAnswer = "accept" | "decline" | "cancel";

export type TakeoverAnswerResult =
  | { ok: true; battlegroup: 1 | 2 | 3; slot: AttackSlot; requesterId: ObjectId; holderId: ObjectId }
  | { ok: false; status: number; error: string };

/**
 * The holder accepts or declines a takeover request, or the requester
 * withdraws it. Accepting hands the node to the requester, with the champion
 * they said they'd use, and closes every other request for that node.
 */
export async function answerTakeover(
  db: Db,
  {
    allianceId,
    requestId,
    answer,
    actorId
  }: { allianceId: ObjectId; requestId: ObjectId; answer: TakeoverAnswer; actorId: string }
): Promise<TakeoverAnswerResult> {
  await clearExpiredBookings(db, allianceId);
  const requests = db.collection<TakeoverRequestDoc>(TAKEOVER_REQUESTS);
  const request = await requests.findOne({ _id: requestId, allianceId });
  if (!request) return { ok: false, status: 404, error: "That request has already been answered or has lapsed." };
  const battlegroup = request.battlegroup as 1 | 2 | 3;
  const done = { ok: true as const, battlegroup, slot: request.slot, requesterId: request.requesterId, holderId: request.holderId };

  if (answer === "cancel") {
    if (request.requesterId.toString() !== actorId) {
      return { ok: false, status: 403, error: "Only the player who asked can withdraw this request." };
    }
    await requests.deleteOne({ _id: requestId });
    return done;
  }

  if (request.holderId.toString() !== actorId) {
    return { ok: false, status: 403, error: "Only the player holding the node can answer this request." };
  }
  if (answer === "decline") {
    await requests.deleteOne({ _id: requestId });
    return done;
  }

  const requesterStillHere = await db
    .collection("users")
    .findOne({ _id: request.requesterId, allianceId, battlegroup }, { projection: { _id: 1 } });
  if (!requesterStillHere) {
    await requests.deleteOne({ _id: requestId });
    return { ok: false, status: 409, error: "That player isn't in this battlegroup any more." };
  }
  const champion =
    request.championId && (await ownsChampion(db, request.requesterId, request.championId)) ? request.championId : null;
  const handed = await db.collection<AttackAssignmentDoc>(ATTACK_ASSIGNMENTS.regular).updateOne(
    { allianceId, battlegroup, slot: request.slot, userId: request.holderId },
    {
      $set: {
        userId: request.requesterId,
        championId: champion,
        updatedBy: new ObjectId(actorId),
        updatedAt: new Date()
      }
    }
  );
  // Every request for the node was made to the old holder, so all of them close.
  await requests.deleteMany({ allianceId, battlegroup, slot: request.slot });
  if (handed.matchedCount === 0) {
    return { ok: false, status: 409, error: "You don't hold that node any more." };
  }
  return done;
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
