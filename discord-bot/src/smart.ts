import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Message } from "discord.js";
import { nodeSlot } from "../../src/lib/attack-map";
import { loadAttackBoard } from "../../src/lib/attack-plans";
import { getWarMode } from "../../src/lib/war-settings";
import { BRASS } from "./format";
import { bookableNodes } from "./format";
import { allChampions, championOwners, findChampEmbed, matchChampion, rosterReplies, searchChampions } from "./lookup";
import { allianceMembers, getDb, getGuildConfig, memberForDiscord, type Member } from "./store";

// Reads chat in servers that turned chat watching on, and helps out when
// someone claims nodes ("I'll take 41 and 44") or asks who has a champion
// ("anyone have Hercules?"). It only ever replies; it never books anything
// without the person pressing a button.

const CLAIM =
  /\b(?:i'?ll|i will|i'?m|im|i am|let me|lemme|gonna|going to|can i|i can|i'?d like to|i want(?: to)?|imma)\s+(?:take|taking|do|doing|grab|grabbing|book|booking|have|run|running|clear|clearing|hit|hitting|get|getting)\s+(?:nodes?\s*)?((?:\d{1,2})(?:\s*(?:,|&|\/|and|\+)\s*(?:nodes?\s*)?\d{1,2})*)/i;
const MINE = /^\s*(?:mine|taking|booking|dibs(?: on)?|claiming)\s*[:\-]?\s*(?:nodes?\s*)?((?:\d{1,2})(?:\s*(?:,|&|\/|and|\+)\s*\d{1,2})*)\s*[.!]*\s*$/i;
const WHO_HAS =
  /\b(?:any(?:one|body|1)|who(?:'s| has| have| got| owns)?|does any(?:one|body))\s+(?:here\s+)?(?:has|have|got|own|owns|with)?\s*(?:an?|the|a decent|a good)?\s*([a-z0-9][a-z0-9 .'\-()&]{1,40}?)\s*(?:\?|$| for | at | r\d| \d★| \d\*)/i;

/** Rate limit: one smart reply per person per 20 seconds. */
const lastReply = new Map<string, number>();

export function parseNodes(text: string): number[] {
  const match = CLAIM.exec(text) ?? MINE.exec(text);
  if (!match) return [];
  return [...new Set((match[1].match(/\d{1,2}/g) ?? []).map(Number))];
}

export function parseChampionQuestion(text: string): string | null {
  if (!/\?|any(?:one|body)|who /i.test(text)) return null;
  const match = WHO_HAS.exec(text);
  return match ? match[1].trim() : null;
}

/** "!findchamp solvarch bg1" -> { name: "solvarch", bg: 1 } */
export function parseFindChamp(text: string): { name: string; bg: number | null } | null {
  const match = /^\s*[!.]\s*(?:findchamp|find|champ|whohas)\s+(.+?)\s*$/i.exec(text);
  if (!match) return null;
  let rest = match[1];
  let bg: number | null = null;
  const bgMatch = /\s*\b(?:bg|battlegroup)\s*([123])\b\s*/i.exec(rest);
  if (bgMatch) {
    bg = Number(bgMatch[1]);
    rest = (rest.slice(0, bgMatch.index) + " " + rest.slice(bgMatch.index + bgMatch[0].length)).trim();
  }
  return rest ? { name: rest, bg } : null;
}

/** Text version of /findchamp, answered in any linked server whether or not chat watching is on. */
async function findChampText(message: Message<true>, query: { name: string; bg: number | null }) {
  const db = await getDb();
  const config = await getGuildConfig(db, message.guildId);
  if (!config) return;
  const list = await allChampions(db);
  const champion = matchChampion(list, query.name) ?? searchChampions(list, query.name, 1)[0];
  if (!champion) {
    await message.reply({ content: `I couldn't find a champion called "${query.name}".`, allowedMentions: { repliedUser: false } });
    return;
  }
  const owners = await championOwners(db, config.allianceId, champion.id, query.bg);
  await message.reply({ embeds: [findChampEmbed(champion.name, owners, query.bg)], allowedMentions: { repliedUser: false } });
}

/** "!roster @someone", "!roster 123456789012345678" or "!roster In-game Name"; "!roster" alone is your own. */
async function rosterText(message: Message<true>, arg: string) {
  const db = await getDb();
  const config = await getGuildConfig(db, message.guildId);
  if (!config) return;
  const reply = (content: string) => message.reply({ content, allowedMentions: { repliedUser: false } });
  let target: Member | null = null;
  const mention = /^<@!?(\d{15,21})>$/.exec(arg) ?? /^(\d{15,21})$/.exec(arg);
  if (!arg) target = await memberForDiscord(db, message.author.id);
  else if (mention) target = await memberForDiscord(db, mention[1]);
  else {
    const q = arg.toLowerCase();
    const members = await allianceMembers(db, config.allianceId);
    target =
      members.find((m) => m.displayName.toLowerCase() === q || m.username.toLowerCase() === q) ??
      (members.filter((m) => m.displayName.toLowerCase().includes(q)).length === 1
        ? members.find((m) => m.displayName.toLowerCase().includes(q))!
        : null);
  }
  if (!target) {
    await reply(
      !arg || mention
        ? "That Discord account isn't linked to War Room yet. Try `!roster <in-game name>` instead."
        : `I couldn't find one member called "${arg}".`
    );
    return;
  }
  if (!target.allianceId?.equals(config.allianceId)) {
    await reply(`${target.displayName} isn't in this server's alliance.`);
    return;
  }
  await message.channel.sendTyping().catch(() => undefined);
  for (const reply of await rosterReplies(db, target)) {
    await message.reply({ ...reply, allowedMentions: { repliedUser: false } });
  }
}

export async function handleMessage(message: Message) {
  if (message.author.bot || !message.inGuild() || !message.content) return;
  const text = message.content.slice(0, 300);
  const findQuery = parseFindChamp(text);
  if (findQuery) return findChampText(message, findQuery);
  const rosterMatch = /^\s*[!.]\s*roster\b\s*(.*?)\s*$/i.exec(text);
  if (rosterMatch) return rosterText(message, rosterMatch[1]);
  const nodes = parseNodes(text);
  const championText = nodes.length ? null : parseChampionQuestion(text);
  if (!nodes.length && !championText) return;

  const last = lastReply.get(message.author.id) ?? 0;
  if (Date.now() - last < 20_000) return;

  const db = await getDb();
  const config = await getGuildConfig(db, message.guildId);
  if (!config?.smartWatch) return;

  if (championText) {
    const champion = matchChampion(await allChampions(db), championText);
    if (!champion) return;
    const owners = await championOwners(db, config.allianceId, champion.id);
    lastReply.set(message.author.id, Date.now());
    await message.reply({ embeds: [findChampEmbed(champion.name, owners)], allowedMentions: { repliedUser: false } });
    return;
  }

  const member = await memberForDiscord(db, message.author.id);
  if (!member?.allianceId || !config.allianceId.equals(member.allianceId) || !member.battlegroup) return;
  const mode = await getWarMode(db, config.allianceId);
  const valid = nodes.filter((n) => bookableNodes(mode).includes(n));
  if (valid.length === 0) return;

  const board = await loadAttackBoard(db, config.allianceId, member.battlegroup, mode);
  const me = String(member._id);
  const free = valid.filter((n) => !board.assignments[nodeSlot(n)]);
  const taken = valid.filter((n) => {
    const holder = board.assignments[nodeSlot(n)];
    return holder && holder.userId !== me;
  });
  if (free.length === 0 && taken.length === 0) return; // already theirs

  const lines: string[] = [];
  const buttons: ButtonBuilder[] = [];
  const bg = member.battlegroup;
  if (free.length) {
    lines.push(`Node${free.length > 1 ? "s" : ""} **${free.join(", ")}** ${free.length > 1 ? "are" : "is"} open in BG ${bg}.`);
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`sw:book:${message.author.id}:${bg}:${free.join(",")}`)
        .setLabel(`Book ${free.length > 1 ? "them" : `node ${free[0]}`}`)
        .setStyle(ButtonStyle.Success)
    );
  }
  if (taken.length) {
    for (const n of taken) lines.push(`Node **${n}** is booked by ${board.assignments[nodeSlot(n)]!.displayName}.`);
    if (mode === "regular") {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`sw:ask:${message.author.id}:${bg}:${taken.join(",")}`)
          .setLabel(`Ask for ${taken.length > 1 ? "them" : `node ${taken[0]}`}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
  }
  buttons.push(new ButtonBuilder().setCustomId(`sw:no:${message.author.id}:${bg}:`).setLabel("No thanks").setStyle(ButtonStyle.Secondary));
  lastReply.set(message.author.id, Date.now());
  await message.reply({
    embeds: [new EmbedBuilder().setColor(BRASS).setDescription(lines.join("\n"))],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)],
    allowedMentions: { repliedUser: false }
  });
}
