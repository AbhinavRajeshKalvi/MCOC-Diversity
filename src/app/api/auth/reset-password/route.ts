import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { loginResponse, normalizeEmail } from "@/lib/accounts";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { hashResetCode } from "@/lib/password-reset";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().trim().email("Enter the email on your account."),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
  newPassword: z.string().min(8, "New password must be at least 8 characters.").max(200)
});

// Sets a new password with the emailed code, signs out every other device,
// and signs the member in.
export const POST = withErrorHandling("POST /api/auth/reset-password", async (req: NextRequest) => {
  if (!allowRequest(`reset:${clientIp(req.headers)}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { code, newPassword } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  const db = await getDb();
  const users = db.collection("users");
  const resets = db.collection("passwordResets");
  const invalid = NextResponse.json({ error: "That code is wrong or has expired. Request a new one." }, { status: 400 });

  const user = await users.findOne({ email });
  if (!user) return invalid;
  const reset = await resets.findOne({ userId: user._id, expiresAt: { $gt: new Date() } });
  if (!reset) return invalid;
  if (Number(reset.attempts ?? 0) >= MAX_ATTEMPTS) {
    await resets.deleteOne({ _id: reset._id });
    return NextResponse.json({ error: "Too many wrong codes. Request a new one." }, { status: 400 });
  }
  if (reset.codeHash !== hashResetCode(code)) {
    await resets.updateOne({ _id: reset._id }, { $inc: { attempts: 1 } });
    return invalid;
  }

  await resets.deleteMany({ userId: user._id });
  const updated = await users.findOneAndUpdate(
    { _id: user._id },
    {
      $set: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
      $inc: { sessionVersion: 1 }
    },
    { returnDocument: "after" }
  );
  return loginResponse(req, db, updated!);
});
