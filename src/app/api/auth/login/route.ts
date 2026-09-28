import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const POST = withErrorHandling("POST /api/auth/login", async (req: NextRequest) => {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Enter a username and password." }, { status: 400 });
  }
  const { username, password } = body.data;

  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ username }, { collation: { locale: "en", strength: 2 } });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const token = await signSession({
    userId: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword)
  });

  const res = NextResponse.json({ ok: true, mustChangePassword: Boolean(user.mustChangePassword) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
  return res;
});
