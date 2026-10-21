import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { listAllianceMembers } from "@/lib/members";

// Members join with the alliance code and create their own accounts, so there
// is no way for officers to create accounts here.
export const GET = withErrorHandling("GET /api/users", async () => {
  const session = await requireOfficer().catch(() => null);
  if (!session) return NextResponse.json({ error: "Officers only." }, { status: 403 });

  const db = await getDb();
  return NextResponse.json({ users: await listAllianceMembers(db, session.alliance) });
});
