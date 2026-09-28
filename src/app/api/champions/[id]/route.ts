import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";

const patchSchema = z.object({
  imageUrl: z.string().trim().url().max(500).nullable()
});

export const PATCH = withErrorHandling(
  "PATCH /api/champions/[id]",
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    try {
      await requireOfficer();
    } catch {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    const championId = toObjectId(params.id);
    if (!championId) return NextResponse.json({ error: "Champion not found." }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid image URL." }, { status: 400 });
    }

    const db = await getDb();
    const result = await db
      .collection("champions")
      .updateOne({ _id: championId }, { $set: { imageUrl: parsed.data.imageUrl } });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Champion not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withErrorHandling(
  "DELETE /api/champions/[id]",
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    try {
      await requireOfficer();
    } catch {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    const championId = toObjectId(params.id);
    if (!championId) return NextResponse.json({ error: "Champion not found." }, { status: 404 });

    const db = await getDb();
    const result = await db.collection("champions").deleteOne({ _id: championId });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Champion not found." }, { status: 404 });
    }
    // Clean up any roster entries that referenced this champion.
    await db.collection("rosterEntries").deleteMany({ championId });

    return NextResponse.json({ ok: true });
  }
);
