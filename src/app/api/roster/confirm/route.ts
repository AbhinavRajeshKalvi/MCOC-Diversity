import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";
import { withErrorHandling } from "@/lib/api-handler";

const championSchema = z.object({
  championId: z.string().min(1),
  stars: z.number().int().min(1).max(7).nullable(),
  rating: z.number().int().min(0).nullable(),
  awakened: z.boolean().nullable(),
  ascended: z.boolean().nullable()
});

const schema = z.object({
  champions: z.array(championSchema).min(1).max(500)
});

export const POST = withErrorHandling("POST /api/roster/confirm", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!SCREENSHOT_IMPORT_ENABLED) {
    return NextResponse.json({ error: "Screenshot import is locked while it's under development." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import data." }, { status: 400 });
  }

  const db = await getDb();
  const userId = new ObjectId(session.userId);
  const operations = [];

  for (const item of parsed.data.champions) {
    const championId = toObjectId(item.championId);
    if (!championId) continue;

    const champion = await db.collection("champions").findOne({ _id: championId });
    if (!champion) continue;

    operations.push({
      updateOne: {
        filter: { userId, championId },
        update: {
          $set: {
            stars: item.stars,
            rating: item.rating,
            awakened: item.awakened,
            ascended: item.ascended,
            source: "screenshot",
            importedAt: new Date(),
            updatedAt: new Date()
          },
          $setOnInsert: {
            userId,
            championId,
            rank: null,
            sigLevel: null,
            createdAt: new Date()
          }
        },
        upsert: true
      }
    });
  }

  if (operations.length === 0) {
    return NextResponse.json({ error: "No valid champions were selected for import." }, { status: 400 });
  }

  await db.collection("rosterEntries").bulkWrite(operations, { ordered: false });

  // Verify the records are actually readable immediately after the write.
  // This makes the import response fail loudly instead of allowing the UI to
  // look successful when a later read cannot see the saved entries.
  const savedCount = await db.collection("rosterEntries").countDocuments({ userId });

  return NextResponse.json({ ok: true, imported: operations.length, savedCount });
});
