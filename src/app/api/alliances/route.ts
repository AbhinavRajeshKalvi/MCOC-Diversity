import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { loadAllianceFor, toPublicUser } from "@/lib/accounts";
import { createAlliance } from "@/lib/alliances";

const allianceName = z
  .string()
  .trim()
  .min(2, "Alliance names need at least 2 characters.")
  .max(40, "Alliance names can be at most 40 characters.");

const schema = z.object({ name: allianceName });

// Creates an alliance; the creator becomes its Leader.
export const POST = withErrorHandling("POST /api/alliances", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (session.allianceId) {
    return NextResponse.json({ error: "Leave your current alliance before creating a new one." }, { status: 409 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Enter an alliance name." }, { status: 400 });
  }

  const db = await getDb();
  const userId = new ObjectId(session.userId);
  const allianceId = await createAlliance(db, parsed.data.name, userId);
  const user = await db
    .collection("users")
    .findOneAndUpdate(
      { _id: userId, allianceId: null },
      { $set: { allianceId, role: "leader", battlegroup: null } },
      { returnDocument: "after" }
    );
  if (!user) {
    await db.collection("alliances").deleteOne({ _id: allianceId });
    return NextResponse.json({ error: "Leave your current alliance before creating a new one." }, { status: 409 });
  }
  return NextResponse.json({ user: toPublicUser(user), alliance: await loadAllianceFor(db, user) }, { status: 201 });
});
