import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/token";

// Pages and API routes anyone can open without signing in.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/privacy",
  "/delete-account",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/google",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/handoff",
  "/api/health"
];

// Origins allowed to call the API from a browser, e.g. the app's web build
// during development (CORS_ORIGINS=http://localhost:8081). The Android app
// doesn't need this.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin");
  if (origin && CORS_ORIGINS.includes(origin) && req.nextUrl.pathname.startsWith("/api/")) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Client");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export async function middleware(req: NextRequest) {
  return withCors(req, await route(req));
}

async function route(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) return new NextResponse(null, { status: 204 });

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // The website uses the session cookie; the mobile app sends a Bearer token.
  const auth = req.headers.get("authorization");
  const token = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isApi) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const passwordChangeAllowed =
    pathname === "/account/password" ||
    pathname === "/api/account/password" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/me" ||
    pathname === "/api/account";

  if (session.mustChangePassword && !passwordChangeAllowed) {
    if (isApi) return NextResponse.json({ error: "Set a new password first." }, { status: 403 });
    return NextResponse.redirect(new URL("/account/password", req.url));
  }

  // Role, alliance and password-version checks happen in the pages and API
  // routes, which read the member's current details from the database; the
  // details inside the token can be stale.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
