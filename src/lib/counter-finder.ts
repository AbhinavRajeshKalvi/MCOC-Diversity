// Counter Finder: rank champions for a fight (a boss or defender plus node
// effects) from the effects/immunities data in src/data/counters/*.json.
// Pure functions only (no I/O), so it runs on the server, in the browser and in tests.

export const CLASSES = ["Cosmic", "Tech", "Mutant", "Skill", "Science", "Mystic"] as const;
export type FinderClass = (typeof CLASSES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type EffectDef = { id: string; name: string; category: string; aliases?: string[]; notes?: string };
export type TraitDef = { id: string; name: string; notes?: string };
export type TraitWeight = { trait: string; weight: number; why?: string };

export type ChampionData = {
  id: string;
  name: string;
  class: FinderClass | null;
  immunities: string[];
  /** Partial resistances, effect id -> rough percent (0-100). */
  resistances: Record<string, number>;
  traits: string[];
  /** Effects this champion's damage relies on (checked against boss immunities). */
  inflicts: string[];
  confidence: Confidence;
  notes?: string;
};

export type BossData = {
  id: string;
  name: string;
  /** Id of the matching champions.json entry, if any. */
  championId: string | null;
  class: FinderClass | null;
  inflicts: string[];
  immunities: string[];
  helpfulTraits: TraitWeight[];
  harmfulTraits: TraitWeight[];
  favorsInflicts: string[];
  strongCounters: string[];
  avoid: string[];
  confidence: Confidence;
  notes?: string;
};

export type NodeData = {
  id: string;
  name: string;
  inflicts: string[];
  helpfulTraits: TraitWeight[];
  favorsInflicts: string[];
  grantsImmunities: string[];
  confidence: Confidence;
  notes?: string;
};

export type FinderData = {
  effects: EffectDef[];
  traits: TraitDef[];
  champions: ChampionData[];
  bosses: BossData[];
  nodes: NodeData[];
};

/** A champion in the signed-in member's roster, keyed by finder champion id. */
export type RosterEntry = {
  championId: string;
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  /** PI. */
  rating: number | null;
  ascended: number | null;
  awakened: boolean | null;
};

/** An officer-entered pick from the existing Counters page. */
export type OfficerCounter = { defenderId: string; counterId: string; strength: "hard" | "soft" };

export type FightSelection = {
  /** A boss id, or a champion id to fight that champion as a defender. */
  bossId: string | null;
  nodeIds: string[];
  /** Raw effects picked directly. */
  effectIds: string[];
};

export type FinderOptions = {
  onlyRoster: boolean;
  officerCounters?: OfficerCounter[];
  /** Champions that exist in the app but have no data yet (shown with low confidence). */
  extraChampions?: { id: string; name: string }[];
};

export type Reason = { tone: "good" | "bad" | "info"; text: string };

export type ScoreBreakdown = {
  immunity: number;
  classAdvantage: number;
  matchup: number;
  roster: number;
  total: number;
};

export type CounterResult = {
  championId: string;
  name: string;
  championClass: FinderClass | null;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: Reason[];
  /** Lowest confidence of the data this score used (champion, boss and nodes). */
  confidence: Confidence;
  /** Confidence of this champion's own entry. */
  championConfidence: Confidence;
  hasData: boolean;
  owned: RosterEntry | null;
  coverage: { immune: string[]; resisted: string[]; exposed: string[] };
};

export type Threat = { effectId: string; weight: number; sources: string[] };

export type Fight = {
  boss: BossData | null;
  nodes: NodeData[];
  threats: Threat[];
  /** Effects the defender ignores, from the boss kit and nodes. */
  defenderImmunities: Map<string, string[]>;
  helpfulTraits: Map<string, { weight: number; whys: string[] }>;
  harmfulTraits: Map<string, { weight: number; whys: string[] }>;
  favorsInflicts: Map<string, string[]>;
  confidence: Confidence;
};

// ---- Point scale --------------------------------------------------------
// Immunity: up to 35 for covering every threat (weighted), +10 more when fully
// immune to all of them. Class: +/-10. Matchup: listed counters and traits.
// Roster: up to 25 for rarity, rank, sig, ascension and PI.
export const POINTS = {
  immunityCoverage: 35,
  fullImmunityBonus: 10,
  resistanceFactor: 0.7,
  classAdvantage: 10,
  strongCounter: 18,
  officerHard: 15,
  officerSoft: 8,
  avoid: -15,
  traitPerWeight: 3,
  traitCap: 24,
  blockedDamageType: -5,
  blockedCap: -15,
  favoredDamageType: 5,
  rosterMax: 25
} as const;

/** Threats you picked (nodes, raw effects) weigh more than the boss's own kit. */
const BOSS_THREAT_WEIGHT = 0.6;
const PICKED_THREAT_WEIGHT = 1;

// Cosmic > Tech > Mutant > Skill > Science > Mystic > Cosmic.
const BEATS: Record<FinderClass, FinderClass> = {
  Cosmic: "Tech",
  Tech: "Mutant",
  Mutant: "Skill",
  Skill: "Science",
  Science: "Mystic",
  Mystic: "Cosmic"
};

/** +1 if attacker has class advantage over defender, -1 if disadvantage, 0 otherwise. */
export function classMatchup(attacker: FinderClass | null, defender: FinderClass | null): -1 | 0 | 1 {
  if (!attacker || !defender) return 0;
  if (BEATS[attacker] === defender) return 1;
  if (BEATS[defender] === attacker) return -1;
  return 0;
}

/** Stable id from a name: "Jack O'Lantern" -> "jack-o-lantern", "Ægon" -> "aegon". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

export function lowestConfidence(levels: Confidence[]): Confidence {
  let worst: Confidence = "high";
  for (const level of levels) if (CONFIDENCE_RANK[level] > CONFIDENCE_RANK[worst]) worst = level;
  return worst;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export type FinderIndex = {
  data: FinderData;
  effectName: (id: string) => string;
  traitName: (id: string) => string;
  championsById: Map<string, ChampionData>;
  bossesById: Map<string, BossData>;
  nodesById: Map<string, NodeData>;
};

export function indexData(data: FinderData): FinderIndex {
  const effects = new Map(data.effects.map((e) => [e.id, e.name]));
  const traits = new Map(data.traits.map((t) => [t.id, t.name]));
  return {
    data,
    effectName: (id) => effects.get(id) ?? id,
    traitName: (id) => traits.get(id) ?? id,
    championsById: new Map(data.champions.map((c) => [c.id, c])),
    bossesById: new Map(data.bosses.map((b) => [b.id, b])),
    nodesById: new Map(data.nodes.map((n) => [n.id, n]))
  };
}

/** A champion with no boss entry, fought as a defender: its class and immunities only. */
export function championAsBoss(champion: ChampionData): BossData {
  return {
    id: champion.id,
    name: champion.name,
    championId: champion.id,
    class: champion.class,
    inflicts: champion.inflicts.filter((e) => e !== "armor-break"),
    immunities: champion.immunities,
    helpfulTraits: [],
    harmfulTraits: [],
    favorsInflicts: [],
    strongCounters: [],
    avoid: [],
    confidence: champion.confidence,
    notes: "No boss entry: using this champion's class, immunities and damage types."
  };
}

export function resolveBoss(index: FinderIndex, bossId: string | null): BossData | null {
  if (!bossId) return null;
  const boss = index.bossesById.get(bossId);
  if (boss) return boss;
  const champion = index.championsById.get(bossId);
  return champion ? championAsBoss(champion) : null;
}

function addTraits(
  target: Map<string, { weight: number; whys: string[] }>,
  traits: TraitWeight[]
) {
  for (const { trait, weight, why } of traits) {
    const current = target.get(trait) ?? { weight: 0, whys: [] };
    current.weight = Math.max(current.weight, weight);
    if (why && !current.whys.includes(why)) current.whys.push(why);
    target.set(trait, current);
  }
}

/** Everything the fight throws at you and what helps, merged from boss, nodes and raw effects. */
export function describeFight(index: FinderIndex, selection: FightSelection): Fight {
  const boss = resolveBoss(index, selection.bossId);
  const nodes = selection.nodeIds
    .map((id) => index.nodesById.get(id))
    .filter((n): n is NodeData => Boolean(n));

  const threats = new Map<string, Threat>();
  const addThreat = (effectId: string, weight: number, source: string) => {
    const threat = threats.get(effectId) ?? { effectId, weight: 0, sources: [] };
    threat.weight = Math.max(threat.weight, weight);
    if (!threat.sources.includes(source)) threat.sources.push(source);
    threats.set(effectId, threat);
  };
  if (boss) for (const e of boss.inflicts) addThreat(e, BOSS_THREAT_WEIGHT, boss.name);
  for (const node of nodes) for (const e of node.inflicts) addThreat(e, PICKED_THREAT_WEIGHT, node.name);
  for (const e of selection.effectIds) addThreat(e, PICKED_THREAT_WEIGHT, "picked effect");

  const defenderImmunities = new Map<string, string[]>();
  const addImmunity = (effectId: string, source: string) => {
    const sources = defenderImmunities.get(effectId) ?? [];
    if (!sources.includes(source)) sources.push(source);
    defenderImmunities.set(effectId, sources);
  };
  if (boss) for (const e of boss.immunities) addImmunity(e, boss.name);
  for (const node of nodes) for (const e of node.grantsImmunities) addImmunity(e, node.name);

  const helpfulTraits = new Map<string, { weight: number; whys: string[] }>();
  const harmfulTraits = new Map<string, { weight: number; whys: string[] }>();
  if (boss) {
    addTraits(helpfulTraits, boss.helpfulTraits);
    addTraits(harmfulTraits, boss.harmfulTraits);
  }
  for (const node of nodes) addTraits(helpfulTraits, node.helpfulTraits);
  // A node that nullifies you hurts buff-reliant champions.
  if (threats.has("nullify")) addTraits(harmfulTraits, [{ trait: "buff-heavy", weight: 1, why: "your buffs get removed" }]);

  const favorsInflicts = new Map<string, string[]>();
  for (const source of [...(boss ? [boss] : []), ...nodes]) {
    for (const e of source.favorsInflicts) favorsInflicts.set(e, [...(favorsInflicts.get(e) ?? []), source.name]);
  }

  return {
    boss,
    nodes,
    threats: Array.from(threats.values()),
    defenderImmunities,
    helpfulTraits,
    harmfulTraits,
    favorsInflicts,
    confidence: lowestConfidence([...(boss ? [boss.confidence] : []), ...nodes.map((n) => n.confidence)])
  };
}

const MAX_RANK_BY_STARS: Record<number, number> = { 7: 6, 6: 5, 5: 5, 4: 5, 3: 4, 2: 3, 1: 2 };
const STAR_POINTS: Record<number, number> = { 7: 12, 6: 9, 5: 6, 4: 3, 3: 1, 2: 0.5, 1: 0 };

/** 0-25 points for how built-up the member's copy is, PI compared with their best champion. */
export function rosterPoints(entry: RosterEntry, maxRating: number): number {
  const stars = entry.stars ?? 0;
  let points = STAR_POINTS[stars] ?? 0;
  const maxRank = MAX_RANK_BY_STARS[stars] ?? 5;
  if (entry.rank != null && maxRank > 1) points += (Math.min(entry.rank, maxRank) - 1) / (maxRank - 1) * 5;
  if (entry.sigLevel != null) points += Math.min(entry.sigLevel, 200) / 200 * 3;
  if (entry.ascended) points += Math.min(entry.ascended, 3) * 0.5;
  if (entry.rating && maxRating > 0) points += Math.min(entry.rating / maxRating, 1) * 3.5;
  return Math.min(round1(points), POINTS.rosterMax);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function emptyChampion(id: string, name: string): ChampionData {
  return {
    id,
    name,
    class: null,
    immunities: [],
    resistances: {},
    traits: [],
    inflicts: [],
    confidence: "low",
    notes: "No counter data for this champion yet."
  };
}

/** Scores one champion against a described fight. */
export function scoreChampion(
  index: FinderIndex,
  fight: Fight,
  champion: ChampionData,
  owned: RosterEntry | null,
  context: { maxRating: number; officer: Map<string, "hard" | "soft">; hasData: boolean }
): CounterResult {
  const reasons: Reason[] = [];
  const name = (id: string) => index.effectName(id);
  const bossName = fight.boss?.name ?? "this fight";

  // (a) Immunity / resistance to what the fight inflicts.
  const immune: string[] = [];
  const resisted: string[] = [];
  const exposed: string[] = [];
  let immunity = 0;
  if (fight.threats.length > 0) {
    let covered = 0;
    let total = 0;
    for (const threat of fight.threats) {
      total += threat.weight;
      if (champion.immunities.includes(threat.effectId)) {
        immune.push(threat.effectId);
        covered += threat.weight;
      } else if (champion.resistances[threat.effectId]) {
        const pct = Math.max(0, Math.min(100, champion.resistances[threat.effectId]!));
        resisted.push(threat.effectId);
        covered += threat.weight * POINTS.resistanceFactor * (pct / 100);
      } else {
        exposed.push(threat.effectId);
      }
    }
    immunity = POINTS.immunityCoverage * (covered / total);
    if (exposed.length === 0 && resisted.length === 0) {
      immunity += POINTS.fullImmunityBonus;
    }
    if (immune.length > 0) {
      const all = immune.length === fight.threats.length ? " (every effect in this fight)" : "";
      reasons.push({ tone: "good", text: `Immune to ${joinNames(immune.map(name))}${all}` });
    }
    for (const e of resisted) {
      reasons.push({ tone: "good", text: `Resists ${name(e)} (~${champion.resistances[e]}%)` });
    }
    if (exposed.length > 0) {
      reasons.push({ tone: "bad", text: `Not immune to ${joinNames(exposed.map(name))}` });
    }
  }

  // (b) Class advantage.
  let classAdvantage = 0;
  const matchup = classMatchup(champion.class, fight.boss?.class ?? null);
  if (matchup !== 0 && fight.boss?.class && champion.class) {
    classAdvantage = matchup * POINTS.classAdvantage;
    reasons.push(
      matchup > 0
        ? { tone: "good", text: `${champion.class} advantage vs ${fight.boss.class}` }
        : { tone: "bad", text: `${champion.class} is at a class disadvantage vs ${fight.boss.class}` }
    );
  }

  // (c) Matchup quality: listed counters, helpful traits, damage types vs immunities.
  let matchupPts = 0;
  const boss = fight.boss;
  if (boss) {
    const listed = new Set(boss.strongCounters.map(slugify));
    const avoid = new Set(boss.avoid.map(slugify));
    if (listed.has(champion.id)) {
      matchupPts += POINTS.strongCounter;
      reasons.push({ tone: "good", text: `Listed as a strong counter to ${boss.name}` });
    }
    if (avoid.has(champion.id)) {
      matchupPts += POINTS.avoid;
      reasons.push({ tone: "bad", text: `Listed as a poor pick against ${boss.name}` });
    }
  }
  const officer = context.officer.get(champion.id);
  if (officer) {
    matchupPts += officer === "hard" ? POINTS.officerHard : POINTS.officerSoft;
    reasons.push({ tone: "good", text: `Alliance ${officer} counter to ${bossName} (Counters page)` });
  }

  let traitPts = 0;
  const helpful: string[] = [];
  fight.helpfulTraits.forEach((info, trait) => {
    if (!champion.traits.includes(trait)) return;
    traitPts += info.weight * POINTS.traitPerWeight;
    helpful.push(trait);
    const why = info.whys[0] ? `: ${info.whys[0]}` : "";
    reasons.push({ tone: "good", text: `${index.traitName(trait)} helps vs ${bossName}${why}` });
  });
  traitPts = Math.min(traitPts, POINTS.traitCap);
  fight.harmfulTraits.forEach((info, trait) => {
    if (!champion.traits.includes(trait)) return;
    traitPts -= info.weight * POINTS.traitPerWeight;
    const why = info.whys[0] ? `: ${info.whys[0]}` : "";
    reasons.push({ tone: "bad", text: `${index.traitName(trait)} is a liability here${why}` });
  });
  matchupPts += traitPts;

  let blocked = 0;
  for (const e of champion.inflicts) {
    if (fight.defenderImmunities.has(e)) {
      blocked += POINTS.blockedDamageType;
      reasons.push({ tone: "bad", text: `Damage type ${name(e)} blocked by boss immunity` });
    }
  }
  matchupPts += Math.max(blocked, POINTS.blockedCap);
  fight.favorsInflicts.forEach((sources, e) => {
    if (!champion.inflicts.includes(e) || fight.defenderImmunities.has(e)) return;
    matchupPts += POINTS.favoredDamageType;
    reasons.push({ tone: "good", text: `${name(e)} damage is rewarded here (${joinNames(sources)})` });
  });

  // (d) Roster strength.
  const roster = owned ? rosterPoints(owned, context.maxRating) : 0;
  if (!owned) reasons.push({ tone: "info", text: "Not in your roster" });

  if (!context.hasData) reasons.push({ tone: "info", text: "No counter data for this champion yet" });
  if (champion.notes && context.hasData) reasons.push({ tone: "info", text: champion.notes });

  const breakdown: ScoreBreakdown = {
    immunity: round1(immunity),
    classAdvantage,
    matchup: round1(matchupPts),
    roster,
    total: 0
  };
  breakdown.total = round1(breakdown.immunity + breakdown.classAdvantage + breakdown.matchup + breakdown.roster);

  return {
    championId: champion.id,
    name: champion.name,
    championClass: champion.class,
    score: breakdown.total,
    breakdown,
    reasons,
    confidence: lowestConfidence([champion.confidence, fight.confidence]),
    championConfidence: champion.confidence,
    hasData: context.hasData,
    owned,
    coverage: { immune, resisted, exposed }
  };
}

/** Ranks champions for the fight, best first. */
export function findCounters(
  data: FinderData,
  selection: FightSelection,
  roster: RosterEntry[],
  options: FinderOptions
): CounterResult[] {
  const index = indexData(data);
  const fight = describeFight(index, selection);
  const ownedById = new Map(roster.map((r) => [r.championId, r]));
  const maxRating = roster.reduce((max, r) => Math.max(max, r.rating ?? 0), 0);

  const officer = new Map<string, "hard" | "soft">();
  const defenderIds = new Set([selection.bossId, fight.boss?.championId].filter(Boolean) as string[]);
  for (const pick of options.officerCounters ?? []) {
    if (!defenderIds.has(pick.defenderId)) continue;
    if (officer.get(pick.counterId) !== "hard") officer.set(pick.counterId, pick.strength);
  }

  const candidates = new Map<string, { champion: ChampionData; hasData: boolean }>();
  for (const champion of data.champions) candidates.set(champion.id, { champion, hasData: true });
  for (const extra of options.extraChampions ?? []) {
    if (!candidates.has(extra.id)) candidates.set(extra.id, { champion: emptyChampion(extra.id, extra.name), hasData: false });
  }
  for (const entry of roster) {
    if (!candidates.has(entry.championId)) {
      candidates.set(entry.championId, { champion: emptyChampion(entry.championId, entry.championId), hasData: false });
    }
  }

  const selfIds = new Set([selection.bossId, fight.boss?.championId].filter(Boolean) as string[]);
  const results: CounterResult[] = [];
  candidates.forEach(({ champion, hasData }, id) => {
    if (selfIds.has(id)) return; // a champion doesn't counter itself
    const owned = ownedById.get(id) ?? null;
    if (options.onlyRoster && !owned) return;
    results.push(scoreChampion(index, fight, champion, owned, { maxRating, officer, hasData }));
  });

  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
