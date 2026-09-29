import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { hashPassword, DEFAULT_PASSWORD, isLeaderOrAbove, type Role } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

type DefenderOverrideDoc = { userId?: ObjectId | null; blockedUserIds?: string[] };

const schema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  role: z.enum(["admin", "leader", "officer", "member"]).optional(),
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional(),
  resetPassword: z.boolean().optional()
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
    const { displayName, role, battlegroup, resetPassword } = parsed.data;

    const db = await getDb();
    const users = db.collection("users");

    const target = await users.findOne({ _id: userId }, { projection: { role: 1, battlegroup: 1 } });
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    const targetRole = target.role as Role;
    const isSelf = params.id === officer.userId;
    const roleChange = role !== undefined && role !== targetRole;

    // Nobody but the Admin can change the Admin's role or reset their password.
    if (targetRole === "admin" && !isSelf && (roleChange || resetPassword)) {
      return forbidden("Only the Admin can change their own role or password.");
    }

    // Role changes that must happen before this member's, in order, so there
    // is never more than one Admin or Leader at a time.
    const stepDowns: { id: ObjectId; role: Role }[] = [];

    if (roleChange && role === "admin") {
      // Only the Admin can make someone Admin. It's a handover: the Admin
      // becomes Leader and the existing Leader (if any) becomes an officer.
      if (!actorIsAdmin) return forbidden("Only the Admin can make someone else Admin.");
      const currentLeader = await users.findOne({ role: "leader" }, { projection: { _id: 1 } });
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
        const currentLeader = await users.findOne({ role: "leader" }, { projection: { _id: 1 } });
        if (currentLeader && !actorIsLeaderOrAbove) {
          return forbidden("Only the Leader or the Admin can hand over leadership.");
        }
        if (currentLeader) stepDowns.push({ id: currentLeader._id, role: "officer" });
      }
      if (targetRole === "officer" && role === "member" && !actorIsLeaderOrAbove && !isSelf) {
        return forbidden("Only the Leader or the Admin can remove an officer.");
      }
      if (isSelf && role === "member") {
        const officerCount = await users.countDocuments({ role: { $in: ["officer", "leader", "admin"] } });
        if (officerCount <= 1) {
          return NextResponse.json(
            { error: "You're the only officer — promote someone else first." },
            { status: 400 }
          );
        }
      }
    }

    if (resetPassword && targetRole !== "member" && !actorIsLeaderOrAbove) {
      return forbidden("Only the Leader or the Admin can reset an officer's password.");
    }

    if (battlegroup !== undefined && battlegroup !== null && target.battlegroup !== battlegroup) {
      const memberCount = await users.countDocuments({ battlegroup });
      if (memberCount >= 10) {
        return NextResponse.json(
          { error: `Battlegroup ${battlegroup} is full. Each battlegroup can have at most 10 members.` },
          { status: 400 }
        );
      }
    }

    const set: Record<string, unknown> = {};
    if (displayName !== undefined) set.displayName = displayName;
    if (role !== undefined) set.role = role;
    if (battlegroup !== undefined) set.battlegroup = battlegroup;
    if (resetPassword) {
      set.passwordHash = hashPassword(DEFAULT_PASSWORD);
      set.mustChangePassword = true;
    }

    for (const step of stepDowns) {
      await users.updateOne({ _id: step.id }, { $set: { role: step.role } });
    }
    if (Object.keys(set).length > 0) {
      await users.updateOne({ _id: userId }, { $set: set });
    }

    // A Battlegroup defender override only makes sense while the member is
    // in that Battlegroup. Clear stale forced assignments and blocked-slot
    // references whenever an officer moves a member to another group or
    // removes them from a group.
    if (battlegroup !== undefined) {
      const overrides = db.collection<DefenderOverrideDoc>("defenderOverrides");
      await overrides.deleteMany({ battlegroup: { $ne: battlegroup }, userId });
      await overrides.updateMany(
        {},
        { $pull: { blockedUserIds: userId.toString() } }
      );
    }

    return NextResponse.json({ ok: true, defaultPassword: resetPassword ? DEFAULT_PASSWORD : undefined });
  }
);

export const DELETE = withErrorHandling(
  "DELETE /api/users/[id]",
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const officer = await requireOfficer().catch(() => null);
    if (!officer) return NextResponse.json({ error: "Officers only." }, { status: 403 });

    if (params.id === officer.userId) {
      return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
    }

    const userId = toObjectId(params.id);
    if (!userId) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const db = await getDb();
    const target = await db.collection("users").findOne({ _id: userId }, { projection: { role: 1 } });
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

    const result = await db.collection("users").deleteOne({ _id: userId });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    await db.collection("rosterEntries").deleteMany({ userId });
    await db.collection("defenderOverrides").deleteMany({ userId });
    await db.collection<DefenderOverrideDoc>("defenderOverrides").updateMany(
      {},
      { $pull: { blockedUserIds: userId.toString() } }
    );

    return NextResponse.json({ ok: true });
  }
);
