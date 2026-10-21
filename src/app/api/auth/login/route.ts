import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { CASE_INSENSITIVE, loginResponse, normalizeEmail } from "@/lib/accounts";
import { allowRequest, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  // A username or an email address.
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export const POST = withErrorHandling("POST /api/auth/login", async (req: NextRequest) => {
  if (!allowRequest(`login:${clientIp(req.headers)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many sign-in attempts. Wait a few minutes and try again." }, { status: 429 });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Enter your username or email and your password." }, { status: 400 });
  }
  const { username, password } = body.data;

  const db = await getDb();
  const users = db.collection("users");
  const user = username.includes("@")
    ? await users.findOne({ email: normalizeEmail(username) })
    : await users.findOne({ username }, { collation: CASE_INSENSITIVE });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    const googleOnly = user && !user.passwordHash && user.googleId;
    return NextResponse.json(
      { error: googleOnly ? "This account uses Google sign-in." : "Incorrect username or password." },
      { status: 401 }
    );
  }

  return loginResponse(req, db, user);
});
