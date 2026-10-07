import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { isValidSlot } from "@/lib/attack-map";
import { loadAttackBoard, setAttackSlot } from "@/lib/attack-plans";
import { withErrorHandling } from "@/lib/api-handler";
import { getWarMode } from "@/lib/war-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  // Which war mode's map to edit. Left out, it is the alliance's current mode.
  mode: z.enum(["regular", "bigThings"]).optional(),
  slot: z.string(),
  // null clears the slot.
  userId: z.string().min(1).nullable()
});

// Sets or clears one attack path or upper-island node and returns that
// battlegroup's updated map. Officers can set anything; members can only take
// or leave a spot on the upper islands for themselves.
export const POST = withErrorHandling("POST /api/attack-assignments", async (req: NextRequest) => {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.userId && !toObjectId(parsed.data.userId))) {
    return NextResponse.json({ error: "Invalid attack assignment." }, { status: 400 });
  }
  const db = await getDb();
  const mode = parsed.data.mode ?? (await getWarMode(db));
  const { battlegroup, slot, userId } = parsed.data;
  if (!isValidSlot(slot, mode)) return NextResponse.json({ error: "Invalid attack assignment." }, { status: 400 });

  const result = await setAttackSlot(db, {
    mode,
    battlegroup,
    slot,
    userId,
    actorId: session.userId,
    actorIsOfficer: isOfficerRole(session.role)
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, board: await loadAttackBoard(db, battlegroup, mode) });
});
