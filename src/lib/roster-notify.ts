import type { Db } from "mongodb";
import type { ObjectId } from "./db";
import { notifyAllianceMembers } from "./push";

// A roster is often edited a champion at a time, so the alliance hears about
// one member's roster at most once in this window.
const ROSTER_NOTIFY_WINDOW_MS = 30 * 60 * 1000;

/** Tells the alliance that a member's roster changed. `actorId` is who made the change. */
export async function notifyRosterUpdated(db: Db, ownerId: ObjectId, actorId: string): Promise<void> {
  try {
    const now = new Date();
    const owner = await db.collection("users").findOneAndUpdate(
      {
        _id: ownerId,
        allianceId: { $exists: true, $ne: null },
        $or: [
          { lastRosterNotifiedAt: { $exists: false } },
          { lastRosterNotifiedAt: { $lt: new Date(now.getTime() - ROSTER_NOTIFY_WINDOW_MS) } }
        ]
      },
      { $set: { lastRosterNotifiedAt: now } },
      { projection: { allianceId: 1, displayName: 1 } }
    );
    if (!owner) return;
    const name = owner.displayName as string;
    notifyAllianceMembers(
      db,
      "roster",
      { allianceId: owner.allianceId as ObjectId, exclude: [ownerId, actorId] },
      {
        title: "Roster update",
        body: `${name} updated their roster.`,
        url: "/alliance",
        tag: `roster-${String(ownerId)}`
      }
    );
  } catch (err) {
    console.error("[push] roster notification failed:", err);
  }
}
