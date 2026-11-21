import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { isValidSlot } from "@/lib/attack-map";
import { loadAttackBoard, setAttackSlot } from "@/lib/attack-plans";
import { withErrorHandling } from "@/lib/api-handler";
import { getWarMode } from "@/lib/war-settings";
import { notifyAllianceMembers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const battlegroupSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// One battlegroup's map, so an open page can pick up other people's changes.
export const GET = withErrorHandling("GET /api/attack-assignments", async (req: NextRequest) => {
  const session = await requireAlliance();
  const battlegroup = battlegroupSchema.safeParse(Number(req.nextUrl.searchParams.get("battlegroup")));
  const modeParam = req.nextUrl.searchParams.get("mode");
  if (!battlegroup.success) return NextResponse.json({ error: "Invalid battlegroup." }, { status: 400 });
  const db = await getDb();
  const mode = modeParam === "regular" || modeParam === "bigThings" ? modeParam : await getWarMode(db, session.alliance);
  return NextResponse.json({ board: await loadAttackBoard(db, session.alliance, battlegroup.data, mode) });
});

const schema = z.object({
  battlegroup: battlegroupSchema,
  // Which war mode's map to edit. Left out, it is the alliance's current mode.
  mode: z.enum(["regular", "bigThings"]).optional(),
  slot: z.string(),
  // null clears the slot.
  userId: z.string().min(1).nullable(),
  // Regular nodes 37-50: the champion the member plans to use there.
  championId: z.string().min(1).nullable().optional(),
  // Officers moving a name from one node to another: the node it came from.
  moveFrom: z.string().nullable().optional()
});

// Sets or clears one attack path or upper-island node and returns that
// battlegroup's updated map. Officers can set anything; members can only book
// or leave a node on the upper islands for themselves.
export const POST = withErrorHandling("POST /api/attack-assignments", async (req: NextRequest) => {
  const session = await requireAlliance();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (
    !parsed.success ||
    (parsed.data.userId && !toObjectId(parsed.data.userId)) ||
    (parsed.data.championId && !toObjectId(parsed.data.championId))
  ) {
    return NextResponse.json({ error: "Invalid attack assignment." }, { status: 400 });
  }
  const db = await getDb();
  const mode = parsed.data.mode ?? (await getWarMode(db, session.alliance));
  const { battlegroup, slot, userId, championId, moveFrom } = parsed.data;
  if (!isValidSlot(slot, mode) || (moveFrom && !isValidSlot(moveFrom, mode))) {
    return NextResponse.json({ error: "Invalid attack assignment." }, { status: 400 });
  }

  const result = await setAttackSlot(db, {
    allianceId: session.alliance,
    mode,
    battlegroup,
    slot,
    userId,
    championId: championId ?? null,
    moveFrom: moveFrom && isValidSlot(moveFrom, mode) ? moveFrom : null,
    actorId: session.userId,
    actorIsOfficer: isOfficerRole(session.role)
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const board = await loadAttackBoard(db, session.alliance, battlegroup, mode);
  if (result.booked && userId) {
    const holder = board.members.find((member) => member.userId === userId);
    const champion = board.champions?.[slot];
    const node = slot.slice(5);
    const name = holder?.displayName ?? "Someone";
    const what = userId === session.userId ? `${name} booked node ${node}` : `${session.displayName} put ${name} on node ${node}`;
    notifyAllianceMembers(
      db,
      "booking",
      {
        allianceId: session.alliance,
        exclude: [session.userId, userId],
        // Their battlegroup, plus officers who plan every battlegroup.
        filter: { $or: [{ battlegroup }, { role: { $in: ["officer", "leader", "admin"] } }] }
      },
      {
        title: `Node ${node} booked · BG ${battlegroup}`,
        body: `${what}${champion ? ` with ${champion.name}` : ""}.`,
        url: `/attack?bg=${battlegroup}`,
        tag: `booking-${battlegroup}-${slot}`
      }
    );
  }
  return NextResponse.json({ ok: true, board });
});
