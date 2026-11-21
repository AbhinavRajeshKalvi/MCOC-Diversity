import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { answerTakeover, loadAttackBoard } from "@/lib/attack-plans";
import { withErrorHandling } from "@/lib/api-handler";
import { notifyMembers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({ answer: z.enum(["accept", "decline", "cancel"]) });

// The holder hands the node over or keeps it; the requester can withdraw.
export const POST = withErrorHandling(
  "POST /api/attack-assignments/requests/[id]",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const session = await requireAlliance();
    const requestId = toObjectId(params.id);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!requestId || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const db = await getDb();
    const result = await answerTakeover(db, {
      allianceId: session.alliance,
      requestId,
      answer: parsed.data.answer,
      actorId: session.userId
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const { answer } = parsed.data;
    if (answer !== "cancel") {
      const node = result.slot.slice(5);
      notifyMembers(db, "takeover", [result.requesterId], {
        title: answer === "accept" ? `Node ${node} is yours` : `Node ${node} request declined`,
        body:
          answer === "accept"
            ? `${session.displayName} handed node ${node} over to you.`
            : `${session.displayName} is keeping node ${node}.`,
        url: `/attack?bg=${result.battlegroup}&node=${node}`,
        tag: `takeover-${result.battlegroup}-${result.slot}`
      });
    }
    return NextResponse.json({ ok: true, board: await loadAttackBoard(db, session.alliance, result.battlegroup, "regular") });
  }
);
