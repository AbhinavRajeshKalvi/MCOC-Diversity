import { NextRequest, NextResponse } from "next/server";
import { getDb, toObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  EMBED_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
  signHandoff,
  signSession,
  verifyHandoff,
  type Role
} from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

// The mobile app shows the planner pages in web views. It asks for a
// one-minute handoff token here (with its Bearer token)...
export const POST = withErrorHandling("POST /api/auth/handoff", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  return NextResponse.json({ handoff: await signHandoff(session.userId, Number(session.sessionVersion ?? 0)) });
});

/** Only same-site paths, so the handoff can't be used to bounce people to another site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/battlegroups";
}

// ...then opens /api/auth/handoff?t=...&next=/battlegroups in the web view,
// which sets the web session cookie plus the embed cookie that hides the web
// navigation, and redirects to the page.
export const GET = withErrorHandling("GET /api/auth/handoff", async (req: NextRequest) => {
  const handoff = await verifyHandoff(req.nextUrl.searchParams.get("t") ?? "");
  const userId = handoff ? toObjectId(handoff.userId) : null;
  const db = userId ? await getDb() : null;
  const user = userId && db ? await db.collection("users").findOne({ _id: userId }) : null;

  if (!handoff || !user || Number(user.sessionVersion ?? 0) !== handoff.sessionVersion) {
    return NextResponse.redirect(new URL("/login?expired=1", req.url));
  }

  const token = await signSession({
    userId: user._id.toString(),
    username: user.username as string,
    displayName: user.displayName as string,
    role: user.role as Role,
    mustChangePassword: Boolean(user.mustChangePassword),
    sessionVersion: Number(user.sessionVersion ?? 0)
  });
  const res = NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  res.cookies.set(EMBED_COOKIE, "1", sessionCookieOptions());
  return res;
});
