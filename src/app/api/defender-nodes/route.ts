import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { BIG_THINGS_NODES } from "@/lib/attack-map";
import { loadDefenderNodes, setDefenderNode } from "@/lib/defender-nodes";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  battlegroup: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  node: z.number().int().refine((node) => BIG_THINGS_NODES.includes(node)),
  // null clears the node.
  userId: z.string().min(1).nullable()
});

// Officers place a member's Big Things defender on one of the 10 nodes, and
// get that battlegroup's updated placements back.
export const POST = withErrorHandling("POST /api/defender-nodes", async (req: NextRequest) => {
  const session = await requireOfficer().catch(() => null);
  if (!session) return NextResponse.json({ error: "Only officers can assign defender nodes." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.userId && !toObjectId(parsed.data.userId))) {
    return NextResponse.json({ error: "Invalid defender node." }, { status: 400 });
  }
  const { battlegroup, node, userId } = parsed.data;

  const db = await getDb();
  const result = await setDefenderNode(db, { battlegroup, node, userId, actorId: session.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, nodes: await loadDefenderNodes(db, battlegroup) });
});
