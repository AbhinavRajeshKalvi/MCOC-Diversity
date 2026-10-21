import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./roles";

// Signing and checking login tokens. Kept free of Node-only packages so the
// middleware (which runs on the edge runtime) can import it.

/** What the signed login token carries. Role and alliance are re-read from the database on each request. */
export type TokenPayload = {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
  /** Bumped on password change/reset; older tokens stop working. */
  sessionVersion?: number;
};

const COOKIE_NAME = "mcoc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const HANDOFF_TTL_SECONDS = 60;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random value in .env.local (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    // Handoff tokens are only good for /api/auth/handoff.
    if (payload.typ === "handoff") return null;
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * A one-minute token the mobile app swaps for a session cookie inside its web
 * views (see /api/auth/handoff), so the long-lived token never sits in a URL.
 */
export async function signHandoff(userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ userId, sessionVersion, typ: "handoff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HANDOFF_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyHandoff(token: string): Promise<{ userId: string; sessionVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.typ !== "handoff" || typeof payload.userId !== "string") return null;
    return { userId: payload.userId, sessionVersion: Number(payload.sessionVersion ?? 0) };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
/** Set inside the mobile app's web views so pages hide the web navigation. */
export const EMBED_COOKIE = "mcoc_embed";

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}
