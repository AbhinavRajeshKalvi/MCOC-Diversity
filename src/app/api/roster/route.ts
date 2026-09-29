import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withErrorHandling("GET /api/roster", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const db = await getDb();
  const rows = await db
    .collection("rosterEntries")
    .aggregate([
      { $match: { userId: new ObjectId(session.userId) } },
      { $lookup: { from: "champions", localField: "championId", foreignField: "_id", as: "champion" } },
      { $unwind: "$champion" },
      { $sort: { "champion.name": 1 } }
    ])
    .toArray();

  const roster = rows.map((r) => ({
    id: r._id.toString(),
    championId: r.championId.toString(),
    championName: r.champion.name,
    championImageUrl: r.champion.imageUrl ?? null,
    stars: r.stars,
    rank: r.rank ?? null,
    sigLevel: r.sigLevel ?? null,
    rating: r.rating ?? null,
    awakened: r.awakened ?? null,
    ascended: r.ascended ?? null,
    source: r.source ?? "manual"
  }));

  return NextResponse.json({ roster });
});

const schema = z.object({
  championId: z.string().min(1),
  stars: z.number().int().min(1).max(7),
  rating: z.number({ required_error: "Enter the champion's PI." }).int().min(1),
  awakened: z.boolean(),
  ascended: z.boolean(),
  rank: z.number().int().min(1, "Rank must be from 1 to 6.").max(6, "Rank must be from 1 to 6.").nullable().optional(),
  sigLevel: z
    .number()
    .int()
    .min(0, "Signature level must be from 0 to 200.")
    .max(200, "Signature level must be from 0 to 200.")
    .nullable()
    .optional()
});

export const POST = withErrorHandling("POST /api/roster", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid champion entry." },
      { status: 400 }
    );
  }
  const { championId, stars, rating, awakened, ascended, rank, sigLevel } = parsed.data;

  const championObjId = toObjectId(championId);
  if (!championObjId) return NextResponse.json({ error: "Unknown champion." }, { status: 404 });

  const db = await getDb();
  const champion = await db.collection("champions").findOne({ _id: championObjId });
  if (!champion) {
    return NextResponse.json({ error: "Unknown champion." }, { status: 404 });
  }

  await db.collection("rosterEntries").updateOne(
    { userId: new ObjectId(session.userId), championId: championObjId },
    {
      $set: {
        stars,
        rating,
        awakened,
        ascended,
        rank: rank ?? null,
        sigLevel: sigLevel ?? null,
        source: "manual",
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
});
