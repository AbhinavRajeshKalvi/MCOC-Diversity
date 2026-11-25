import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { loadRosterCards, renderRoster } from "./render";
import type { Db } from "mongodb";
import { normalizeAscension } from "../../src/lib/ascension";
import { ObjectId, allianceMembers, allianceName, type Member } from "./store";

// Champion lookups for autocomplete, /findchamp and chat watching.

export type ChampionRef = { id: string; name: string };

let championCache: { at: number; list: ChampionRef[] } | null = null;

/** Every champion in the app, cached for 10 minutes. */
export async function allChampions(db: Db): Promise<ChampionRef[]> {
  if (championCache && Date.now() - championCache.at < 10 * 60 * 1000) return championCache.list;
  const docs = await db.collection("champions").find({}, { projection: { name: 1 } }).toArray();
  const list = docs.map((doc) => ({ id: String(doc._id), name: String(doc.name) })).sort((a, b) => a.name.localeCompare(b.name));
  championCache = { at: Date.now(), list };
  return list;
}

export function squash(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

/** Champions whose name starts with, then contains, the search text. */
export function searchChampions(list: ChampionRef[], query: string, limit = 25): ChampionRef[] {
  const q = squash(query);
  if (!q) return list.slice(0, limit);
  const starts = list.filter((c) => squash(c.name).startsWith(q));
  const contains = list.filter((c) => !starts.includes(c) && squash(c.name).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** The best single match for a name typed in chat, or null. */
export function matchChampion(list: ChampionRef[], text: string): ChampionRef | null {
  const q = squash(text);
  if (q.length < 3) return null;
  const exact = list.find((c) => squash(c.name) === q);
  if (exact) return exact;
  // "hercules" should match "Hercules"; "doom" should match "Doctor Doom" only if it's the only one.
  const starts = list.filter((c) => squash(c.name).startsWith(q));
  if (starts.length === 1) return starts[0];
  const contains = list.filter((c) => squash(c.name).includes(q));
  return contains.length === 1 ? contains[0] : null;
}

export type RosterChampion = {
  championId: string;
  name: string;
  stars: number | null;
  rank: number | null;
  sig: number | null;
  ascended: number | null;
};

/** A member's roster, strongest first. */
export async function memberRoster(db: Db, userId: ObjectId): Promise<RosterChampion[]> {
  const rows = await db
    .collection("rosterEntries")
    .aggregate([
      { $match: { userId } },
      { $lookup: { from: "champions", localField: "championId", foreignField: "_id", as: "champion" } },
      { $unwind: "$champion" }
    ])
    .toArray();
  return rows
    .map((row) => ({
      championId: String(row.championId),
      name: String(row.champion.name),
      stars: row.stars ?? null,
      rank: row.rank ?? null,
      sig: row.sigLevel ?? null,
      ascended: normalizeAscension(row.ascended) || null
    }))
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.rank ?? 0) - (a.rank ?? 0) || a.name.localeCompare(b.name));
}

export type Owner = { member: Member; stars: number | null; rank: number | null; sig: number | null; ascended: number | null };

/** Members of the alliance who have this champion, strongest copy first. */
export async function championOwners(
  db: Db,
  allianceId: ObjectId,
  championId: string,
  battlegroup: number | null = null
): Promise<Owner[]> {
  const members = (await allianceMembers(db, allianceId)).filter((m) => !battlegroup || m.battlegroup === battlegroup);
  const byId = new Map(members.map((m) => [String(m._id), m]));
  const rows = await db
    .collection("rosterEntries")
    .find({ championId: new ObjectId(championId), userId: { $in: members.map((m) => m._id) } })
    .toArray();
  return rows
    .map((row) => ({
      member: byId.get(String(row.userId))!,
      stars: row.stars ?? null,
      rank: row.rank ?? null,
      sig: row.sigLevel ?? null,
      ascended: normalizeAscension(row.ascended) || null
    }))
    .filter((owner) => owner.member)
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.rank ?? 0) - (a.rank ?? 0) || (b.sig ?? 0) - (a.sig ?? 0));
}

export function ownerLine(owner: Owner): string {
  const bits = [
    owner.stars ? `${owner.stars}★` : null,
    owner.rank ? `R${owner.rank}` : null,
    owner.sig ? `sig ${owner.sig}` : null,
    owner.ascended ? `asc ${owner.ascended}` : null
  ].filter(Boolean);
  const bg = owner.member.battlegroup ? ` · BG ${owner.member.battlegroup}` : "";
  return `**${owner.member.displayName}**${bits.length ? ` — ${bits.join(" ")}` : ""}${bg}`;
}

