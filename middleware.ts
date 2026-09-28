import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const isPasswordPage =
    pathname === "/account/password" || pathname === "/api/account/password";

  if (session.mustChangePassword && !isPasswordPage && pathname !== "/api/auth/logout") {
    return NextResponse.redirect(new URL("/account/password", req.url));
  }

  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/api/users") || pathname.startsWith("/api/champions");
  if (isAdminPath && session.role !== "officer" && req.method !== "GET") {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }
  if (pathname.startsWith("/admin") && session.role !== "officer") {
    return NextResponse.redirect(new URL("/profile", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
