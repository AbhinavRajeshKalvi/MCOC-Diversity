import { NextResponse } from "next/server";

// Lets the app (and Render) check the server is up without signing in.
export function GET() {
  return NextResponse.json({ ok: true });
}
