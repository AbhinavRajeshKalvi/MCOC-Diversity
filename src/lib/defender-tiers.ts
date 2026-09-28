/**
 * Defender classification used by the Battlegroup planner.
 *
 * These names are the alliance's curated defensive pool. Champions not listed
 * here are intentionally excluded from defender recommendations.
 */
export type DefenderTier = "priority" | "medium";

const PRIORITY_DEFENDERS = [
  // Science
  "High Evolutionary", "Photon", "Rhino", "Spider-Woman", "Thing",
  // Skill
  "Bullseye", "Korg", "Nick Fury", "Yelena Belova",
  // Mutant
  "Captain Britain", "Domino", "Jean Grey", "Onslaught", "Wolverine (Weapon X)",
  // Tech
  "Ant-Man (Future)", "Arnim Zola", "Red Skull", "Ruby Thursday", "Sentinel",
  // Cosmic
  "Heimdall", "Maestro", "Terrax", "The Serpent",
  // Mystic
  "Enchantress", "Kindred", "Mojo", "Nico Minoru"
] as const;

const CURRENTLY_USED_DEFENDERS = [
  // Additional defenders visible in the alliance's current BG diversity boards.
  // Keep these in the curated pool so they remain available as alternatives.
  "Onslaught", "Spider-Ham", "Jean Grey", "Domino", "Peni Parker", "Knull", "Kitty Pryde",
  "Red Skull", "Man-Thing", "Kingpin", "Magneto", "Hulkling", "Photon", "Thing", "Rhino",
  "Spider-Woman", "Sentinel", "Invisible Woman", "Absorbing Man", "Immortal Hulk",
  "Immortal Abomination", "Doctor Doom", "Ebony Maw", "Mephisto", "Sasquatch", "Mysterio",
  "Red Guardian", "Havok", "Bishop", "Apocalypse", "Nightcrawler", "Mister Sinister",
  "Storm (Pyramid X)", "Killmonger", "Baron Zemo", "Attuma", "Kraven", "Korg", "Bullseye",
  "Yelena Belova", "Nick Fury", "Scorpion", "Void", "Wave", "Spot", "Titania", "Gorr",
  "Annihilus", "Maestro", "Vision (Aarkus)", "Tigra", "Spider-Man Supreme", "Enchantress",
  "Kindred", "Mojo", "Nico Minoru"
] as const;

const MEDIUM_DEFENDERS = [
  // Science
  "Immortal Abomination", "Immortal Hulk", "Invisible Woman", "Jessica Jones", "Lizard",
  "MODOK", "Morbius", "Quicksilver", "Scorpion", "Spider-Ham", "Spot", "Titania", "Void", "Wave",
  // Skill
  "Attuma", "Baron Zemo", "Jabari Panther", "Killmonger", "Kraven", "Lumatrix", "Misty Knight",
  // Mutant
  "Apocalypse", "Bishop", "Cassandra Nova", "Dust", "Emma Frost", "Gentle", "Havok", "Kitty Pryde",
  "Mister Sinister", "Nightcrawler", "Pixie", "Sauron", "Storm (Pyramid X)", "Toad",
  // Tech
  "Arcade", "Darkhawk", "Guillotine 2099", "Mysterio", "Omega Sentinel", "Peni Parker", "Shuri",
  "Solvarch", "Viv Vision",
  // Cosmic
  "Adam Warlock", "Annihilus", "Galan", "Gorr", "Hulkling", "Hyperion", "Ikaris", "Knull",
  "Medusa", "Nova", "Sersi", "Vision (Aarkus)",
  // Mystic
  "Absorbing Man", "America Chavez", "Doctor Doom", "Ebony Maw", "Madelyne Pryor", "Man-Thing",
  "Mangog", "Mephisto", "Mordo", "Rintrah", "Sasquatch", "Spider-Man Supreme", "Tigra"
] as const;

/** Names used in the curated list versus the canonical names in the DB. */
const ALIASES: Record<string, string> = {
  "immortal abomination": "abomination (immortal)",
  "immortal hulk": "hulk (immortal)",
  "modok": "m.o.d.o.k.",
  "spider woman": "spider-woman (jessica drew)",
  "spider man supreme": "spider-man (supreme)"
};

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const NORMALIZED_ALIASES = new Map(
  Object.entries(ALIASES).map(([from, to]) => [normalizeName(from), normalizeName(to)])
);

const TIER_BY_NAME = new Map<string, DefenderTier>();

for (const name of PRIORITY_DEFENDERS) TIER_BY_NAME.set(normalizeName(name), "priority");
for (const name of MEDIUM_DEFENDERS) TIER_BY_NAME.set(normalizeName(name), "medium");
for (const name of CURRENTLY_USED_DEFENDERS) {
  const normalized = normalizeName(name);
  if (!TIER_BY_NAME.has(normalized)) TIER_BY_NAME.set(normalized, "medium");
}

for (const [alias, canonical] of NORMALIZED_ALIASES) {
  const tier = TIER_BY_NAME.get(alias);
  if (tier) TIER_BY_NAME.set(canonical, tier);
}

export function getDefenderTier(championName: string): DefenderTier | null {
  return TIER_BY_NAME.get(normalizeName(championName)) ?? null;
}

export function isPriorityDefender(championName: string): boolean {
  return getDefenderTier(championName) === "priority";
}

export function isMediumDefender(championName: string): boolean {
  return getDefenderTier(championName) === "medium";
}
