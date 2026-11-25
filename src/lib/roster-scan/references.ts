import { ObjectId, type Db } from "mongodb";
import {
  REF_WINDOWS,
  featureFromBase64,
  featureToBase64,
  referenceFeatures,
  type Reference
} from "./portrait";

/**
 * Reference portraits for matching screenshot cards to champions.
 *
 * Two sources:
 *  - every champion's imageUrl portrait, turned into features once and cached
 *    in Mongo (`rosterScanPortraits`) so a cold server doesn't refetch ~300 images;
 *  - crops the user confirmed or corrected in the import review
 *    (`rosterScanSamples`). These are same-domain (cut from real screenshots),
 *    so they match far better than the official art and the matcher improves
 *    with every import.
 *
 * Official art is fetched only to compute numeric features; it is never stored
 * or served back, so nothing is redistributed.
 */

/** Bump when the feature maths or REF_WINDOWS change, to invalidate the cache. */
export const FEATURE_VERSION = `v1:${REF_WINDOWS.map((w) => `${w.cx},${w.cy},${w.w}`).join(";")}`;

const PORTRAITS = "rosterScanPortraits";
export const SAMPLES = "rosterScanSamples";
const MAX_SAMPLES_PER_CHAMPION = 12;

// Takes the Db instead of importing the app's db helper, so the Discord bot
// can share this file (and the same cached features) with the web app.

type ChampionDoc = { _id: unknown; name: string; imageUrl?: string | null };

let cache: { db: Db; at: number; refs: Reference[]; names: Map<string, string> } | null = null;
let building: Promise<{ refs: Reference[]; names: Map<string, string> }> | null = null;
const TTL_MS = 10 * 60 * 1000;

export function invalidateReferences() {
  cache = null;
}

export async function getReferences(db: Db): Promise<{ refs: Reference[]; names: Map<string, string> }> {
  if (cache && cache.db === db && Date.now() - cache.at < TTL_MS) return cache;
  if (!building) {
    building = build(db)
      .then((r) => {
        cache = { db, at: Date.now(), ...r };
        return r;
      })
      .finally(() => {
        building = null;
      });
  }
  return building;
}

async function build(db: Db) {
  const champions = (await db
    .collection("champions")
    .find({}, { projection: { name: 1, imageUrl: 1 } })
    .toArray()) as unknown as ChampionDoc[];
  const names = new Map(champions.map((c) => [String(c._id), c.name]));

  const stored = await db
    .collection(PORTRAITS)
    .find({ version: FEATURE_VERSION }, { projection: { imageUrl: 1, features: 1 } })
    .toArray();
  const byUrl = new Map(stored.map((d) => [d.imageUrl as string, (d.features as string[]).map(featureFromBase64)]));

  const missing = champions.filter((c) => c.imageUrl && !byUrl.has(c.imageUrl));
  await mapLimit(missing, 8, async (c) => {
    try {
      const res = await fetch(c.imageUrl!, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return;
      const feats = await referenceFeatures(Buffer.from(await res.arrayBuffer()));
      byUrl.set(c.imageUrl!, feats);
      await db.collection(PORTRAITS).updateOne(
        { imageUrl: c.imageUrl, version: FEATURE_VERSION },
        { $set: { features: feats.map(featureToBase64), updatedAt: new Date() } },
        { upsert: true }
      );
    } catch {
      // One bad image shouldn't break the import; that champion just matches
      // via confirmed samples or manual pick.
    }
  });

  const refs: Reference[] = [];
  for (const c of champions) {
    const f = c.imageUrl ? byUrl.get(c.imageUrl) : undefined;
    if (f?.length) refs.push({ championId: String(c._id), source: "portrait", features: f });
  }

  const samples = await db
    .collection(SAMPLES)
    .find({}, { projection: { championId: 1, feature: 1 } })
    .sort({ createdAt: -1 })
    .limit(20000)
    .toArray();
  const perChamp = new Map<string, Float32Array[]>();
  for (const s of samples) {
    const id = String(s.championId);
    const list = perChamp.get(id) ?? [];
    if (list.length < MAX_SAMPLES_PER_CHAMPION) list.push(featureFromBase64(s.feature as string));
    perChamp.set(id, list);
  }
  for (const [championId, features] of perChamp) {
    if (names.has(championId)) refs.push({ championId, source: "confirmed", features });
  }
  return { refs, names };
}

/** Stores reviewed crops (feature only, no image) as new references. */
export async function saveSamples(
  db: Db,
  userId: string,
  samples: { championId: string; feature: string; corrected: boolean }[]
) {
  if (!samples.length) return;
  const now = new Date();
  await db.collection(SAMPLES).insertMany(
    samples.map((s) => ({
      championId: ObjectId.isValid(s.championId) ? new ObjectId(s.championId) : null,
      feature: s.feature,
      corrected: s.corrected,
      userId,
      version: FEATURE_VERSION,
      createdAt: now
    }))
  );
  invalidateReferences();
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}
