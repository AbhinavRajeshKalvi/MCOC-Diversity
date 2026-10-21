import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { withErrorHandling } from "@/lib/api-handler";
import { freeUsername, isFirstAccount, loginResponse, normalizeEmail } from "@/lib/accounts";

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const schema = z.object({ idToken: z.string().min(20) });

function googleClientIds(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

// Signs in with a Google ID token from the app. A Google account whose email
// matches an existing account is linked to it; otherwise a new account is made.
export const POST = withErrorHandling("POST /api/auth/google", async (req: NextRequest) => {
  const audience = googleClientIds();
  if (audience.length === 0) {
    return NextResponse.json({ error: "Google sign-in isn't set up on this server." }, { status: 503 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing Google token." }, { status: 400 });

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(parsed.data.idToken, GOOGLE_KEYS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience
    }));
  } catch {
    return NextResponse.json({ error: "Google sign-in failed. Try again." }, { status: 401 });
  }

  const googleId = String(claims.sub ?? "");
  const email = typeof claims.email === "string" ? normalizeEmail(claims.email) : null;
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!googleId) return NextResponse.json({ error: "Google sign-in failed. Try again." }, { status: 401 });

  const db = await getDb();
  const users = db.collection("users");

  let user = await users.findOne({ googleId });
  if (!user && email && emailVerified) {
    user = await users.findOneAndUpdate({ email }, { $set: { googleId } }, { returnDocument: "after" });
  }
  if (user) return loginResponse(req, db, user);

  const first = await isFirstAccount(db);
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 60) : null;
  const doc = {
    username: await freeUsername(db, email ? email.split("@")[0] : name ?? "player"),
    displayName: name ?? (email ? email.split("@")[0] : "Player"),
    email: emailVerified ? email : null,
    googleId,
    passwordHash: null,
    role: "member" as const,
    allianceId: null,
    battlegroup: null,
    gameDataEditor: first,
    mustChangePassword: false,
    sessionVersion: 0,
    createdAt: new Date()
  };
  const result = await users.insertOne(doc);
  return loginResponse(req, db, { ...doc, _id: result.insertedId }, 201);
});
