// /counter: picking a fight from typed text, autocomplete lists, and the reply
// embed. Pure (no discord.js or database) so it can be tested with vitest.

import {
  describeFight,
  findCounters,
  indexData,
  joinNames,
  slugify,
  type BossData,
  type Confidence,
  type CounterResult,
  type FinderData,
  type FinderOptions,
  type NodeData,
  type RosterEntry
} from "../../src/lib/counter-finder";

/** The parts of Discord's embed object this reply uses (accepted by discord.js as-is). */
export type CounterEmbed = {
  title: string;
  description: string;
  color: number;
  url?: string;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
};

export type Choice = { name: string; value: string };

const BRASS = 0xe0a93b;
const AUTOCOMPLETE_LIMIT = 25;
const CHOICE_MAX = 100;
export const DEFAULT_SHOWN = 8;
const REASONS_PER_CHAMPION = 3;
const FIELD_MAX = 1024;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
const squash = (text: string) => slugify(text).replace(/-/g, "");

/** Bosses first, then every champion with data: what `boss:` can be. */
export function fightTargets(data: FinderData): { id: string; name: string; isBoss: boolean }[] {
  const bossIds = new Set(data.bosses.map((b) => b.id));
  return [
    ...data.bosses.map((b) => ({ id: b.id, name: b.name, isBoss: true })),
    ...data.champions.filter((c) => !bossIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, isBoss: false }))
  ];
}

/** Finds a boss or champion from an autocomplete value (an id) or typed text. */
export function resolveTarget(data: FinderData, input: string): { id: string; name: string } | null {
  const targets = fightTargets(data);
  const q = squash(input);
  if (!q) return null;
  return (
    targets.find((t) => t.id === input.trim()) ??
    targets.find((t) => squash(t.name) === q) ??
    targets.find((t) => squash(t.name).startsWith(q)) ??
    targets.find((t) => squash(t.name).includes(q)) ??
    null
  );
}

export function bossChoices(data: FinderData, typed: string): Choice[] {
  const q = squash(typed);
  return fightTargets(data)
    .filter((t) => !q || squash(t.name).includes(q))
    .sort((a, b) => {
      const aStarts = squash(a.name).startsWith(q) ? 0 : 1;
      const bStarts = squash(b.name).startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.isBoss !== b.isBoss) return a.isBoss ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, AUTOCOMPLETE_LIMIT)
    .map((t) => ({ name: clip(t.isBoss ? `${t.name} (boss)` : t.name, CHOICE_MAX), value: t.id }));
}

function matchNode(nodes: NodeData[], token: string): NodeData | null {
  const q = squash(token);
  if (!q) return null;
  return (
    nodes.find((n) => n.id === token.trim()) ??
    nodes.find((n) => squash(n.name) === q) ??
    nodes.find((n) => squash(n.name).startsWith(q)) ??
    nodes.find((n) => squash(n.name).includes(q)) ??
    null
  );
}

/**
 * Reads `nodes:` text: comma-separated node ids or names ("incinerate, shock").
 * Words that match no node are returned so the reply can say so.
 */
export function parseNodes(data: FinderData, text: string | null): { nodeIds: string[]; unknown: string[] } {
  const nodeIds: string[] = [];
  const unknown: string[] = [];
  for (const token of (text ?? "").split(",").map((t) => t.trim()).filter(Boolean)) {
    const node = matchNode(data.nodes, token);
    if (!node) unknown.push(token);
    else if (!nodeIds.includes(node.id)) nodeIds.push(node.id);
  }
  return { nodeIds, unknown };
}

/**
 * Autocomplete for the comma-separated `nodes:` option. Discord replaces the
 * whole value with the pick, so each choice keeps the nodes already chosen and
 * adds one more matching the text after the last comma.
 */
export function nodeChoices(data: FinderData, typed: string): Choice[] {
  const parts = typed.split(",");
  const current = parts.pop() ?? "";
  const chosen = parseNodes(data, parts.join(",")).nodeIds;
  const chosenNames = chosen.map((id) => data.nodes.find((n) => n.id === id)!.name);
  const q = squash(current);
  return data.nodes
    .filter((n) => !chosen.includes(n.id) && (!q || squash(n.name).includes(q)))
    .slice(0, AUTOCOMPLETE_LIMIT)
    .map((n) => {
      const ids = [...chosen, n.id].join(",");
      return { name: clip([...chosenNames, n.name].join(", "), CHOICE_MAX), value: clip(ids, CHOICE_MAX) };
    })
    .filter((c) => c.value.length < CHOICE_MAX);
}

const CONFIDENCE_MARK: Record<Confidence, string> = { high: "", medium: " ⚠️", low: " ⚠️⚠️" };

