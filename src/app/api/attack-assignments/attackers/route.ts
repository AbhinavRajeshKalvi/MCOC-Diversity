import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { ATTACKERS_PER_NODE, isValidSlot } from "@/lib/attack-map";
import { loadAttackBoard, loadNodeRoster, setNodeAttackers } from "@/lib/attack-plans";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const battlegroupSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// The roster a Big Things node's holder picks attackers from. Only the holder
// and officers can load it.
export const GET = withErrorHandling("GET /api/attack-assignments/attackers", async (req: NextRequest) => {
  const session = await requireAlliance();
  const battlegroup = battlegroupSchema.safeParse(Number(req.nextUrl.searchParams.get("battlegroup")));
  const slot = req.nextUrl.searchParams.get("slot") ?? "";
  if (!battlegroup.success || !isValidSlot(slot, "bigThings")) {
    return NextResponse.json({ error: "Invalid node." }, { status: 400 });
  }

  const result = await loadNodeRoster(await getDb(), {
    allianceId: session.alliance,
    battlegroup: battlegroup.data,
    slot,
    actorId: session.userId,
    actorIsOfficer: isOfficerRole(session.role)
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ roster: result.roster });
});

const schema = z.object({
  battlegroup: battlegroupSchema,
  slot: z.string(),
  championIds: z.array(z.string()).max(ATTACKERS_PER_NODE)
});

// Sets the attackers for one Big Things node and returns that battlegroup's
// updated map. The node's holder and officers can set them.
export const POST = withErrorHandling("POST /api/attack-assignments/attackers", async (req: NextRequest) => {
  const session = await requireAlliance();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (
    !parsed.success ||
    !isValidSlot(parsed.data.slot, "bigThings") ||
    parsed.data.championIds.some((id) => !toObjectId(id))
  ) {
    return NextResponse.json({ error: "Invalid attackers." }, { status: 400 });
  }
  const { battlegroup, slot, championIds } = parsed.data;
  const db = await getDb();
  const result = await setNodeAttackers(db, {
    allianceId: session.alliance,
    battlegroup,
    slot,
    championIds,
    actorId: session.userId,
    actorIsOfficer: isOfficerRole(session.role)
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, board: await loadAttackBoard(db, session.alliance, battlegroup, "bigThings") });
});
