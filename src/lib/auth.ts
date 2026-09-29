import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

import type { Role } from "./roles";

export type { Role } from "./roles";
export { isOfficerRole, isLeaderOrAbove } from "./roles";

export type SessionPayload = {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
};

const COOKIE_NAME = "mcoc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a long random value in .env.local (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
export const DEFAULT_PASSWORD = "12345678";
