import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId, toObjectId } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { normalizeAscension } from "@/lib/ascension";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Whose roster a request works on: the signed-in user by default, or another
 * member (`userId`) when an officer, the Leader or the Admin is editing it.
 */
async function resolveRosterOwner(session: { userId: string; role: string }, requestedUserId: string | null | undefined) {
  if (!requestedUserId || requestedUserId === session.userId) return { userId: new ObjectId(session.userId) };
  if (!isOfficerRole(session.role)) {
    return { error: NextResponse.json({ error: "Only officers can edit another member's roster." }, { status: 403 }) };
  }
  const userId = toObjectId(requestedUserId);
  const db = await getDb();
  if (!userId || !(await db.collection("users").findOne({ _id: userId }, { projection: { _id: 1 } }))) {
    return { error: NextResponse.json({ error: "Member not found." }, { status: 404 }) };
  }
  return { userId };
}

export const GET = withErrorHandling("GET /api/roster", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const owner = await resolveRosterOwner(session, req.nextUrl.searchParams.get("userId"));
  if (owner.error) return owner.error;

  const db = await getDb();
  const rows = await db
    .collection("rosterEntries")
    .aggregate([
      { $match: { userId: owner.userId } },
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
    ascended: normalizeAscension(r.ascended),
    source: r.source ?? "manual"
  }));

  return NextResponse.json({ roster });
});

const schema = z.object({
  /** Another member's ID when an officer adds to their roster; omitted for your own. */
  userId: z.string().min(1).optional(),
  championId: z.string().min(1),
  stars: z.number().int().min(1).max(7),
  rating: z.number({ required_error: "Enter the champion's PI." }).int().min(1),
  awakened: z.boolean(),
  ascended: z.number().int().min(0).max(3),
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
  const { userId, championId, stars, rating, awakened, ascended, rank, sigLevel } = parsed.data;

  const owner = await resolveRosterOwner(session, userId);
  if (owner.error) return owner.error;

  const championObjId = toObjectId(championId);
  if (!championObjId) return NextResponse.json({ error: "Unknown champion." }, { status: 404 });

  const db = await getDb();
  const champion = await db.collection("champions").findOne({ _id: championObjId });
  if (!champion) {
    return NextResponse.json({ error: "Unknown champion." }, { status: 404 });
  }

  await db.collection("rosterEntries").updateOne(
    { userId: owner.userId, championId: championObjId },
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
