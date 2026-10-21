import type { Db, Document, WithId } from "mongodb";
import { ALLIANCE_SCOPED_COLLECTIONS, ObjectId, generateAllianceCode } from "./db";
import { detachFromAlliance } from "./members";

/** Inserts an alliance with a fresh join code, retrying on the rare code clash. */
export async function createAlliance(db: Db, name: string, creatorId: ObjectId): Promise<ObjectId> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await db.collection("alliances").insertOne({
        name,
        code: generateAllianceCode(),
        warMode: "regular",
        createdBy: creatorId,
        createdAt: new Date()
      });
      return result.insertedId;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error("Couldn't create a unique alliance code. Try again.");
}

/** Gives the alliance a new join code; the old one stops working. */
export async function regenerateCode(db: Db, allianceId: ObjectId): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateAllianceCode();
    try {
      await db.collection("alliances").updateOne({ _id: allianceId }, { $set: { code, codeUpdatedAt: new Date() } });
      return code;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error("Couldn't create a unique alliance code. Try again.");
}

async function deleteAlliance(db: Db, allianceId: ObjectId) {
  for (const name of ALLIANCE_SCOPED_COLLECTIONS) {
    await db.collection(name).deleteMany({ allianceId });
  }
  await db.collection("alliances").deleteOne({ _id: allianceId });
}

/**
 * Takes a member out of their alliance. The Leader and the Admin must hand
 * their role to someone else first, unless they're the last member, in which
 * case the alliance and its plans are deleted.
 */
export async function leaveAlliance(
  db: Db,
  user: WithId<Document>
): Promise<{ ok: true; allianceDeleted: boolean } | { ok: false; error: string }> {
  const allianceId = user.allianceId as ObjectId | null | undefined;
  if (!allianceId) return { ok: true, allianceDeleted: false };

  const others = await db.collection("users").countDocuments({ allianceId, _id: { $ne: user._id } });
  if (others === 0) {
    await detachFromAlliance(db, allianceId, user._id);
    await deleteAlliance(db, allianceId);
    return { ok: true, allianceDeleted: true };
  }
  if (user.role === "leader" || user.role === "admin") {
    const title = user.role === "leader" ? "Leader" : "Admin";
    return {
      ok: false,
      error: `You're the ${title}. Make another member ${title} first (in the member list), then leave.`
    };
  }
  await detachFromAlliance(db, allianceId, user._id);
  return { ok: true, allianceDeleted: false };
}
