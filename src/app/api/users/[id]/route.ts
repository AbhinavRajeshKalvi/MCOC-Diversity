import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { isLeaderOrAbove, type Role } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { MAX_BATTLEGROUP_MEMBERS, detachFromAlliance } from "@/lib/members";

type DefenderOverrideDoc = { userId?: ObjectId | null; blockedUserIds?: string[] };

// Officers manage roles and battlegroups within their own alliance. Passwords
// are only ever changed or reset by the account's owner.

const schema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  role: z.enum(["admin", "leader", "officer", "member"]).optional(),
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional()
});

function forbidden(error: string) {
  return NextResponse.json({ error }, { status: 403 });
}

export const PATCH = withErrorHandling(
  "PATCH /api/users/[id]",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const officer = await requireOfficer().catch(() => null);
    if (!officer) return NextResponse.json({ error: "Officers only." }, { status: 403 });
    const actorIsAdmin = officer.role === "admin";
    const actorIsLeaderOrAbove = isLeaderOrAbove(officer.role);

    const userId = toObjectId(params.id);
    if (!userId) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update." }, { status: 400 });
    }
    const { displayName, role, battlegroup } = parsed.data;
    const allianceId = officer.alliance;

    const db = await getDb();
    const users = db.collection("users");

    const target = await users.findOne({ _id: userId, allianceId }, { projection: { role: 1, battlegroup: 1 } });
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const targetRole = target.role as Role;
    const isSelf = params.id === officer.userId;
    const roleChange = role !== undefined && role !== targetRole;

    // Nobody but the Admin can change the Admin's role.
    if (targetRole === "admin" && !isSelf && roleChange) {
      return forbidden("Only the Admin can change their own role.");
    }
    if (displayName !== undefined && !isSelf && !actorIsLeaderOrAbove) {
      return forbidden("Only the Leader can rename other members.");
    }

    // Role changes that must happen before this member's, in order, so there
    // is never more than one Admin or Leader at a time.
    const stepDowns: { id: ObjectId; role: Role }[] = [];

    if (roleChange && role === "admin") {
      // Only the Admin can make someone Admin. It's a handover: the Admin
      // becomes Leader and the existing Leader (if any) becomes an officer.
      if (!actorIsAdmin) return forbidden("Only the Admin can make someone else Admin.");
      const currentLeader = await users.findOne({ allianceId, role: "leader" }, { projection: { _id: 1 } });
      if (currentLeader) stepDowns.push({ id: currentLeader._id, role: "officer" });
      stepDowns.push({ id: new ObjectId(officer.userId), role: "leader" });
    } else if (roleChange) {
      if (targetRole === "leader" && !actorIsAdmin) {
        return forbidden("The Leader can't be demoted. Hand leadership to another member first.");
      }
      if (role === "leader") {
        // Leadership is handed over by the Leader (or the Admin); the old
        // Leader becomes an officer. If nobody is Leader yet, any officer may
        // appoint one.
        const currentLeader = await users.findOne({ allianceId, role: "leader" }, { projection: { _id: 1 } });
        if (currentLeader && !actorIsLeaderOrAbove) {
          return forbidden("Only the Leader or the Admin can hand over leadership.");
        }
        if (currentLeader) stepDowns.push({ id: currentLeader._id, role: "officer" });
      }
      if (targetRole === "officer" && role === "member" && !actorIsLeaderOrAbove && !isSelf) {
        return forbidden("Only the Leader or the Admin can remove an officer.");
      }
      if (isSelf && role === "member") {
        const officerCount = await users.countDocuments({ allianceId, role: { $in: ["officer", "leader", "admin"] } });
        if (officerCount <= 1) {
          return NextResponse.json(
            { error: "You're the only officer — promote someone else first." },
            { status: 400 }
          );
        }
      }
    }

    if (battlegroup !== undefined && battlegroup !== null && target.battlegroup !== battlegroup) {
      const memberCount = await users.countDocuments({ allianceId, battlegroup });
      if (memberCount >= MAX_BATTLEGROUP_MEMBERS) {
        return NextResponse.json(
          { error: `Battlegroup ${battlegroup} is full. Each battlegroup can have at most ${MAX_BATTLEGROUP_MEMBERS} members.` },
          { status: 400 }
        );
      }
    }

    const set: Record<string, unknown> = {};
    if (displayName !== undefined) set.displayName = displayName;
    if (role !== undefined) set.role = role;
    if (battlegroup !== undefined) set.battlegroup = battlegroup;

    for (const step of stepDowns) {
      await users.updateOne({ _id: step.id, allianceId }, { $set: { role: step.role } });
    }
    if (Object.keys(set).length > 0) {
      await users.updateOne({ _id: userId, allianceId }, { $set: set });
    }

    // A Battlegroup defender override only makes sense while the member is
    // in that Battlegroup. Clear stale forced assignments and blocked-slot
    // references whenever an officer moves a member to another group or
    // removes them from a group.
    if (battlegroup !== undefined) {
      const overrides = db.collection<DefenderOverrideDoc>("defenderOverrides");
      await overrides.deleteMany({ allianceId, battlegroup: { $ne: battlegroup }, userId });
      await overrides.updateMany(
        { allianceId },
        { $pull: { blockedUserIds: userId.toString() } }
      );
    }

    return NextResponse.json({ ok: true });
  }
);

// Removes a member from the alliance. Their account and roster are kept, so
// they can join another alliance (or rejoin with the code).
export const DELETE = withErrorHandling(
  "DELETE /api/users/[id]",
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const officer = await requireOfficer().catch(() => null);
    if (!officer) return NextResponse.json({ error: "Officers only." }, { status: 403 });

    if (params.id === officer.userId) {
      return NextResponse.json({ error: "Use Leave alliance to remove yourself." }, { status: 400 });
    }

    const userId = toObjectId(params.id);
    if (!userId) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const db = await getDb();
    const target = await db
      .collection("users")
      .findOne({ _id: userId, allianceId: officer.alliance }, { projection: { role: 1 } });
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (target.role === "admin") {
      return NextResponse.json({ error: "The Admin can't be removed." }, { status: 403 });
    }
    if (target.role === "leader" && officer.role !== "admin") {
      return NextResponse.json({ error: "Only the Admin can remove the Leader." }, { status: 403 });
    }
    if (target.role === "officer" && !isLeaderOrAbove(officer.role)) {
      return NextResponse.json({ error: "Only the Leader or the Admin can remove an officer." }, { status: 403 });
    }

    await detachFromAlliance(db, officer.alliance, userId);
    return NextResponse.json({ ok: true });
  }
);
