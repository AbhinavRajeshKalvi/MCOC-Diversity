import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { USERNAME_RULE, isFirstAccount, loginResponse, normalizeEmail } from "@/lib/accounts";
import { allowRequest, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Usernames need at least 3 characters.")
    .max(32, "Usernames can be at most 32 characters.")
    .regex(USERNAME_RULE, "Use letters, numbers, dots, dashes or underscores in your username."),
  displayName: z.string().trim().min(1, "Enter your in-game name.").max(60),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  password: z.string().min(8, "Passwords need at least 8 characters.").max(200)
});

// Anyone can create an account. New accounts aren't in an alliance until they
// create one or join one with a code.
export const POST = withErrorHandling("POST /api/auth/signup", async (req: NextRequest) => {
  if (!allowRequest(`signup:${clientIp(req.headers)}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many new accounts from this network. Try again later." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Check your details." }, { status: 400 });
  }
  const { username, displayName, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  const db = await getDb();
  const first = await isFirstAccount(db);
  try {
    const doc = {
      username,
      displayName,
      email,
      passwordHash: hashPassword(password),
      role: "member" as const,
      allianceId: null,
      battlegroup: null,
      gameDataEditor: first,
      mustChangePassword: false,
      sessionVersion: 0,
      createdAt: new Date()
    };
    const result = await db.collection("users").insertOne(doc);
    return loginResponse(req, db, { ...doc, _id: result.insertedId }, 201);
  } catch (err: any) {
    if (err?.code === 11000) {
      const field = err?.keyPattern?.email ? "email" : "username";
      return NextResponse.json(
        { error: field === "email" ? "An account with that email already exists." : "That username is already taken." },
        { status: 409 }
      );
    }
    throw err;
  }
});
