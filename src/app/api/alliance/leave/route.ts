import { NextResponse } from "next/server";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { loadAllianceFor, toPublicUser } from "@/lib/accounts";
import { leaveAlliance } from "@/lib/alliances";

export const POST = withErrorHandling("POST /api/alliance/leave", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const db = await getDb();
  const users = db.collection("users");
  const user = await users.findOne({ _id: new ObjectId(session.userId) });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const result = await leaveAlliance(db, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  const updated = await users.findOne({ _id: user._id });
  return NextResponse.json({
    ok: true,
    allianceDeleted: result.allianceDeleted,
    user: toPublicUser(updated!),
    alliance: await loadAllianceFor(db, updated!)
  });
});
