import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSession, requireOfficer } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling("GET /api/champions", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const db = await getDb();
  const docs = await db.collection("champions").find().sort({ name: 1 }).toArray();
  const champions = docs.map((c) => ({
    id: c._id.toString(),
    name: c.name as string,
    imageUrl: (c.imageUrl as string | null) ?? null
  }));

  return NextResponse.json({ champions });
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  imageUrl: z.string().trim().url().max(500).optional().nullable()
});

export const POST = withErrorHandling("POST /api/champions", async (req: NextRequest) => {
  try {
    await requireOfficer();
  } catch {
    return NextResponse.json({ error: "Officers only." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Enter a champion name." },
      { status: 400 }
    );
  }

  const db = await getDb();
  try {
    const result = await db
      .collection("champions")
      .insertOne({ name: parsed.data.name, imageUrl: parsed.data.imageUrl ?? null });
    return NextResponse.json({
      id: result.insertedId.toString(),
      name: parsed.data.name,
      imageUrl: parsed.data.imageUrl ?? null
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "That champion is already in the list." }, { status: 409 });
    }
    throw err;
  }
});
