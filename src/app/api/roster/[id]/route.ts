import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";

const schema = z.object({
  stars: z.number().int().min(1).max(7),
  rating: z.number().int().min(1).nullable(),
  awakened: z.boolean(),
  ascended: z.boolean()
});

export const PATCH = withErrorHandling(
  "PATCH /api/roster/[id]",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const entryId = toObjectId(params.id);
    if (!entryId) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid entry." },
        { status: 400 }
      );
    }

    const db = await getDb();
    const result = await db.collection("rosterEntries").updateOne(
      { _id: entryId, userId: new ObjectId(session.userId) },
      { $set: { ...parsed.data, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withErrorHandling(
  "DELETE /api/roster/[id]",
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const entryId = toObjectId(params.id);
    if (!entryId) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

    const db = await getDb();
    const result = await db
      .collection("rosterEntries")
      .deleteOne({ _id: entryId, userId: new ObjectId(session.userId) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