function statLine(owned: RosterEntry | null): string {
  if (!owned) return "";
  const parts = [`★${owned.stars ?? "?"}`, `R${owned.rank ?? "?"}`, `S${owned.sigLevel ?? 0}`];
  if (owned.ascended) parts.push(`A${owned.ascended}`);
  if (owned.rating) parts.push(`PI ${owned.rating.toLocaleString("en-US")}`);
  return parts.join(" ");
}

function championField(result: CounterResult, rank: number, displayName: string) {
  const mark = result.hasData ? CONFIDENCE_MARK[result.championConfidence] : " ❔";
  const header = [result.championClass, statLine(result.owned)].filter(Boolean).join(" · ");
  // Good and bad reasons first; "Not in your roster" and notes only if there's room.
  const reasons = [...result.reasons.filter((r) => r.tone !== "info"), ...result.reasons.filter((r) => r.tone === "info")]
    .slice(0, REASONS_PER_CHAMPION)
    .map((r) => `${r.tone === "good" ? "✅" : r.tone === "bad" ? "❌" : "ℹ️"} ${r.text}`);
  return {
    name: clip(`#${rank} ${displayName} · ${Math.round(result.score)}${mark}`, 256),
    value: clip([header, ...reasons].filter(Boolean).join("\n") || "No details.", FIELD_MAX)
  };
}

export type CounterReplyInput = {
  data: FinderData;
  bossId: string;
  nodeIds: string[];
  roster: RosterEntry[];
  options: Omit<FinderOptions, "onlyRoster">;
  /** Linked and has champions: rank only their roster. */
  useRoster: boolean;
  /** Why we're ranking every champion instead (shown in the reply). */
  allReason: string | null;
  unknownNodes: string[];
  /** Champion display names from the app, by finder id. */
  names?: Map<string, string>;
  /** Link to the web Counter Finder for this fight, when APP_URL is set. */
  link: string | null;
  shown?: number;
};

/** Ranks the fight and builds the reply embed. */
export function buildCounterReply(input: CounterReplyInput): { embed: CounterEmbed; results: CounterResult[] } {
  const { data, bossId, nodeIds } = input;
  const selection = { bossId, nodeIds, effectIds: [] };
  const index = indexData(data);
  const fight = describeFight(index, selection);
  const results = findCounters(data, selection, input.roster, { ...input.options, onlyRoster: input.useRoster });
  const boss = fight.boss as BossData;
  const shown = input.shown ?? DEFAULT_SHOWN;

  const lines: string[] = [];
  const nodeNames = fight.nodes.map((n) => n.name);
  lines.push(`**${boss.name}**${boss.class ? ` (${boss.class})` : ""}${nodeNames.length ? ` + ${joinNames(nodeNames)}` : ""}`);
  lines.push(`Inflicts: ${fight.threats.length ? fight.threats.map((t) => index.effectName(t.effectId)).join(", ") : "nothing modelled"}`);
  if (fight.defenderImmunities.size) {
    lines.push(`Defender immune to: ${Array.from(fight.defenderImmunities.keys()).map(index.effectName).join(", ")}`);
  }
  if (input.unknownNodes.length) lines.push(`Ignored (no matching node): ${input.unknownNodes.join(", ")}`);
  lines.push(input.useRoster ? `Ranking **your roster** (${results.length} champions).` : `Ranking **all champions**. ${input.allReason ?? ""}`.trim());
  if (fight.confidence !== "high") {
    lines.push(`⚠️ The ${boss.name}/node data is ${fight.confidence} confidence: double-check in game.`);
  }

  const fields = results.slice(0, shown).map((r, i) => championField(r, i + 1, input.names?.get(r.championId) ?? r.name));
  if (fields.length === 0) fields.push({ name: "No champions to rank", value: "Add champions on My Roster in the app." });

  const more = results.length > shown ? `${results.length - shown} more` : "";
  const embed: CounterEmbed = {
    title: clip(`Counters vs ${boss.name}`, 256),
    description: clip(lines.join("\n"), 4000),
    color: BRASS,
    fields,
    footer: {
      text: clip(
        [more && (input.link ? `${more} on the web Counter Finder` : more), "⚠️ medium / ⚠️⚠️ low confidence data · ❔ no data"]
          .filter(Boolean)
          .join(" · "),
        2048
      )
    }
  };
  if (input.link) embed.url = input.link;
  return { embed, results };
}

/** The web Counter Finder URL for this fight. */
export function finderPath(bossId: string, nodeIds: string[], all: boolean): string {
  const params = new URLSearchParams({ boss: bossId });
  if (nodeIds.length) params.set("nodes", nodeIds.join(","));
  if (all) params.set("all", "1");
  return `/counters/finder?${params.toString()}`;
}
