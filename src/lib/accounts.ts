import { NextRequest, NextResponse } from "next/server";
import type { Db, WithId, Document } from "mongodb";
import { EMBED_COOKIE, SESSION_COOKIE, sessionCookieOptions, signSession, type Role } from "./auth";
import { ObjectId } from "./db";
import { isOfficerRole } from "./roles";
import { isWarMode, type WarMode } from "./war-mode";

export const USERNAME_RULE = /^[a-zA-Z0-9_.-]+$/;
export const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  battlegroup: 1 | 2 | 3 | null;
  allianceId: string | null;
  gameDataEditor: boolean;
  mustChangePassword: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
};

export function toPublicUser(user: WithId<Document>): PublicUser {
  return {
    id: user._id.toString(),
    username: user.username as string,
    displayName: user.displayName as string,
    email: (user.email as string | undefined) ?? null,
    role: user.role as Role,
    battlegroup: (user.battlegroup as 1 | 2 | 3 | null) ?? null,
    allianceId: user.allianceId ? String(user.allianceId) : null,
    gameDataEditor: Boolean(user.gameDataEditor),
    mustChangePassword: Boolean(user.mustChangePassword),
    hasPassword: Boolean(user.passwordHash),
    googleLinked: Boolean(user.googleId)
  };
}

export type PublicAlliance = {
  id: string;
  name: string;
  /** The join code. Only officers and above see it. */
  code: string | null;
  warMode: WarMode;
  memberCount: number;
};

export async function loadAllianceFor(db: Db, user: WithId<Document>): Promise<PublicAlliance | null> {
  if (!user.allianceId) return null;
  const alliance = await db.collection("alliances").findOne({ _id: user.allianceId as ObjectId });
  if (!alliance) return null;
  const memberCount = await db.collection("users").countDocuments({ allianceId: alliance._id });
  return {
    id: alliance._id.toString(),
    name: alliance.name as string,
    code: isOfficerRole(user.role as string) ? (alliance.code as string) : null,
    warMode: isWarMode(alliance.warMode) ? alliance.warMode : "regular",
    memberCount
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The mobile app sends this header and gets its token in the response body instead of relying on cookies. */
export function isMobileClient(req: NextRequest): boolean {
  return req.headers.get("x-client") === "mobile";
}

/**
 * Signs the user in: sets the web session cookie and, for the mobile app,
 * also returns the token so it can store it and send it as a Bearer header.
 */
export async function loginResponse(req: NextRequest, db: Db, user: WithId<Document>, status = 200) {
  const token = await signSession({
    userId: user._id.toString(),
    username: user.username as string,
    displayName: user.displayName as string,
    role: user.role as Role,
    mustChangePassword: Boolean(user.mustChangePassword),
    sessionVersion: Number(user.sessionVersion ?? 0)
  });
  const body = {
    ok: true,
    mustChangePassword: Boolean(user.mustChangePassword),
    user: toPublicUser(user),
    alliance: await loadAllianceFor(db, user),
    ...(isMobileClient(req) ? { token } : {})
  };
  const res = NextResponse.json(body, { status });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(EMBED_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** A username nobody has yet, based on `base` (used for Google sign-ups). */
export async function freeUsername(db: Db, base: string): Promise<string> {
  const cleaned = base.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 24) || "player";
  const stem = cleaned.length >= 3 ? cleaned : `${cleaned}player`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? stem : `${stem}${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await db.collection("users").findOne({ username: candidate }, { collation: CASE_INSENSITIVE });
    if (!taken) return candidate;
  }
  return `${stem}${Date.now().toString(36)}`;
}

/** The first account ever created may edit the shared champion list and counters. */
export async function isFirstAccount(db: Db): Promise<boolean> {
  return (await db.collection("users").estimatedDocumentCount()) === 0;
}
