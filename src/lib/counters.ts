// Counter picks: which champions to bring against a given defender, and why.
// Officers maintain the list; everyone in the alliance can read it.
// Safe to import from client code; the database loader is in counter-data.ts.
//
// Collections:
//   counters         { defenderId, counterId, strength, note, order, updatedAt, updatedBy }
//                    one document per (defender, counter) pair.
//   counterProfiles  { championId, championClass, keyAbilities[], immunities[], updatedAt }
//                    the "Defender info" shown above a defender's counters.
// Both carry source: "manual" (entered by an officer) or "mcocscout" (from
// scripts/import-mcocscout-counters.mjs, which never overwrites manual rows).

export const COUNTERS = "counters";
export const COUNTER_PROFILES = "counterProfiles";

export const COUNTER_STRENGTHS = ["hard", "soft"] as const;
export type CounterStrength = (typeof COUNTER_STRENGTHS)[number];

export const CHAMPION_CLASSES = ["Cosmic", "Tech", "Mutant", "Skill", "Science", "Mystic"] as const;
export type ChampionClass = (typeof CHAMPION_CLASSES)[number];

export type CounterChampion = { id: string; name: string; imageUrl: string | null };

export type Counter = {
  id: string;
  defenderId: string;
  counterId: string;
  strength: CounterStrength;
  note: string;
  order: number;
};

export type CounterProfile = {
  championId: string;
  championClass: ChampionClass | null;
  keyAbilities: string[];
  immunities: string[];
};

/** The signed-in member's copy of a champion, so counters they own can be marked. */
export type OwnedChampion = {
  championId: string;
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  ascended: number | null;
  awakened: boolean | null;
};

export type CounterData = {
  champions: CounterChampion[];
  counters: Counter[];
  profiles: CounterProfile[];
  owned: OwnedChampion[];
};

/** Hard counters first, then the officer-set order. */
export function compareCounters(a: Counter, b: Counter): number {
  if (a.strength !== b.strength) return a.strength === "hard" ? -1 : 1;
  return a.order - b.order;
}
