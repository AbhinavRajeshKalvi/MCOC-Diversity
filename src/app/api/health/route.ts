import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Lets the app (and Render) check the server is up without signing in.
// `?warm=1` also connects to the database and runs its start-up work, which is
// what a keep-alive ping should call so the first real visit after a quiet
// spell isn't slow.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("warm")) {
    try {
      await getDb();
    } catch (err) {
      console.error("Health check couldn't reach the database:", err);
      return NextResponse.json({ ok: false, db: false }, { status: 503 });
    }
    return NextResponse.json({ ok: true, db: true });
  }
  return NextResponse.json({ ok: true });
}
