import type { Db } from "mongodb";
import { ObjectId } from "./db";
import { isWarMode, type WarMode } from "./war-mode";

const SETTINGS = "allianceSettings";
const WAR_MODE_ID = "warMode";

type WarModeDoc = { _id: string; mode: WarMode; updatedBy?: ObjectId; updatedAt?: Date };

/** The alliance-wide war mode. Defaults to regular until an officer changes it. */
export async function getWarMode(db: Db): Promise<WarMode> {
  const doc = await db.collection<WarModeDoc>(SETTINGS).findOne({ _id: WAR_MODE_ID });
  return isWarMode(doc?.mode) ? doc.mode : "regular";
}

export async function setWarMode(db: Db, mode: WarMode, actorId: string): Promise<void> {
  await db
    .collection<WarModeDoc>(SETTINGS)
    .updateOne(
      { _id: WAR_MODE_ID },
      { $set: { mode, updatedBy: new ObjectId(actorId), updatedAt: new Date() } },
      { upsert: true }
    );
}
