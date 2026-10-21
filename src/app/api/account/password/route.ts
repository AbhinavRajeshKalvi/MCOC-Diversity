import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { clearSessionCookies, isMobileClient, loginResponse } from "@/lib/accounts";

const schema = z.object({
  // Not needed when the account has no password yet (Google sign-in only).
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters.").max(200)
});

export const POST = withErrorHandling("POST /api/account/password", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const db = await getDb();
  const users = db.collection("users");
  const userId = new ObjectId(session.userId);

  const row = await users.findOne({ _id: userId }, { projection: { passwordHash: 1 } });
  if (!row) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (row.passwordHash && !verifyPassword(parsed.data.currentPassword ?? "", row.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  // Bumping the session version signs out every other device.
  const updated = await users.findOneAndUpdate(
    { _id: userId },
    { $set: { passwordHash: hashPassword(parsed.data.newPassword), mustChangePassword: false }, $inc: { sessionVersion: 1 } },
    { returnDocument: "after" }
  );

  // The app stays signed in with a fresh token; the website signs in again.
  if (isMobileClient(req)) return loginResponse(req, db, updated!);
  return clearSessionCookies(NextResponse.json({ ok: true }));
});
