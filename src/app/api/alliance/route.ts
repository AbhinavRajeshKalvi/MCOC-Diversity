import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { isLeaderOrAbove } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { loadAllianceFor } from "@/lib/accounts";
import { listAllianceMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

// The member's alliance and its member list. Everyone in the alliance can see
// who's in it; only officers and above see the join code.
export const GET = withErrorHandling("GET /api/alliance", async () => {
  const session = await requireAlliance();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
  return NextResponse.json({
    alliance: await loadAllianceFor(db, user!),
    members: await listAllianceMembers(db, session.alliance)
  });
});

const schema = z.object({
  name: z.string().trim().min(2, "Alliance names need at least 2 characters.").max(40)
});

// The Leader (or Admin) renames the alliance.
export const PATCH = withErrorHandling("PATCH /api/alliance", async (req: NextRequest) => {
  const session = await requireAlliance();
  if (!isLeaderOrAbove(session.role)) {
    return NextResponse.json({ error: "Only the Leader can rename the alliance." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Enter a name." }, { status: 400 });
  }
  const db = await getDb();
  await db.collection("alliances").updateOne({ _id: session.alliance }, { $set: { name: parsed.data.name } });
  const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
  return NextResponse.json({ alliance: await loadAllianceFor(db, user!) });
});
