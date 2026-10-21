import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { verifyPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { clearSessionCookies, loadAllianceFor, normalizeEmail, toPublicUser } from "@/lib/accounts";
import { leaveAlliance } from "@/lib/alliances";

const patchSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your in-game name.").max(60).optional(),
  email: z.string().trim().email("Enter a valid email address.").max(200).optional()
});

// Members update their own in-game name and email (used for password resets).
export const PATCH = withErrorHandling("PATCH /api/account", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid change." }, { status: 400 });
  }
  const set: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) set.displayName = parsed.data.displayName;
  if (parsed.data.email !== undefined) set.email = normalizeEmail(parsed.data.email);

  const db = await getDb();
  const users = db.collection("users");
  try {
    const user = await users.findOneAndUpdate(
      { _id: new ObjectId(session.userId) },
      { $set: set },
      { returnDocument: "after" }
    );
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ user: toPublicUser(user), alliance: await loadAllianceFor(db, user) });
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "Another account already uses that email." }, { status: 409 });
    }
    throw err;
  }
});

const deleteSchema = z.object({ password: z.string().optional() });

// Deletes the member's own account and roster. Required for Play Store apps
// that let people create accounts.
export const DELETE = withErrorHandling("DELETE /api/account", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const db = await getDb();
  const users = db.collection("users");
  const user = await users.findOne({ _id: new ObjectId(session.userId) });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (user.passwordHash && !verifyPassword(parsed.data.password ?? "", user.passwordHash)) {
    return NextResponse.json({ error: "Enter your current password to delete your account." }, { status: 401 });
  }

  const left = await leaveAlliance(db, user);
  if (!left.ok) return NextResponse.json({ error: left.error }, { status: 409 });

  await db.collection("rosterEntries").deleteMany({ userId: user._id });
  await db.collection("passwordResets").deleteMany({ userId: user._id });
  await db.collection("chatMessages").deleteMany({ userId: user._id });
  await users.deleteOne({ _id: user._id });
  return clearSessionCookies(NextResponse.json({ ok: true }));
});
