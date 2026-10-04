import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { REMOVED_CHAMPIONS, championKey, getDb, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { COUNTERS, COUNTER_PROFILES } from "@/lib/counters";

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
    const champion = await db.collection("champions").findOneAndDelete({ _id: championId });
    if (!champion) {
      return NextResponse.json({ error: "Champion not found." }, { status: 404 });
    }
    // Remember the removal so the startup seed doesn't add it back.
    const key = championKey(String(champion.name));
    await db
      .collection(REMOVED_CHAMPIONS)
      .updateOne({ key }, { $set: { key, name: champion.name, removedAt: new Date() } }, { upsert: true });
    // Clean up any roster entries that referenced this champion.
    await db.collection("rosterEntries").deleteMany({ championId });
    // ...and any counter notes for or against it.
    await db.collection(COUNTERS).deleteMany({ $or: [{ defenderId: championId }, { counterId: championId }] });
    await db.collection(COUNTER_PROFILES).deleteOne({ championId });

    return NextResponse.json({ ok: true });
  }
);
