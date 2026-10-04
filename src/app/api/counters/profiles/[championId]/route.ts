import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { CHAMPION_CLASSES, COUNTER_PROFILES } from "@/lib/counters";
import { toCounterProfile } from "@/lib/counter-data";

const tagList = z.array(z.string().trim().min(1).max(60)).max(30);

const schema = z.object({
  championClass: z.enum(CHAMPION_CLASSES).nullable(),
  keyAbilities: tagList,
  immunities: tagList
});

// Sets the "Defender info" shown above a defender's counters.
export const PUT = withErrorHandling(
  "PUT /api/counters/profiles/[championId]",
  async (req: NextRequest, { params }: { params: { championId: string } }) => {
    let session;
    try {
      session = await requireOfficer();
    } catch {
      return NextResponse.json({ error: "Officers only." }, { status: 403 });
    }

    const championId = toObjectId(params.championId);
    if (!championId) return NextResponse.json({ error: "Champion not found." }, { status: 404 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid defender info." }, { status: 400 });
    }

    const db = await getDb();
    if ((await db.collection("champions").countDocuments({ _id: championId })) === 0) {
      return NextResponse.json({ error: "Champion not found." }, { status: 404 });
    }

    const updated = await db
      .collection(COUNTER_PROFILES)
      .findOneAndUpdate(
        { championId },
        { $set: { ...parsed.data, championId, source: "manual", updatedAt: new Date(), updatedBy: session.userId } },
        { upsert: true, returnDocument: "after" }
      );
    return NextResponse.json({ profile: toCounterProfile(updated!) });
  }
);
