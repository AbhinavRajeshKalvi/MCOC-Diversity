import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { loadAllianceFor, toPublicUser } from "@/lib/accounts";
import { MAX_ALLIANCE_MEMBERS } from "@/lib/members";
import { allowRequest } from "@/lib/rate-limit";

const schema = z.object({ code: z.string().trim().min(4).max(16) });

// Joins the alliance whose code the Leader shared. New members join as members
// with no battlegroup; officers place them.
export const POST = withErrorHandling("POST /api/alliances/join", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (session.allianceId) {
    return NextResponse.json({ error: "Leave your current alliance before joining another." }, { status: 409 });
  }
  if (!allowRequest(`join:${session.userId}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the alliance code." }, { status: 400 });

  const code = parsed.data.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const db = await getDb();
  const alliance = await db.collection("alliances").findOne({ code });
  if (!alliance) {
    return NextResponse.json({ error: "No alliance has that code. Check it with your Leader." }, { status: 404 });
  }
  const memberCount = await db.collection("users").countDocuments({ allianceId: alliance._id });
  if (memberCount >= MAX_ALLIANCE_MEMBERS) {
    return NextResponse.json({ error: `${alliance.name} is full (${MAX_ALLIANCE_MEMBERS} members).` }, { status: 409 });
  }

  const user = await db
    .collection("users")
    .findOneAndUpdate(
      { _id: new ObjectId(session.userId), allianceId: null },
      { $set: { allianceId: alliance._id, role: "member", battlegroup: null } },
      { returnDocument: "after" }
    );
  if (!user) {
    return NextResponse.json({ error: "Leave your current alliance before joining another." }, { status: 409 });
  }
  return NextResponse.json({ user: toPublicUser(user), alliance: await loadAllianceFor(db, user) });
});
