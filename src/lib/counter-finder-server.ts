// Server-side loading for the Counter Finder: editor overrides, the member's
// roster and the officer counters, joined to finder champion ids by name.
//
// Collection:
//   counterFinderOverrides { kind, id, data, deleted, updatedAt, updatedBy }
//   one document per corrected entry; merged over src/data/counters/*.json.
//   Shared by everyone, like the champion list and counters.

import type { Db } from "mongodb";
import { ObjectId } from "./db";
import { normalizeAscension } from "./ascension";
import { COUNTERS } from "./counters";
import { slugify, type OfficerCounter, type RosterEntry } from "./counter-finder";
import { OVERRIDE_KINDS, type DataOverride, type OverrideKind } from "./counter-finder-data";

export const COUNTER_FINDER_OVERRIDES = "counterFinderOverrides";

export type FinderChampion = { id: string; name: string; imageUrl: string | null };

export type FinderPageData = {
  overrides: DataOverride[];
  champions: FinderChampion[];
  roster: RosterEntry[];
  officerCounters: OfficerCounter[];
};

export function toOverride(doc: Record<string, any>): DataOverride {
  return {
    kind: OVERRIDE_KINDS.includes(doc.kind) ? (doc.kind as OverrideKind) : "champion",
    id: String(doc.id),
    data: doc.data && typeof doc.data === "object" ? (doc.data as Record<string, unknown>) : null,
    deleted: Boolean(doc.deleted),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : null,
    updatedBy: doc.updatedByName ? String(doc.updatedByName) : null
  };
}

export async function loadOverrides(db: Db): Promise<DataOverride[]> {
  const docs = await db.collection(COUNTER_FINDER_OVERRIDES).find().toArray();
  return docs.map(toOverride);
}

export async function loadFinderPageData(db: Db, userId: string): Promise<FinderPageData> {
  const [overrides, championDocs, rosterDocs, counterDocs] = await Promise.all([
    loadOverrides(db),
    db.collection("champions").find({}, { projection: { name: 1, imageUrl: 1 } }).sort({ name: 1 }).toArray(),
    db.collection("rosterEntries").find({ userId: new ObjectId(userId) }).toArray(),
    db.collection(COUNTERS).find({}, { projection: { defenderId: 1, counterId: 1, strength: 1 } }).toArray()
  ]);

  // Mongo ids -> finder ids (slug of the champion's name).
  const slugByObjectId = new Map<string, string>();
  const champions: FinderChampion[] = championDocs.map((c) => {
    const id = slugify(String(c.name));
    slugByObjectId.set(c._id.toString(), id);
    return { id, name: String(c.name), imageUrl: (c.imageUrl as string | null) ?? null };
  });

  const roster: RosterEntry[] = [];
  for (const r of rosterDocs) {
    const championId = slugByObjectId.get(String(r.championId));
    if (!championId) continue;
    roster.push({
      championId,
      stars: (r.stars as number | null) ?? null,
      rank: (r.rank as number | null) ?? null,
      sigLevel: (r.sigLevel as number | null) ?? null,
      rating: (r.rating as number | null) ?? null,
      ascended: normalizeAscension(r.ascended),
      awakened: (r.awakened as boolean | null) ?? null
    });
  }

  const officerCounters: OfficerCounter[] = [];
  for (const c of counterDocs) {
    const defenderId = slugByObjectId.get(String(c.defenderId));
    const counterId = slugByObjectId.get(String(c.counterId));
    if (defenderId && counterId) {
      officerCounters.push({ defenderId, counterId, strength: c.strength === "hard" ? "hard" : "soft" });
    }
  }

  return { overrides, champions, roster, officerCounters };
}
