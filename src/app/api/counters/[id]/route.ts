import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { COUNTERS, COUNTER_STRENGTHS } from "@/lib/counters";
import { toCounter } from "@/lib/counter-data";

const patchSchema = z
  .object({
    strength: z.enum(COUNTER_STRENGTHS),
    note: z.string().trim().max(500, "Keep the note under 500 characters."),
    order: z.number().int()
  })
  .partial();

export const PATCH = withErrorHandling(
  "PATCH /api/counters/[id]",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    let session;
    try {
      session = await requireOfficer();
    } catch {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ error: "Counter not found." }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid change." }, { status: 400 });
    }

    const db = await getDb();
    const updated = await db
      .collection(COUNTERS)
      .findOneAndUpdate(
        { _id: id },
        { $set: { ...parsed.data, source: "manual", updatedAt: new Date(), updatedBy: session.userId } },
        { returnDocument: "after" }
      );
    if (!updated) return NextResponse.json({ error: "Counter not found." }, { status: 404 });
    return NextResponse.json({ counter: toCounter(updated) });
  }
);

export const DELETE = withErrorHandling(
  "DELETE /api/counters/[id]",
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    try {
      await requireOfficer();
    } catch {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ error: "Counter not found." }, { status: 404 });

    const db = await getDb();
    const result = await db.collection(COUNTERS).deleteOne({ _id: id });
    if (result.deletedCount === 0) return NextResponse.json({ error: "Counter not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
);
