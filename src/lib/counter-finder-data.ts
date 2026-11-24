// Loads the Counter Finder's base JSON (src/data/counters) and merges editor
// overrides over it. Pure: safe in the browser, on the server and in tests.

import effectsJson from "@/data/counters/effects.json";
import championsJson from "@/data/counters/champions.json";
import bossesJson from "@/data/counters/bosses.json";
import nodesJson from "@/data/counters/nodes.json";
import {
  CLASSES,
  CONFIDENCE_LEVELS,
  slugify,
  type BossData,
  type ChampionData,
  type Confidence,
  type EffectDef,
  type FinderClass,
  type FinderData,
  type NodeData,
  type TraitDef,
  type TraitWeight
} from "./counter-finder";

export const OVERRIDE_KINDS = ["champion", "boss", "node", "effect", "trait"] as const;
export type OverrideKind = (typeof OVERRIDE_KINDS)[number];

/** An editor's correction: replaces (or adds, or with deleted, hides) one entry. */
export type DataOverride = {
  kind: OverrideKind;
  id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type Raw = Record<string, unknown>;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const confidence = (v: unknown): Confidence =>
  CONFIDENCE_LEVELS.includes(v as Confidence) ? (v as Confidence) : "low";
const championClass = (v: unknown): FinderClass | null =>
  CLASSES.includes(v as FinderClass) ? (v as FinderClass) : null;

function traitWeights(v: unknown): TraitWeight[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is Raw => Boolean(t) && typeof t === "object" && typeof (t as Raw).trait === "string")
    .map((t) => ({
      trait: t.trait as string,
      weight: typeof t.weight === "number" ? Math.max(0, Math.min(5, t.weight)) : 1,
      ...(text(t.why) ? { why: text(t.why) } : {})
    }));
}

function resistances(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Raw)) if (typeof n === "number") out[k] = n;
  return out;
}

const entryId = (raw: Raw): string => (typeof raw.id === "string" && raw.id ? raw.id : slugify(String(raw.name ?? "")));

export function normalizeChampion(raw: Raw): ChampionData {
  return {
    id: entryId(raw),
    name: String(raw.name ?? ""),
    class: championClass(raw.class),
    immunities: strings(raw.immunities),
    resistances: resistances(raw.resistances),
    traits: strings(raw.traits),
    inflicts: strings(raw.inflicts),
    confidence: confidence(raw.confidence),
    ...(text(raw.notes) ? { notes: text(raw.notes) } : {})
  };
}

export function normalizeBoss(raw: Raw): BossData {
  const name = String(raw.name ?? "");
  return {
    id: entryId(raw),
    name,
    championId: slugify(typeof raw.champion === "string" ? raw.champion : name),
    class: championClass(raw.class),
    inflicts: strings(raw.inflicts),
    immunities: strings(raw.immunities),
    helpfulTraits: traitWeights(raw.helpfulTraits),
    harmfulTraits: traitWeights(raw.harmfulTraits),
    favorsInflicts: strings(raw.favorsInflicts),
    strongCounters: strings(raw.strongCounters),
    avoid: strings(raw.avoid),
    confidence: confidence(raw.confidence),
    ...(text(raw.notes) ? { notes: text(raw.notes) } : {})
  };
}

export function normalizeNode(raw: Raw): NodeData {
  return {
    id: entryId(raw),
    name: String(raw.name ?? ""),
    inflicts: strings(raw.inflicts),
    helpfulTraits: traitWeights(raw.helpfulTraits),
    favorsInflicts: strings(raw.favorsInflicts),
    grantsImmunities: strings(raw.grantsImmunities),
    confidence: confidence(raw.confidence),
    ...(text(raw.notes) ? { notes: text(raw.notes) } : {})
  };
}

function normalizeEffect(raw: Raw): EffectDef {
  return {
    id: entryId(raw),
    name: String(raw.name ?? ""),
    category: String(raw.category ?? "other"),
    ...(strings(raw.aliases).length ? { aliases: strings(raw.aliases) } : {}),
    ...(text(raw.notes) ? { notes: text(raw.notes) } : {})
  };
}

function normalizeTrait(raw: Raw): TraitDef {
  return { id: entryId(raw), name: String(raw.name ?? ""), ...(text(raw.notes) ? { notes: text(raw.notes) } : {}) };
}

/** The raw entries exactly as stored in the JSON files, per kind. */
export type RawDataSet = Record<OverrideKind, Raw[]>;

export const BASE_RAW: RawDataSet = {
  effect: effectsJson.effects as Raw[],
  trait: effectsJson.traits as Raw[],
  champion: championsJson.champions as Raw[],
  boss: bossesJson.bosses as Raw[],
  node: nodesJson.nodes as Raw[]
};

