import type { Db } from "mongodb";
import { ObjectId } from "./db";
import type { Role } from "./roles";

export type AllianceMember = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  battlegroup: 1 | 2 | 3 | null;
  mustChangePassword: boolean;
};

export const MAX_ALLIANCE_MEMBERS = 30;
export const MAX_BATTLEGROUP_MEMBERS = 10;

export async function listAllianceMembers(db: Db, allianceId: ObjectId): Promise<AllianceMember[]> {
  const docs = await db.collection("users").find({ allianceId }).sort({ displayName: 1 }).toArray();
  return docs.map((u) => ({
    id: u._id.toString(),
    username: u.username as string,
    displayName: u.displayName as string,
    role: u.role as Role,
    battlegroup: (u.battlegroup as 1 | 2 | 3 | null) ?? null,
    mustChangePassword: Boolean(u.mustChangePassword)
  }));
}

type DefenderOverrideDoc = { userId?: ObjectId | null; blockedUserIds?: string[] };

/**
 * Takes a member out of their alliance: they keep their account and roster
 * but lose their role, battlegroup and any placements in the alliance's plans.
 */
export async function detachFromAlliance(db: Db, allianceId: ObjectId, userId: ObjectId): Promise<void> {
  await db
    .collection("users")
    .updateOne({ _id: userId, allianceId }, { $set: { allianceId: null, role: "member", battlegroup: null } });
  await clearMemberPlans(db, allianceId, userId);
}

/** Removes a member from every saved plan in their alliance. */
export async function clearMemberPlans(db: Db, allianceId: ObjectId, userId: ObjectId): Promise<void> {
  const ids = { $in: [userId, userId.toString()] };
  await Promise.all([
    db.collection("defenderOverrides").deleteMany({ allianceId, userId }),
    db
      .collection<DefenderOverrideDoc>("defenderOverrides")
      .updateMany({ allianceId }, { $pull: { blockedUserIds: userId.toString() } }),
    db.collection("suggestedDefenderAssignments").deleteMany({ allianceId, userId: ids }),
    db.collection("currentDefenderAssignments").deleteMany({ allianceId, userId: ids }),
    db.collection("bigThingsSuggestedDefenderAssignments").deleteMany({ allianceId, userId: ids }),
    db.collection("bigThingsCurrentDefenderAssignments").deleteMany({ allianceId, userId: ids }),
    db.collection("attackAssignments").deleteMany({ allianceId, userId }),
    db.collection("bigThingsAttackAssignments").deleteMany({ allianceId, userId }),
    db.collection("bigThingsDefenderNodes").deleteMany({ allianceId, userId })
  ]);
}
