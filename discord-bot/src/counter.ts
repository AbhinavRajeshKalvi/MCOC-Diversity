import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { loadFinderData } from "../../src/lib/counter-finder-data";
import { loadFinderPageData, loadOverrides } from "../../src/lib/counter-finder-server";
import type { FinderData } from "../../src/lib/counter-finder";
import { UserError } from "./actor";
import { appLink } from "./env";
import { getDb, memberForDiscord, ObjectId } from "./store";
import { bossChoices, buildCounterReply, finderPath, nodeChoices, parseNodes, resolveTarget } from "./counter-format";

// /counter boss:<boss or champion> nodes:<comma-separated node effects> all:<bool>
// Ranks the member's roster with the same Counter Finder as the app.

// Autocomplete runs on every keystroke: keep the merged data for a minute.
const DATA_TTL_MS = 60_000;
let cached: { data: FinderData; at: number } | null = null;

async function finderData(): Promise<FinderData> {
  if (cached && Date.now() - cached.at < DATA_TTL_MS) return cached.data;
  const data = loadFinderData(await loadOverrides(await getDb()));
  cached = { data, at: Date.now() };
  return data;
}

export async function counterAutocomplete(i: AutocompleteInteraction) {
  const focused = i.options.getFocused(true);
  const data = await finderData();
  const typed = String(focused.value ?? "");
  if (focused.name === "boss") return i.respond(bossChoices(data, typed));
  if (focused.name === "nodes") return i.respond(nodeChoices(data, typed));
  return i.respond([]);
}

export async function counter(i: ChatInputCommandInteraction) {
  const db = await getDb();
  const member = await memberForDiscord(db, i.user.id);
  // Not linked: an id no roster uses, so everything but the roster loads.
  const page = await loadFinderPageData(db, (member?._id ?? new ObjectId()).toString());
  const data = loadFinderData(page.overrides);
  cached = { data, at: Date.now() };

  const target = resolveTarget(data, i.options.getString("boss", true));
  if (!target) throw new UserError("I don't know that boss or champion. Pick one from the list as you type.");
  const { nodeIds, unknown } = parseNodes(data, i.options.getString("nodes"));
  const wantAll = i.options.getBoolean("all") ?? false;

  const allReason = !member
    ? "Your Discord isn't linked to War Room, so this isn't your roster: link it in the app under **Account → Discord**, then `/link`."
    : page.roster.length === 0
      ? "Your roster is empty: add champions on **My Roster** in the app."
      : wantAll
        ? "(`all` was on.)"
        : null;
  const useRoster = Boolean(member) && page.roster.length > 0 && !wantAll;

  await i.deferReply();
  const link = appLink(finderPath(target.id, nodeIds, !useRoster));
  const { embed } = buildCounterReply({
    data,
    bossId: target.id,
    nodeIds,
    roster: page.roster,
    options: {
      officerCounters: page.officerCounters,
      extraChampions: page.champions.map((c) => ({ id: c.id, name: c.name }))
    },
    useRoster,
    allReason,
    unknownNodes: unknown,
    names: new Map(page.champions.map((c) => [c.id, c.name])),
    link
  });
  await i.editReply({ embeds: [embed] });
}