/** Applies overrides to the raw entries. A merged entry keeps the base entry's position. */
export function mergeRaw(base: RawDataSet, overrides: DataOverride[]): RawDataSet {
  const out = {} as RawDataSet;
  for (const kind of OVERRIDE_KINDS) {
    const byId = new Map(overrides.filter((o) => o.kind === kind).map((o) => [o.id, o]));
    const seen = new Set<string>();
    const merged: Raw[] = [];
    for (const entry of base[kind]) {
      const id = entryId(entry);
      seen.add(id);
      const override = byId.get(id);
      if (override?.deleted) continue;
      merged.push(override?.data ? { ...override.data } : entry);
    }
    byId.forEach((override, id) => {
      if (!seen.has(id) && !override.deleted && override.data) merged.push({ ...override.data });
    });
    out[kind] = merged;
  }
  return out;
}

export function buildFinderData(raw: RawDataSet): FinderData {
  return {
    effects: raw.effect.map(normalizeEffect),
    traits: raw.trait.map(normalizeTrait),
    champions: raw.champion.map(normalizeChampion),
    bosses: raw.boss.map(normalizeBoss),
    nodes: raw.node.map(normalizeNode)
  };
}

export function loadFinderData(overrides: DataOverride[] = []): FinderData {
  return buildFinderData(mergeRaw(BASE_RAW, overrides));
}

/** The merged data in the same shape as the JSON files, for exporting back to the repo. */
export function exportFiles(raw: RawDataSet): Record<string, unknown> {
  return {
    "effects.json": { _readme: effectsJson._readme, effects: raw.effect, traits: raw.trait },
    "champions.json": { _readme: championsJson._readme, champions: raw.champion },
    "bosses.json": { _readme: bossesJson._readme, bosses: raw.boss },
    "nodes.json": { _readme: nodesJson._readme, nodes: raw.node }
  };
}

export type ValidationIssue = { kind: OverrideKind; id: string; message: string };

/** Checks references between files: unknown effects, traits, champions or classes. */
export function validateData(data: FinderData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const effects = new Set(data.effects.map((e) => e.id));
  const traits = new Set(data.traits.map((t) => t.id));
  const champions = new Set(data.champions.map((c) => c.id));
  const checkIds = (kind: OverrideKind, id: string, label: string, values: string[], known: Set<string>) => {
    for (const v of values) if (!known.has(v)) issues.push({ kind, id, message: `${label}: unknown "${v}"` });
  };
  const checkDupes = (kind: OverrideKind, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) issues.push({ kind, id, message: "Entry has no name" });
      if (seen.has(id)) issues.push({ kind, id, message: "Duplicate entry" });
      seen.add(id);
    }
  };
  checkDupes("champion", data.champions.map((c) => c.id));
  checkDupes("boss", data.bosses.map((b) => b.id));
  checkDupes("node", data.nodes.map((n) => n.id));
  checkDupes("effect", data.effects.map((e) => e.id));
  checkDupes("trait", data.traits.map((t) => t.id));

  for (const c of data.champions) {
    if (!c.class) issues.push({ kind: "champion", id: c.id, message: "Missing or unknown class" });
    checkIds("champion", c.id, "immunities", c.immunities, effects);
    checkIds("champion", c.id, "resistances", Object.keys(c.resistances), effects);
    checkIds("champion", c.id, "inflicts", c.inflicts, effects);
    checkIds("champion", c.id, "traits", c.traits, traits);
  }
  for (const b of data.bosses) {
    checkIds("boss", b.id, "inflicts", b.inflicts, effects);
    checkIds("boss", b.id, "immunities", b.immunities, effects);
    checkIds("boss", b.id, "favorsInflicts", b.favorsInflicts, effects);
    checkIds("boss", b.id, "helpfulTraits", b.helpfulTraits.map((t) => t.trait), traits);
    checkIds("boss", b.id, "harmfulTraits", b.harmfulTraits.map((t) => t.trait), traits);
    checkIds("boss", b.id, "strongCounters", b.strongCounters.map(slugify), champions);
    checkIds("boss", b.id, "avoid", b.avoid.map(slugify), champions);
  }
  for (const n of data.nodes) {
    checkIds("node", n.id, "inflicts", n.inflicts, effects);
    checkIds("node", n.id, "favorsInflicts", n.favorsInflicts, effects);
    checkIds("node", n.id, "grantsImmunities", n.grantsImmunities, effects);
    checkIds("node", n.id, "helpfulTraits", n.helpfulTraits.map((t) => t.trait), traits);
  }
  return issues;
}
