import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { isValidSlot } from "@/lib/attack-map";
import { loadAttackBoard, requestTakeover } from "@/lib/attack-plans";
import { withErrorHandling } from "@/lib/api-handler";
import { notifyMembers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  slot: z.string(),
  championId: z.string().min(1).nullable().optional()
});

// Asks whoever booked a node (37-50) to hand it over. Returns the updated map.
export const POST = withErrorHandling("POST /api/attack-assignments/requests", async (req: NextRequest) => {
  const session = await requireAlliance();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (
    !parsed.success ||
    !isValidSlot(parsed.data.slot, "regular") ||
    (parsed.data.championId && !toObjectId(parsed.data.championId))
  ) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { battlegroup, slot } = parsed.data;
  const db = await getDb();
  const result = await requestTakeover(db, {
    allianceId: session.alliance,
    battlegroup,
    slot,
    actorId: session.userId,
    championId: parsed.data.championId ?? null
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const board = await loadAttackBoard(db, session.alliance, battlegroup, "regular");
  const request = board.requests?.find((r) => r.slot === slot && r.requester.userId === session.userId);
  const node = slot.slice(5);
  notifyMembers(db, "takeover", [result.holderId], {
    title: `${session.displayName} wants node ${node}`,
    body: request?.champion
      ? `They'd use ${request.champion.name}. Open the map to hand it over or keep it.`
      : "Open the map to hand it over or keep it.",
    url: `/attack?bg=${battlegroup}&node=${node}`,
    tag: `takeover-${battlegroup}-${slot}`
  });
  return NextResponse.json({ ok: true, board });
});
