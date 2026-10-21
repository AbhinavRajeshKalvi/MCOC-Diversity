import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isOfficerRole, verifySession, type Role, type SessionPayload } from "./auth";
import { getDb, ObjectId, toObjectId } from "./db";

/** The login token from the session cookie (web) or an `Authorization: Bearer` header (mobile app). */
export function readToken(): string | null {
  const auth = headers().get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Returns the signed-in user. The role, alliance and display name are read
 * fresh from the database so promotions, demotions, removals and password
 * changes apply immediately rather than when the login token expires.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = readToken();
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;

  const userId = toObjectId(session.userId);
  if (!userId) return null;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { _id: userId },
    {
      projection: {
        role: 1,
        displayName: 1,
        username: 1,
        allianceId: 1,
        gameDataEditor: 1,
        mustChangePassword: 1,
        sessionVersion: 1
      }
    }
  );
  if (!user) return null;
  if (Number(user.sessionVersion ?? 0) !== Number(session.sessionVersion ?? 0)) return null;

  return {
    ...session,
    username: user.username as string,
    role: user.role as Role,
    displayName: user.displayName as string,
    mustChangePassword: Boolean(user.mustChangePassword),
    allianceId: user.allianceId ? String(user.allianceId) : null,
    gameDataEditor: Boolean(user.gameDataEditor)
  };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

export type AllianceSession = SessionPayload & { allianceId: string; alliance: ObjectId };

/** A signed-in member of an alliance. */
export async function requireAlliance(): Promise<AllianceSession> {
  const session = await requireSession();
  if (!session.allianceId) throw new Error("NO_ALLIANCE");
  return { ...session, allianceId: session.allianceId, alliance: new ObjectId(session.allianceId) };
}

/** Officers, the Leader and the Admin of the member's alliance. */
export async function requireOfficer(): Promise<AllianceSession> {
  const session = await requireAlliance();
  if (!isOfficerRole(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Members allowed to edit the shared champion list and counters. */
export async function requireGameDataEditor(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!session.gameDataEditor) throw new Error("FORBIDDEN");
  return session;
}

/**
 * For server-rendered pages: a signed-in member of an alliance, or a redirect
 * to sign in, change a default password, or create/join an alliance first.
 */
export async function requirePageSession(): Promise<AllianceSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/account/password");
  if (!session.allianceId) redirect("/alliance");
  return { ...session, allianceId: session.allianceId, alliance: new ObjectId(session.allianceId) };
}
