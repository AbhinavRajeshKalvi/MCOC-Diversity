import { cookies } from "next/headers";
import { SESSION_COOKIE, isOfficerRole, verifySession, type Role, type SessionPayload } from "./auth";
import { getDb, toObjectId } from "./db";

/**
 * Returns the signed-in user. The role and display name are read fresh from
 * the database so promotions, demotions and removals apply immediately rather
 * than when the login token expires.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;

  const userId = toObjectId(session.userId);
  if (!userId) return null;
  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ _id: userId }, { projection: { role: 1, displayName: 1 } });
  if (!user) return null;

  return { ...session, role: user.role as Role, displayName: user.displayName as string };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

/** Officers and the Leader. */
export async function requireOfficer(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isOfficerRole(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
