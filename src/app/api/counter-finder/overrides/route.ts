import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSession, requireGameDataEditor } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { slugify } from "@/lib/counter-finder";
import { OVERRIDE_KINDS, buildFinderData, mergeRaw, BASE_RAW, validateData } from "@/lib/counter-finder-data";
import { COUNTER_FINDER_OVERRIDES, loadOverrides } from "@/lib/counter-finder-server";

// Counter Finder data corrections, merged over src/data/counters/*.json.
// Anyone signed in can read them; game-data editors can change them.

export const GET = withErrorHandling("GET /api/counter-finder/overrides", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ overrides: await loadOverrides(await getDb()) });
});

const MAX_ENTRY_BYTES = 20_000;

const putSchema = z.object({
  kind: z.enum(OVERRIDE_KINDS),
  /** The entry being replaced; omitted for a new entry (derived from its name). */
  id: z.string().trim().min(1).max(120).optional(),
  data: z.record(z.unknown()).nullable(),
  deleted: z.boolean().default(false)
});

async function editor() {
  try {
    return await requireGameDataEditor();
  } catch {
    return null;
  }
}

export const PUT = withErrorHandling("PUT /api/counter-finder/overrides", async (req: NextRequest) => {
  const session = await editor();
  if (!session) return NextResponse.json({ error: "Only game-data editors can change this." }, { status: 403 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid entry." }, { status: 400 });
  }
  const { kind, data, deleted } = parsed.data;
  if (!deleted) {
    if (!data || typeof data.name !== "string" || !data.name.trim()) {
      return NextResponse.json({ error: "The entry needs a \"name\"." }, { status: 400 });
    }
    if (JSON.stringify(data).length > MAX_ENTRY_BYTES) {
      return NextResponse.json({ error: "That entry is too large." }, { status: 400 });
    }
  }
  const nameId = data && typeof data.name === "string" ? slugify(data.name) : "";
  const id = parsed.data.id ?? nameId;
  if (!id) return NextResponse.json({ error: "Missing entry id." }, { status: 400 });
  if (data && typeof data.id !== "string" && nameId !== id) {
    // Renaming would change the derived id and orphan the base entry: pin the id.
    data.id = id;
  }

  const db = await getDb();
  const doc = { kind, id, data: deleted ? null : data, deleted, updatedAt: new Date(), updatedBy: session.userId, updatedByName: session.displayName };

  // Reject saves that leave broken references (unknown effect, trait, class...).
  const others = (await loadOverrides(db)).filter((o) => !(o.kind === kind && o.id === id));
  const merged = buildFinderData(mergeRaw(BASE_RAW, [...others, { kind, id, data: doc.data, deleted }]));
  const issues = validateData(merged).filter((issue) => issue.kind === kind && issue.id === id);
  if (issues.length > 0) {
    return NextResponse.json({ error: issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  await db.collection(COUNTER_FINDER_OVERRIDES).updateOne({ kind, id }, { $set: doc }, { upsert: true });
  return NextResponse.json({ overrides: await loadOverrides(db) });
});

/** Removes an override, restoring the entry from the JSON files. */
export const DELETE = withErrorHandling("DELETE /api/counter-finder/overrides", async (req: NextRequest) => {
  const session = await editor();
  if (!session) return NextResponse.json({ error: "Only game-data editors can change this." }, { status: 403 });

  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if (!kind || !id || !OVERRIDE_KINDS.includes(kind as (typeof OVERRIDE_KINDS)[number])) {
    return NextResponse.json({ error: "Missing kind or id." }, { status: 400 });
  }
  const db = await getDb();
  await db.collection(COUNTER_FINDER_OVERRIDES).deleteOne({ kind, id });
  return NextResponse.json({ overrides: await loadOverrides(db) });
});
