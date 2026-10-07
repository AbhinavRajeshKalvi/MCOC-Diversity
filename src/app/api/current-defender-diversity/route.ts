import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { publishSuggested } from "@/lib/defender-plans";
import { withErrorHandling } from "@/lib/api-handler";
import { getWarMode } from "@/lib/war-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  action: z.literal("publish-suggested"),
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  // Left out, it is the alliance's current war mode.
  mode: z.enum(["regular", "bigThings"]).optional()
});

export const POST = withErrorHandling(
  "POST /api/current-defender-diversity",
  async (req: NextRequest) => {
    await requireOfficer();

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid current defender update." }, { status: 400 });
    }

    const { battlegroup } = parsed.data;
    const db = await getDb();
    const mode = parsed.data.mode ?? (await getWarMode(db));
    // Replace the persisted current list with exactly the saved suggested plan.
    const assigned = await publishSuggested(db, battlegroup, mode);
    return NextResponse.json({ ok: true, battlegroup, assigned });
  }
);
