import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { isLeaderOrAbove } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { regenerateCode } from "@/lib/alliances";

// The Leader (or Admin) replaces the join code, e.g. after it was shared too widely.
export const POST = withErrorHandling("POST /api/alliance/code", async () => {
  const session = await requireAlliance();
  if (!isLeaderOrAbove(session.role)) {
    return NextResponse.json({ error: "Only the Leader can change the alliance code." }, { status: 403 });
  }
  const code = await regenerateCode(await getDb(), session.alliance);
  return NextResponse.json({ code });
});
