import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { autoSuggest, clearMemberDefenders, editSuggestedPlan } from "@/lib/defender-plans";
import { withErrorHandling } from "@/lib/api-handler";
import { getWarMode } from "@/lib/war-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const battlegroupSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
// Which war mode's plan to edit. Left out, it is the alliance's current mode.
const modeSchema = z.enum(["regular", "bigThings"]).optional();

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("auto-suggest"),
    battlegroup: battlegroupSchema,
    mode: modeSchema
  }),
  z.object({
    action: z.literal("assign"),
    battlegroup: battlegroupSchema,
    mode: modeSchema,
    championId: z.string().min(1),
    fromUserId: z.string().min(1).nullable(),
    toUserId: z.string().min(1),
    replaceChampionId: z.string().min(1).nullable().optional()
  }),
  z.object({
    action: z.literal("remove"),
    battlegroup: battlegroupSchema,
    mode: modeSchema,
    championId: z.string().min(1),
    fromUserId: z.string().min(1)
  }),
  z.object({
    action: z.literal("clear"),
    battlegroup: battlegroupSchema,
    mode: modeSchema,
    userId: z.string().min(1)
  })
]);

// Edits the saved suggested defender plan. The plan never re-shuffles on its
// own; it only changes through these edits or an explicit auto-suggest.
export const POST = withErrorHandling(
  "POST /api/defender-assignments",
  async (req: NextRequest) => {
    await requireOfficer();

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid defender reassignment." }, { status: 400 });
    }

    const { battlegroup, mode: requestedMode, ...edit } = parsed.data;
    const db = await getDb();
    const mode = requestedMode ?? (await getWarMode(db));

    if (edit.action === "auto-suggest") {
      const assigned = await autoSuggest(db, battlegroup, mode);
      return NextResponse.json({ ok: true, battlegroup, assigned });
    }

    if (edit.action === "clear") {
      const cleared = await clearMemberDefenders(db, battlegroup, edit.userId, mode);
      return NextResponse.json({ ok: true, battlegroup, cleared });
    }

    const result = await editSuggestedPlan(db, battlegroup, edit, mode);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }
);
