// Server-side loading for the Counters page and API (see counters.ts for the model).

import type { Db } from "mongodb";
import { ObjectId } from "./db";
import { normalizeAscension } from "./ascension";
import {
  CHAMPION_CLASSES,
  COUNTERS,
  COUNTER_PROFILES,
  type ChampionClass,
  type Counter,
  type CounterData,
  type CounterProfile
} from "./counters";

export function toCounter(doc: Record<string, any>): Counter {
  return {
    id: doc._id.toString(),
    defenderId: doc.defenderId.toString(),
    counterId: doc.counterId.toString(),
    strength: doc.strength === "hard" ? "hard" : "soft",
    note: (doc.note as string | undefined) ?? "",
    order: typeof doc.order === "number" ? doc.order : 0
  };
}

export function toCounterProfile(doc: Record<string, any>): CounterProfile {
  const championClass = CHAMPION_CLASSES.includes(doc.championClass) ? (doc.championClass as ChampionClass) : null;
  return {
    championId: doc.championId.toString(),
    championClass,
    keyAbilities: Array.isArray(doc.keyAbilities) ? doc.keyAbilities.map(String) : [],
    immunities: Array.isArray(doc.immunities) ? doc.immunities.map(String) : []
  };
}

export async function loadCounterData(db: Db, userId: string): Promise<CounterData> {
  const [championDocs, counterDocs, profileDocs, rosterDocs] = await Promise.all([
    db.collection("champions").find().sort({ name: 1 }).toArray(),
    db.collection(COUNTERS).find().toArray(),
    db.collection(COUNTER_PROFILES).find().toArray(),
    db.collection("rosterEntries").find({ userId: new ObjectId(userId) }).toArray()
  ]);

  return {
    champions: championDocs.map((c) => ({
      id: c._id.toString(),
      name: c.name as string,
      imageUrl: (c.imageUrl as string | null) ?? null
    })),
    counters: counterDocs.map(toCounter),
    profiles: profileDocs.map(toCounterProfile),
    owned: rosterDocs.map((r) => ({
      championId: r.championId.toString(),
      stars: (r.stars as number | null) ?? null,
      rank: (r.rank as number | null) ?? null,
      sigLevel: (r.sigLevel as number | null) ?? null,
      ascended: normalizeAscension(r.ascended),
      awakened: (r.awakened as boolean | null) ?? null
    }))
  };
}
