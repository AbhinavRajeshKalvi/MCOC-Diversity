import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";
import { withErrorHandling } from "@/lib/api-handler";
import { normalizeAscension } from "@/lib/ascension";
import { notifyRosterUpdated } from "@/lib/roster-notify";
import { saveSamples } from "@/lib/roster-scan/references";
import { deleteDraft } from "@/lib/roster-scan/drafts";

const championSchema = z.object({
  championId: z.string().min(1),
  stars: z.number().int().min(1).max(7).nullable(),
  rank: z.number().int().min(1).max(6).nullable().optional(),
  sigLevel: z.number().int().min(0).max(200).nullable().optional(),
  rating: z.number().int().min(0).nullable(),
  awakened: z.boolean().nullable(),
  ascended: z.union([z.boolean(), z.number().int().min(0).max(3)]).nullable(),
  // Portrait feature of the card crop (numbers only, no image), returned by
  // /api/roster/analyze. Saved so the matcher learns from this review.
  feature: z.string().max(4000).optional(),
  // The champion the scanner guessed, to tell confirmations from corrections.
  guessedChampionId: z.string().nullable().optional()
});

const schema = z.object({
  champions: z.array(championSchema).min(1).max(500),
  // Set when the rows came from a Discord scan; that draft is deleted once saved.
  draftId: z.string().max(64).optional()
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

  const ids = parsed.data.champions.map((c) => toObjectId(c.championId)).filter((x): x is ObjectId => !!x);
  const known = new Set(
    (await db.collection("champions").find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray()).map((c) => String(c._id))
  );

  const operations = [];
  const samples: { championId: string; feature: string; corrected: boolean }[] = [];
  const now = new Date();

  for (const item of parsed.data.champions) {
    const championId = toObjectId(item.championId);
    if (!championId || !known.has(String(championId))) continue;

    const set: Record<string, unknown> = {
      stars: item.stars,
      rating: item.rating,
      awakened: item.awakened,
      ascended: normalizeAscension(item.ascended),
      source: "screenshot",
      importedAt: now,
      updatedAt: now
    };
    const setOnInsert: Record<string, unknown> = { userId, championId, createdAt: now };
    // Rank and sig come from the screenshot now. A null means "couldn't read",
    // which shouldn't wipe a value the user already has.
    if (item.rank != null) set.rank = item.rank;
    else setOnInsert.rank = null;
    if (item.sigLevel != null) set.sigLevel = item.sigLevel;
    else setOnInsert.sigLevel = null;

    operations.push({
      updateOne: { filter: { userId, championId }, update: { $set: set, $setOnInsert: setOnInsert }, upsert: true }
    });

    if (item.feature) {
      samples.push({
        championId: String(championId),
        feature: item.feature,
        corrected: !!item.guessedChampionId && item.guessedChampionId !== item.championId
      });
    }
  }

  if (operations.length === 0) {
    return NextResponse.json({ error: "No valid champions were selected for import." }, { status: 400 });
  }

  await db.collection("rosterEntries").bulkWrite(operations, { ordered: false });
  await notifyRosterUpdated(db, userId, session.userId);

  try {
    await saveSamples(db, session.userId, samples);
  } catch (error) {
    // Learning is a bonus; the roster is already saved.
    console.error("Could not store screenshot samples:", error);
  }

  // A Discord scan that has now been saved isn't needed any more.
  if (parsed.data.draftId) {
    await deleteDraft(db, parsed.data.draftId, userId).catch((error) => console.error("Could not delete import draft:", error));
  }

  const savedCount = await db.collection("rosterEntries").countDocuments({ userId });
  return NextResponse.json({ ok: true, imported: operations.length, savedCount, learned: samples.length });
});
