import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { withErrorHandling } from "@/lib/api-handler";
import { normalizeEmail } from "@/lib/accounts";
import { sendEmail } from "@/lib/email";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { RESET_CODE_MINUTES, hashResetCode } from "@/lib/password-reset";

const schema = z.object({ email: z.string().trim().email("Enter the email on your account.") });

// Emails a 6-digit code the member types into the app to set a new password.
// The answer is the same whether or not the email has an account, so this
// can't be used to find out who has one.
export const POST = withErrorHandling("POST /api/auth/forgot-password", async (req: NextRequest) => {
  if (!allowRequest(`forgot:${clientIp(req.headers)}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many reset requests. Wait a few minutes and try again." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Enter your email." }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const db = await getDb();
  const user = await db.collection("users").findOne({ email }, { projection: { _id: 1, displayName: 1 } });

  if (user) {
    const resets = db.collection("passwordResets");
    // One email a minute per account at most.
    const recent = await resets.findOne({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 60_000) } });
    if (!recent) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await resets.deleteMany({ userId: user._id });
      await resets.insertOne({
        userId: user._id,
        codeHash: hashResetCode(code),
        attempts: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + RESET_CODE_MINUTES * 60_000)
      });
      await sendEmail({
        to: email,
        subject: `War Room password reset code: ${code}`,
        text:
          `Hi ${user.displayName},\n\n` +
          `Your War Room password reset code is ${code}. It expires in ${RESET_CODE_MINUTES} minutes.\n\n` +
          `If you didn't ask to reset your password, you can ignore this email.`
      });
    }
  }

  return NextResponse.json({
    ok: true,
    message: "If that email has an account, a reset code is on its way. Check your inbox and spam folder."
  });
});
