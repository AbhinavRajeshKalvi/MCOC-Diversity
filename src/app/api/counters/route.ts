import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { getSession, requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { COUNTERS, COUNTER_STRENGTHS } from "@/lib/counters";
import { loadCounterData, toCounter } from "@/lib/counter-data";

export const GET = withErrorHandling("GET /api/counters", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const db = await getDb();
  return NextResponse.json(await loadCounterData(db, session.userId));
});

const schema = z.object({
  defenderId: z.string().min(1),
  counterId: z.string().min(1),
  strength: z.enum(COUNTER_STRENGTHS),
  note: z.string().trim().max(500, "Keep the note under 500 characters.")
});

export const POST = withErrorHandling("POST /api/counters", async (req: NextRequest) => {
  let session;
  try {
    session = await requireOfficer();
  } catch {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid counter." }, { status: 400 });
  }

  const defenderId = toObjectId(parsed.data.defenderId);
  const counterId = toObjectId(parsed.data.counterId);
  if (!defenderId || !counterId) return NextResponse.json({ error: "Champion not found." }, { status: 404 });
  if (defenderId.equals(counterId)) {
    return NextResponse.json({ error: "A champion can't counter itself." }, { status: 400 });
  }

  const db = await getDb();
  const found = await db.collection("champions").countDocuments({ _id: { $in: [defenderId, counterId] } });
  if (found !== 2) return NextResponse.json({ error: "Champion not found." }, { status: 404 });

  // New picks go to the bottom of the defender's list.
  const last = await db
    .collection(COUNTERS)
    .find({ defenderId }, { projection: { order: 1 } })
    .sort({ order: -1 })
    .limit(1)
    .next();

  const doc = {
    defenderId,
    counterId,
    strength: parsed.data.strength,
    note: parsed.data.note,
    order: typeof last?.order === "number" ? last.order + 1 : 0,
    source: "manual",
    updatedAt: new Date(),
    updatedBy: session.userId
  };
  try {
    const result = await db.collection(COUNTERS).insertOne(doc);
    return NextResponse.json({ counter: toCounter({ ...doc, _id: result.insertedId }) });
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "That champion is already listed as a counter." }, { status: 409 });
    }
    throw err;
  }
});
