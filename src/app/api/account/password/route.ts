import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters.")
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
  if (!row || !verifyPassword(parsed.data.currentPassword, row.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const newHash = hashPassword(parsed.data.newPassword);
  await users.updateOne(
    { _id: userId },
    { $set: { passwordHash: newHash, mustChangePassword: false } }
  );

  // End the session so the user signs in again with the new password.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
