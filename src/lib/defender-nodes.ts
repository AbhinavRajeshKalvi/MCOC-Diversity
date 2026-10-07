import type { Db } from "mongodb";
import { ObjectId } from "./db";

// Big Things defender placement: which of the map's 10 nodes each member's
// defender sits on. One member per node and one node per member.
export const DEFENDER_NODES = "bigThingsDefenderNodes";

type DefenderNodeDoc = {
  battlegroup: number;
  node: number;
  userId: ObjectId;
  updatedBy: ObjectId;
  updatedAt: Date;
};

/** Member id to node for one battlegroup. Placements of members who have left are dropped. */
export async function loadDefenderNodes(db: Db, battlegroup: number): Promise<Record<string, number>> {
  const [members, docs] = await Promise.all([
    db.collection("users").find({ battlegroup }, { projection: { _id: 1 } }).toArray(),
    db.collection<DefenderNodeDoc>(DEFENDER_NODES).find({ battlegroup }).toArray()
  ]);
  const memberIds = new Set(members.map((member) => member._id.toString()));
  const nodes: Record<string, number> = {};
  for (const doc of docs) {
    const userId = doc.userId.toString();
    if (memberIds.has(userId)) nodes[userId] = doc.node;
  }
  return nodes;
}

/**
 * Puts a member's defender on a node, or clears the node when userId is null.
 * The member leaves any node they held, and whoever held the new node loses it.
 */
export async function setDefenderNode(
  db: Db,
  { battlegroup, node, userId, actorId }: { battlegroup: number; node: number; userId: string | null; actorId: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const collection = db.collection<DefenderNodeDoc>(DEFENDER_NODES);

  if (userId === null) {
    await collection.deleteOne({ battlegroup, node });
    return { ok: true };
  }

  const target = new ObjectId(userId);
  const member = await db.collection("users").findOne({ _id: target, battlegroup }, { projection: { _id: 1 } });
  if (!member) return { ok: false, status: 400, error: `That member isn't in Battlegroup ${battlegroup}.` };

  await collection.deleteMany({ battlegroup, userId: target, node: { $ne: node } });
  await collection.replaceOne(
    { battlegroup, node },
    { battlegroup, node, userId: target, updatedBy: new ObjectId(actorId), updatedAt: new Date() },
    { upsert: true }
  );
  return { ok: true };
}
