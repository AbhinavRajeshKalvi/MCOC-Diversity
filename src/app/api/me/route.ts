import { NextResponse } from "next/server";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { loadAllianceFor, toPublicUser } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/** The signed-in member and their alliance (null until they create or join one). */
export const GET = withErrorHandling("GET /api/me", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  return NextResponse.json({ user: toPublicUser(user), alliance: await loadAllianceFor(db, user) });
});