/** The reply for /findchamp and "anyone have …?": every copy, strongest first. */
export function findChampEmbed(championName: string, owners: Owner[], battlegroup: number | null = null): EmbedBuilder {
  const where = battlegroup ? `BG ${battlegroup}` : "the alliance";
  const shown = owners.slice(0, 40).map(ownerLine);
  if (owners.length > shown.length) shown.push(`…and ${owners.length - shown.length} more`);
  return new EmbedBuilder()
    .setColor(0xe0a93b)
    .setTitle(`${championName} in ${where} (${owners.length})`)
    .setDescription(shown.length ? shown.join("\n") : `Nobody in ${where} has ${championName} on their roster.`);
}

/**
 * A whole roster as messages of embeds, grouped by rank, strongest
 * first. Discord allows 4096 characters per embed and 6000 per message, so a
 * big roster is split across several.
 */
export function rosterMessages(member: Member, roster: RosterChampion[]): EmbedBuilder[][] {
  const title = `${member.displayName}'s roster (${roster.length})${member.battlegroup ? ` · BG ${member.battlegroup}` : ""}`;
  if (roster.length === 0) {
    return [[new EmbedBuilder().setColor(0xe0a93b).setTitle(title).setDescription("No champions on this roster yet.")]];
  }
  const groups = new Map<string, string[]>();
  const byRank = [...roster].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  for (const c of byRank) {
    const key = c.rank ? `Rank ${c.rank}` : "Unranked";
    const bits = [c.rank ? `R${c.rank}` : null, c.sig ? `s${c.sig}` : null, c.ascended ? `A${c.ascended}` : null].filter(Boolean);
    groups.set(key, [...(groups.get(key) ?? []), `${c.name}${bits.length ? ` (${bits.join(" ")})` : ""}`]);
  }
  const blocks: string[] = [];
  for (const [key, names] of groups) {
    // One block per star level; very long levels are split.
    let block = `**${key}** · ${names.length}\n`;
    for (const name of names) {
      const next = block.endsWith("\n") ? name : `, ${name}`;
      if (block.length + next.length > 1800) {
        blocks.push(block);
        block = `**${key}** (cont.)\n${name}`;
      } else block += next;
    }
    blocks.push(block);
  }
  const embeds: EmbedBuilder[] = [];
  let text = "";
  for (const block of blocks) {
    if (text && text.length + block.length + 2 > 3800) {
      embeds.push(new EmbedBuilder().setColor(0xe0a93b).setDescription(text));
      text = "";
    }
    text += (text ? "\n\n" : "") + block;
  }
  if (text) embeds.push(new EmbedBuilder().setColor(0xe0a93b).setDescription(text));
  embeds[0].setTitle(title);
  // Two embeds of up to ~3,800 characters stay under 6,000 per message only one at a time.
  return embeds.map((embed) => [embed]);
}

/**
 * The /roster reply: a picture of the whole roster, or the text version if
 * drawing fails. Returns one message's worth per entry.
 */
/** By default /roster shows rank 4 and up; `all` shows every champion, `rank` one rank only. */
export const ROSTER_MIN_RANK = 4;

export type RosterFilter = { all?: boolean; rank?: number | null };

export async function rosterReplies(
  db: Db,
  member: Member,
  filter: RosterFilter = {}
): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }[]> {
  const rank = filter.rank ?? null;
  const all = !rank && !!filter.all;
  const keep = (r: number | null) => (rank ? (r ?? 0) === rank : all || (r ?? 0) >= ROSTER_MIN_RANK);
  const label = rank ? `Rank ${rank}` : all ? null : `Rank ${ROSTER_MIN_RANK}+`;
  try {
    const everything = await loadRosterCards(db, member._id);
    const cards = everything.filter((card) => keep(card.rank));
    const image = await renderRoster(cards, {
      displayName: member.displayName,
      battlegroup: member.battlegroup,
      allianceName: member.allianceId ? await allianceName(db, member.allianceId) : "",
      note: label ? `${label} · ${cards.length} of ${everything.length} champions` : null
    });
    const file = new AttachmentBuilder(image, { name: "roster.jpg" });
    const embed = new EmbedBuilder()
      .setColor(0xe0a93b)
      .setTitle(`${member.displayName}'s roster${rank ? ` · R${rank}` : all ? "" : ` · R${ROSTER_MIN_RANK}+`} (${cards.length})`)
      .setImage("attachment://roster.jpg");
    if (!all && !rank) embed.setFooter({ text: "Add rank to see one rank, or all:True for every champion" });
    return [{ embeds: [embed], files: [file] }];
  } catch (err) {
    console.error("[roster image]", err);
    const roster = (await memberRoster(db, member._id)).filter((c) => keep(c.rank));
    return rosterMessages(member, roster).map((embeds) => ({ embeds, files: [] }));
  }
}
