import type { Db } from "mongodb";
import { ObjectId } from "./db";
import { isWarMode, type WarMode } from "./war-mode";

/** The alliance's war mode. Defaults to regular until an officer changes it. */
export async function getWarMode(db: Db, allianceId: ObjectId): Promise<WarMode> {
  const doc = await db.collection("alliances").findOne({ _id: allianceId }, { projection: { warMode: 1 } });
  return isWarMode(doc?.warMode) ? doc.warMode : "regular";
}

export async function setWarMode(db: Db, allianceId: ObjectId, mode: WarMode, actorId: string): Promise<void> {
  await db
    .collection("alliances")
    .updateOne(
      { _id: allianceId },
      { $set: { warMode: mode, warModeUpdatedBy: new ObjectId(actorId), warModeUpdatedAt: new Date() } }
    );
}
