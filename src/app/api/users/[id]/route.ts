import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { hashPassword, DEFAULT_PASSWORD } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

type DefenderOverrideDoc = { userId?: ObjectId | null; blockedUserIds?: string[] };

const schema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  role: z.enum(["leader", "officer", "member"]).optional(),
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional(),
  resetPassword: z.boolean().optional()
});

export const PATCH = withErrorHandling(
  "PATCH /api/users/[id]",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const officer = await requireOfficer().catch(() => null);
    if (!officer) return NextResponse.json({ error: "Officers only." }, { status: 403 });
    const actorIsLeader = officer.role === "leader";

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
    const targetRole = target.role as "leader" | "officer" | "member";
    const isSelf = params.id === officer.userId;

    let transferLeadershipFrom: ObjectId | null = null;
    if (role !== undefined && role !== targetRole) {
      if (targetRole === "leader") {
        return NextResponse.json(
          { error: "The Leader can't be demoted. Hand leadership to another member first." },
          { status: 403 }
        );
      }
      if (role === "leader") {
        // Leadership is handed over by the current Leader, who becomes an
        // officer. If nobody is Leader yet, any officer may appoint one.
        const currentLeader = await users.findOne({ role: "leader" }, { projection: { _id: 1 } });
        if (currentLeader && !actorIsLeader) {
          return NextResponse.json({ error: "Only the Leader can hand over leadership." }, { status: 403 });
        }
        if (currentLeader) transferLeadershipFrom = currentLeader._id;
      }
      if (targetRole === "officer" && role === "member" && !actorIsLeader && !isSelf) {
        return NextResponse.json({ error: "Only the Leader can remove an officer." }, { status: 403 });
      }
      if (isSelf && role === "member") {
        const officerCount = await users.countDocuments({ role: { $in: ["officer", "leader"] } });
        if (officerCount <= 1) {
          return NextResponse.json(
            { error: "You're the only officer — promote someone else first." },
            { status: 400 }
          );
        }
      }
    }

    if (resetPassword && targetRole !== "member" && !actorIsLeader) {
      return NextResponse.json(
        { error: "Only the Leader can reset an officer's or the Leader's password." },
        { status: 403 }
      );
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

    // Step the old Leader down first so there's never more than one.
    if (transferLeadershipFrom) {
      await users.updateOne({ _id: transferLeadershipFrom }, { $set: { role: "officer" } });
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
    if (target.role === "leader") {
      return NextResponse.json({ error: "The Leader can't be removed." }, { status: 403 });
    }
    if (target.role === "officer" && officer.role !== "leader") {
      return NextResponse.json({ error: "Only the Leader can remove an officer." }, { status: 403 });
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
