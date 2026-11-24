import {
  ActionRowBuilder,
  DiscordAPIError,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction
} from "discord.js";
import { loadAttackBoard } from "../../src/lib/attack-plans";
import { nextAttackReset } from "../../src/lib/attack-reset";
import { loadBattlegroupBoard } from "../../src/lib/defender-plans";
import { redeemLinkCode } from "../../src/lib/discord-link";
import { isOfficerRole } from "../../src/lib/roles";
import { WAR_MODE_LABELS, isWarMode } from "../../src/lib/war-mode";
import { getWarMode, setWarMode } from "../../src/lib/war-settings";
import { DISCORD_LINKS } from "../../src/lib/discord-link";
import { UserError, pickBattlegroup, requireActor, requireGuildConfig, requireOfficer, type Actor } from "./actor";
import { appLink } from "./env";
import { BRASS, TEAL, boardEmbed, championLabel, errorEmbed, okEmbed, resetLine } from "./format";
import { allChampions, championOwners, findChampEmbed, memberRoster, rosterReplies, searchChampions } from "./lookup";
import { createRoles, rolesAboveBot, syncGuildRoles, syncMemberEverywhere } from "./roles";
import {
  ANNOUNCE_KINDS,
  DEFAULT_ANNOUNCE,
  DISCORD_GUILDS,
  ObjectId,
  allGuildConfigs,
  allianceMembers,
  allianceName,
  getDb,
  getGuildConfig,
  announcementChannel,
  memberForDiscord,
  toMember,
  updateGuildConfig,
  type AnnounceKind,
  type GuildConfig
} from "./store";
import { answerRequest, askForNode, bookNode, unbookNode } from "./war";
import { TAKEOVER_REQUESTS } from "../../src/lib/attack-plans";
import { nodeSlot } from "../../src/lib/attack-map";
import { counter, counterAutocomplete } from "./counter";
import { rosterImport } from "./roster-import";

const EPHEMERAL = MessageFlags.Ephemeral;

export async function handleInteraction(client: Client, interaction: Interaction) {
  try {
    if (interaction.isAutocomplete()) return await autocomplete(interaction);
    if (interaction.isButton()) return await button(client, interaction);
    if (interaction.isChatInputCommand()) return await command(client, interaction);
  } catch (err) {
    const text =
      err instanceof UserError
        ? err.message
        : err instanceof DiscordAPIError
          ? discordErrorText(err)
          : "Something went wrong. Try again in a moment.";
    if (!(err instanceof UserError)) console.error("[interaction]", err);
    if (interaction.isAutocomplete()) return interaction.respond([]).catch(() => undefined);
    if (!interaction.isRepliable()) return;
    const payload = { embeds: [errorEmbed(text)], flags: EPHEMERAL } as const;
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => undefined);
    else await interaction.reply(payload).catch(() => undefined);
  }
}

/** Plain words for the Discord errors people actually hit. */
function discordErrorText(err: DiscordAPIError): string {
  if (err.code === 50001) return "The bot can't see this channel. Give its role **View Channel** and **Read Message History** here.";
  if (err.code === 50013) return "The bot is missing a permission it needs here (for /purge, **Manage Messages**). Check its role and this channel's Permissions.";
  if (err.code === 50034) return "Discord can't bulk delete messages older than 14 days.";
  return `Discord refused that: ${err.message}`;
}

// ---------------------------------------------------------------- commands

async function command(client: Client, i: ChatInputCommandInteraction) {
  switch (i.commandName) {
    case "help":
      return i.reply({ embeds: [helpEmbed()], flags: EPHEMERAL });
    case "link":
      return link(client, i);
    case "unlink":
      return unlink(i);
    case "bookings":
      return bookings(i);
    case "book":
      return book(i);
    case "unbook":
      return unbook(i);
    case "mynodes":
      return myNodes(i);
    case "node":
      return nodeInfo(i);
    case "request":
      return request(i);
    case "reset":
      return reset(i);
    case "defense":
      return defense(i);
    case "findchamp":
      return findChamp(i);
    case "roster":
      return roster(i);
    case "counter":
      return counter(i);
    case "roster-import":
      return rosterImport(i);
    case "warmode":
      return warMode(i);
    case "purge":
      return purge(i);
    case "setup":
      return setup(client, i);
    case "settings":
      return settings(i);
    case "roles":
      return roles(client, i);
  }
}

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(BRASS)
    .setTitle("War Room bot")
    .setDescription(
      [
        "**Get started:** in the War Room app open Account → Discord → Link Discord, then type `/link` here with the code.",
        "",
        "**War**",
        "`/bookings` who booked which nodes, and what's open",
        "`/book 41` book a node (add a champion if you like) · `/unbook 41`",
        "`/mynodes` your nodes and node requests",
        "`/node 41` who has a node · `/request 41` ask them for it",
        "`/reset` when nodes 37-50 clear · `/defense` the defender plan",
        "`/findchamp Solvarch` every Solvarch on the alliance's rosters (add `bg` for one battlegroup)",
        "Or type `!findchamp solvarch bg1` in any channel",
        "`/roster @someone` their whole roster (or `!roster @someone` in chat)",
        "`/counter boss:Onslaught nodes:Incinerate on hit, Shock on contact` your best counters for a fight",
        "`/warmode` the current war mode",
        "",
        "**Chat**: say things like *\"I'll take 41 and 44\"* and the bot offers to book them, or *\"anyone have Hercules?\"* and it lists who does.",
        "",
        "**Officers**: `/setup`, `/settings`, `/roles`, `/warmode set`, and `/book` or `/unbook` for anyone.",
        "**Moderators**: `/purge 20` deletes the last 20 messages people wrote here (add `user` for one person)."
      ].join("\n")
    );
}

async function link(client: Client, i: ChatInputCommandInteraction) {
  const db = await getDb();
  const userId = await redeemLinkCode(db, i.options.getString("code", true), { id: i.user.id, username: i.user.username });
  if (!userId) {
    throw new UserError("That code is wrong or has expired. Make a new one in War Room → Account → Discord.");
  }
  const member = await memberForDiscord(db, i.user.id);
  const bits = [member?.battlegroup ? `BG ${member.battlegroup}` : null, member && isOfficerRole(member.role) ? "officer" : null]
    .filter(Boolean)
    .join(", ");
  await i.reply({
    embeds: [okEmbed(`Linked to **${member?.displayName ?? "your account"}**${bits ? ` (${bits})` : ""}. Try \`/mynodes\` or \`/bookings\`.`)],
    flags: EPHEMERAL
  });
  if (member?.allianceId) {
    const configs = (await allGuildConfigs(db)).filter((c) => c.allianceId.equals(member.allianceId!));
    void syncMemberEverywhere(client, db, configs, i.user.id, member);
  }
}

async function unlink(i: ChatInputCommandInteraction) {
  const db = await getDb();
  const removed = await db.collection(DISCORD_LINKS).deleteOne({ discordId: i.user.id });
  await i.reply({
    embeds: [okEmbed(removed.deletedCount ? "Unlinked. The bot won't act for you any more." : "Your Discord account wasn't linked.")],
    flags: EPHEMERAL
  });
}

async function bookings(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const db = await getDb();
  const mode = await getWarMode(db, actor.allianceId);
  const given = i.options.getInteger("bg");
  const bgs: (1 | 2 | 3)[] = given ? [pickBattlegroup(actor, given)] : actor.isOfficer ? [1, 2, 3] : [pickBattlegroup(actor, null)];
  const embeds = [];
  for (const bg of bgs) embeds.push(boardEmbed(await loadAttackBoard(db, actor.allianceId, bg, mode), mode));
  await i.reply({ embeds, flags: EPHEMERAL });
}

async function book(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const db = await getDb();
  const forUserId = i.options.getString("member");
  if (forUserId && !actor.isOfficer) throw new UserError("Only officers can book a node for someone else.");
  let battlegroup: 1 | 2 | 3;
  if (forUserId) {
    const targetId = safeId(forUserId);
    if (!targetId) throw new UserError("Pick a member from the list.");
    const target = await db.collection("users").findOne({ _id: targetId, allianceId: actor.allianceId });
    if (!target?.battlegroup) throw new UserError("That member isn't in a battlegroup.");
    battlegroup = target.battlegroup;
  } else {
    battlegroup = pickBattlegroup(actor, i.options.getInteger("bg"));
  }
  const node = i.options.getInteger("node", true);
  const result = await bookNode(db, actor, {
    battlegroup,
    node,
    forUserId,
    championId: i.options.getString("champion"),
    replace: i.options.getBoolean("replace") ?? false
  });
  await i.reply({
    embeds: [
      okEmbed(`Node **${node}** in BG ${battlegroup} is booked for **${result.holderName}**${result.champion ? ` with ${result.champion}` : ""}.`)
    ],
    flags: EPHEMERAL
  });
}

async function unbook(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const node = i.options.getInteger("node", true);
  const battlegroup = pickBattlegroup(actor, actor.isOfficer ? i.options.getInteger("bg") : null);
  const result = await unbookNode(await getDb(), actor, { battlegroup, node });
  await i.reply({ embeds: [okEmbed(`Node **${node}** in BG ${battlegroup} is free again (was ${result.holderName}).`)], flags: EPHEMERAL });
}

async function myNodes(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const bg = pickBattlegroup(actor, null);
  const db = await getDb();
  const mode = await getWarMode(db, actor.allianceId);
  const board = await loadAttackBoard(db, actor.allianceId, bg, mode);
  const me = String(actor.member._id);
  const mine = Object.entries(board.assignments)
    .filter(([, holder]) => holder?.userId === me)
    .map(([slot]) => {
      const champion = board.champions?.[slot as keyof typeof board.champions];
      const label = slot.startsWith("path-") ? `Path ${slot.slice(5)}` : `Node ${slot.slice(5)}`;
      return `• ${label}${champion ? ` · ${championLabel(champion)}` : ""}`;
    });
  const asked = (board.requests ?? []).filter((r) => r.holderId === me);
  const asking = (board.requests ?? []).filter((r) => r.requester.userId === me);
  const embed = new EmbedBuilder()
    .setColor(BRASS)
    .setTitle(`${actor.member.displayName} · BG ${bg} · ${WAR_MODE_LABELS[mode]}`)
    .addFields({ name: "Your spots", value: mine.join("\n") || "Nothing booked. Try `/book`." });
  if (asked.length) {
    embed.addFields({
      name: "People asking for your nodes",
      value: asked.map((r) => `• Node ${r.slot.slice(5)}: ${r.requester.displayName}`).join("\n")
    });
  }
  if (asking.length) {
    embed.addFields({
      name: "Your requests",
      value: asking.map((r) => `• Node ${r.slot.slice(5)} (held by ${board.assignments[r.slot]?.displayName ?? "someone"})`).join("\n")
    });
  }
  const components = asked.slice(0, 5).map((r) => takeoverButtons(String(r.id), `Node ${r.slot.slice(5)} → ${r.requester.displayName}`));
  await i.reply({ embeds: [embed], components, flags: EPHEMERAL });
}

async function nodeInfo(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const bg = pickBattlegroup(actor, i.options.getInteger("bg"));
  const node = i.options.getInteger("node", true);
  const db = await getDb();
  const mode = await getWarMode(db, actor.allianceId);
  const board = await loadAttackBoard(db, actor.allianceId, bg, mode);
  const slot = nodeSlot(node);
  const holder = board.assignments[slot];
  const champion = board.champions?.[slot];
  const attackers = board.attackers?.[slot];
  const requests = (board.requests ?? []).filter((r) => r.slot === slot);
  const lines = [
    holder ? `Booked by **${holder.displayName}**` : "**Open.** Book it with `/book`.",
    champion ? `Champion: ${championLabel(champion)}` : null,
    attackers?.length ? `Attackers: ${attackers.map(championLabel).join(", ")}` : null,
    requests.length ? `Asking for it: ${requests.map((r) => r.requester.displayName).join(", ")}` : null
  ].filter(Boolean);
  await i.reply({
    embeds: [new EmbedBuilder().setColor(BRASS).setTitle(`Node ${node} · BG ${bg}`).setDescription(lines.join("\n"))],
    flags: EPHEMERAL
  });
}

async function request(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const node = i.options.getInteger("node", true);
  const result = await askForNode(await getDb(), actor, { node, championId: i.options.getString("champion") });
  await i.reply({
    embeds: [okEmbed(`Asked **${result.holderName}** for node **${node}**. They'll get a message with Accept and Decline buttons.`)],
    flags: EPHEMERAL
  });
}

async function reset(i: ChatInputCommandInteraction) {
  const next = nextAttackReset();
  await i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(BRASS)
        .setTitle("Next attack reset")
        .setDescription(`${resetLine(next)}\n\nBookings on nodes 37-50 clear then. Paths stay.`)
    ]
  });
}

async function defense(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const bg = pickBattlegroup(actor, i.options.getInteger("bg"));
  await i.deferReply({ flags: EPHEMERAL });
  const db = await getDb();
  const mode = await getWarMode(db, actor.allianceId);
  const { board } = await loadBattlegroupBoard(db, actor.allianceId, bg, mode);
  const embed = new EmbedBuilder()
    .setColor(BRASS)
    .setTitle(`BG ${bg} defenders · ${WAR_MODE_LABELS[mode]}`)
    .setDescription(
      `${board.currentUniqueChampionsAssigned} unique champions · about ${board.estimatedDiversityPoints} diversity points`
    );
  const link = appLink("/battlegroups");
  if (link) embed.setURL(link);
  for (const row of board.currentDefenders.slice(0, 25)) {
    const value = row.defenders.map((d) => `${d.championName}${d.assignedTo.stars ? ` ${d.assignedTo.stars}★` : ""}${d.assignedTo.rank ? ` R${d.assignedTo.rank}` : ""}`).join("\n");
    embed.addFields({ name: `${row.displayName} (${row.assigned}/${row.cap})`, value: value || "—", inline: true });
  }
  if (board.currentDefenders.length === 0) embed.addFields({ name: "No plan yet", value: "Officers make it on the Battlegroups page." });
  await i.editReply({ embeds: [embed] });
}

async function findChamp(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const db = await getDb();
  const value = i.options.getString("champion", true);
  const list = await allChampions(db);
  const champion = list.find((c) => c.id === value) ?? searchChampions(list, value, 1)[0];
  if (!champion) throw new UserError(`No champion called "${value}".`);
  const bg = i.options.getInteger("bg");
  await i.reply({ embeds: [findChampEmbed(champion.name, await championOwners(db, actor.allianceId, champion.id, bg), bg)] });
}

async function roster(i: ChatInputCommandInteraction) {
  const actor = await requireActor(i);
  const db = await getDb();
  const user = i.options.getUser("user");
  const memberId = i.options.getString("member");
  let target = actor.member;
  if (user) {
    const found = await memberForDiscord(db, user.id);
    if (!found) throw new UserError(`${user.username} hasn't linked their War Room account. Use the \`member\` option to pick their in-game name instead.`);
    target = found;
  } else if (memberId) {
    const id = safeId(memberId);
    const doc = id ? await db.collection("users").findOne({ _id: id }) : null;
    if (!doc) throw new UserError("Pick a member from the list.");
    target = toMember(doc);
  }
  if (!target.allianceId || !target.allianceId.equals(actor.allianceId)) {
    throw new UserError(`${target.displayName} isn't in your alliance.`);
  }
  await i.deferReply();
  const [first, ...rest] = await rosterReplies(db, target, i.options.getBoolean("all") ?? false);
  await i.editReply(first);
  for (const message of rest) await i.followUp(message);
}

async function warMode(i: ChatInputCommandInteraction) {
  const wanted = i.options.getString("set");
  const db = await getDb();
  if (!wanted) {
    const actor = await requireActor(i);
    const mode = await getWarMode(db, actor.allianceId);
    return i.reply({ embeds: [okEmbed(`The war mode is **${WAR_MODE_LABELS[mode]}**.`)] });
  }
  const actor = await requireOfficer(i);
  if (!isWarMode(wanted)) throw new UserError("Pick Regular or Big Things.");
  await setWarMode(db, actor.allianceId, wanted, String(actor.member._id));
  await i.reply({ embeds: [okEmbed(`War mode switched to **${WAR_MODE_LABELS[wanted]}** by ${actor.member.displayName}.`)] });
}

// ---------------------------------------------------------------- officer tools

/**
 * Deletes the last `count` messages written by people (or by one person) in
 * this channel. Discord only bulk-deletes messages under 14 days old, and
 * pinned messages are kept.
 */
async function purge(i: ChatInputCommandInteraction) {
  if (!i.inGuild() || !i.channel || !("bulkDelete" in i.channel)) throw new UserError("Use /purge in a server text channel.");
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    throw new UserError("You need Discord's Manage Messages permission to purge.");
  }
  const me = i.guild?.members.me ?? (await i.guild?.members.fetchMe().catch(() => null));
  const botPerms = me ? i.channel.permissionsFor(me) : null;
  const missing = [
    [PermissionFlagsBits.ViewChannel, "View Channel"],
    [PermissionFlagsBits.ReadMessageHistory, "Read Message History"],
    [PermissionFlagsBits.ManageMessages, "Manage Messages"]
  ]
    .filter(([flag]) => !botPerms?.has(flag as bigint))
    .map(([, name]) => `**${name}**`);
  if (missing.length) {
    throw new UserError(
      `The bot is missing ${missing.join(", ")} in this channel. Turn ${missing.length > 1 ? "them" : "it"} on for the War Room role in Server Settings → Roles, and check this channel's own Permissions don't turn ${missing.length > 1 ? "them" : "it"} off.`
    );
  }
  const count = i.options.getInteger("count", true);
  const user = i.options.getUser("user");
  const includeBots = i.options.getBoolean("include_bots") ?? false;
  await i.deferReply({ flags: EPHEMERAL });

  const channel = i.channel;
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000 + 60_000;
  const picked: string[] = [];
  let before: string | undefined;
  let tooOld = false;
  // Look back through up to 500 messages to find `count` that match.
  for (let page = 0; page < 5 && picked.length < count && !tooOld; page += 1) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    for (const message of batch.values()) {
      if (message.createdTimestamp < cutoff) {
        tooOld = true;
        break;
      }
      if (message.pinned || message.interactionMetadata) continue;
      if (user ? message.author.id !== user.id : !includeBots && (message.author.bot || message.webhookId)) continue;
      picked.push(message.id);
      if (picked.length === count) break;
    }
    before = batch.last()?.id;
  }
  if (picked.length === 0) {
    await i.editReply({ embeds: [okEmbed(tooOld ? "Nothing to delete: matching messages are over 14 days old, which Discord can't bulk delete." : "No matching messages found.")] });
    return;
  }
  const deleted = picked.length === 1
    ? await channel.messages.delete(picked[0]).then(() => new Map([[picked[0], true]]))
    : await channel.bulkDelete(picked, true);
  const who = user ? ` from **${user.username}**` : includeBots ? "" : " (bot messages left alone)";
  const lines = [`🧹 Deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"}${who}.`];
  if (deleted.size < count && tooOld) lines.push("Older messages are over 14 days old, which Discord can't bulk delete.");
  else if (deleted.size < count) lines.push("That's all the matching messages in the last 500.");
  await i.editReply({ embeds: [okEmbed(lines.join("\n"))] });
}

async function setup(client: Client, i: ChatInputCommandInteraction) {
  if (!i.inGuild() || !i.guild) throw new UserError("Run /setup in your alliance's Discord server.");
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new UserError("You need the Manage Server permission in Discord to set up the bot.");
  }
  const actor = await requireLinkedOfficer(i);
  const db = await getDb();
  const channel = i.options.getChannel("channel") ?? i.channel;
  const existing = await getGuildConfig(db, i.guildId);
  const now = new Date();
  await db.collection<GuildConfig>(DISCORD_GUILDS).updateOne(
    { guildId: i.guildId },
    {
      $set: { allianceId: actor.allianceId, setupBy: actor.member._id, setupAt: now, warChannelId: channel?.id ?? null },
      $setOnInsert: {
        guildId: i.guildId,
        bgChannelIds: {},
        announce: DEFAULT_ANNOUNCE,
        reminderHours: [2],
        sentReminders: [],
        smartWatch: true,
        roleSync: false,
        roleIds: {}
      }
    },
    { upsert: true }
  );
  const name = await allianceName(db, actor.allianceId);
  const moved = existing && !existing.allianceId.equals(actor.allianceId) ? " (it was linked to another alliance before)" : "";
  await i.reply({
    embeds: [
      okEmbed(
        [
          `This server is now linked to **${name}**${moved}. Announcements go to <#${channel?.id}>.`,
          "",
          "Next steps:",
          "• Everyone links their account: War Room → Account → Discord → Link Discord, then `/link` here.",
          "• `/roles create` gives Discord roles for officers and battlegroups.",
          "• `/settings show` to change channels, reminders and announcements."
        ].join("\n")
      )
    ]
  });
  void client;
}

/** For /setup: the server's alliance isn't known yet, so check the member's own. */
async function requireLinkedOfficer(i: ChatInputCommandInteraction): Promise<Actor> {
  const db = await getDb();
  const member = await memberForDiscord(db, i.user.id);
  if (!member) throw new UserError("Link your War Room account first (War Room → Account → Discord), then run /setup again.");
  if (!member.allianceId) throw new UserError("Your War Room account isn't in an alliance.");
  if (!isOfficerRole(member.role)) throw new UserError("Only officers, the Leader or the Admin can set up the bot.");
  return { member, allianceId: member.allianceId, isOfficer: true, config: null };
}

function settingsEmbed(config: GuildConfig) {
  const ch = (id?: string | null) => (id ? `<#${id}>` : "—");
  const role = (id?: string) => (id ? `<@&${id}>` : "—");
  return new EmbedBuilder()
    .setColor(BRASS)
    .setTitle("Bot settings")
    .addFields(
      { name: "Announcements channel", value: ch(config.warChannelId), inline: true },
      {
        name: "Battlegroup channels",
        value: (["1", "2", "3"] as const).map((bg) => `BG ${bg}: ${ch(config.bgChannelIds[bg])}`).join("\n"),
        inline: true
      },
      {
        name: "Announcements",
        value: ANNOUNCE_KINDS.map(({ kind, label }) => `${config.announce[kind] ? "✅" : "⬜"} ${label}`).join("\n"),
        inline: true
      },
      {
        name: "Where each kind goes",
        value: ANNOUNCE_KINDS.map(
          ({ kind, label }) =>
            `**${label}:** ${[1, 2, 3].map((bg) => `BG ${bg} ${ch(announcementChannel(config, kind, bg))}`).join(" · ")}`
        ).join("\n")
      },
      {
        name: "Reset reminders",
        value: config.reminderHours.length ? config.reminderHours.map((h) => `${h}h before`).join(", ") : "Off",
        inline: true
      },
      { name: "Chat watching", value: config.smartWatch ? "On" : "Off", inline: true },
      {
        name: "Role sync",
        value: config.roleSync
          ? `On · officers ${role(config.roleIds.officer)}, ${role(config.roleIds.bg1)} ${role(config.roleIds.bg2)} ${role(config.roleIds.bg3)}`
          : "Off",
        inline: true
      }
    );
}

async function settings(i: ChatInputCommandInteraction) {
  const actor = await requireOfficer(i);
  const config = actor.config!;
  const db = await getDb();
  const sub = i.options.getSubcommand();
  if (sub === "channel") {
    await updateGuildConfig(db, config.guildId, { warChannelId: i.options.getChannel("channel", true).id });
  } else if (sub === "bg-channel") {
    const bg = String(i.options.getInteger("bg", true)) as "1" | "2" | "3";
    const channel = i.options.getChannel("channel");
    const bgChannelIds = { ...config.bgChannelIds };
    if (channel) bgChannelIds[bg] = channel.id;
    else delete bgChannelIds[bg];
    await updateGuildConfig(db, config.guildId, { bgChannelIds });
  } else if (sub === "kind-channel") {
    const kind = i.options.getString("kind", true) as AnnounceKind;
    const bg = i.options.getInteger("bg");
    const channel = i.options.getChannel("channel");
    const key = bg ? `${kind}:${bg}` : kind;
    const routes = { ...config.routes };
    if (channel) routes[key] = channel.id;
    else delete routes[key];
    await updateGuildConfig(db, config.guildId, { routes });
  } else if (sub === "announce") {
    const kind = i.options.getString("kind", true) as AnnounceKind;
    await updateGuildConfig(db, config.guildId, { announce: { ...config.announce, [kind]: i.options.getBoolean("on", true) } });
  } else if (sub === "reminders") {
    const raw = i.options.getString("hours", true).trim().toLowerCase();
    const hours =
      raw === "off" || raw === "none" || raw === "0"
        ? []
        : [...new Set(raw.split(/[\s,]+/).filter(Boolean).map(Number))];
    if (hours.some((h) => !Number.isFinite(h) || h <= 0 || h > 47)) {
      throw new UserError('Give hours between 1 and 47, like "6, 2", or "off".');
    }
    await updateGuildConfig(db, config.guildId, { reminderHours: hours.sort((a, b) => b - a) });
  } else if (sub === "smart-watch") {
    await updateGuildConfig(db, config.guildId, { smartWatch: i.options.getBoolean("on", true) });
  }
  const fresh = (await getGuildConfig(db, config.guildId))!;
  await i.reply({ embeds: [settingsEmbed(fresh)], flags: EPHEMERAL });
}

async function roles(client: Client, i: ChatInputCommandInteraction) {
  const actor = await requireOfficer(i);
  const config = actor.config!;
  const guild = i.guild;
  if (!guild) throw new UserError("Use this in your server.");
  const db = await getDb();
  const sub = i.options.getSubcommand();
  if (sub === "off") {
    await updateGuildConfig(db, config.guildId, { roleSync: false });
    return i.reply({ embeds: [okEmbed("Role sync is off. Roles already given stay as they are.")], flags: EPHEMERAL });
  }
  await i.deferReply({ flags: EPHEMERAL });
  let roleIds = config.roleIds;
  if (sub === "create") {
    try {
      roleIds = await createRoles(guild, config.roleIds);
    } catch (err) {
      throw new UserError((err as Error).message);
    }
  } else if (sub === "map") {
    roleIds = { ...config.roleIds };
    for (const key of ["officer", "bg1", "bg2", "bg3"] as const) {
      const role = i.options.getRole(key);
      if (role) roleIds[key] = role.id;
    }
  }
  if (sub !== "sync") await updateGuildConfig(db, config.guildId, { roleIds, roleSync: true });
  else if (!config.roleSync) throw new UserError("Role sync is off. Run `/roles create` or `/roles map` first.");

  const blocked = rolesAboveBot(guild, roleIds);
  const changed = await syncGuildRoles(client, db, config.guildId);
  const lines = [
    `Role sync is on. Updated **${changed}** linked member${changed === 1 ? "" : "s"}.`,
    "Members who haven't linked their account yet get their roles when they run `/link`."
  ];
  if (blocked.length) {
    lines.push(
      "",
      `⚠️ The bot can't give ${blocked.join(", ")} because those roles are above the bot's own role. Drag the bot's role above them in Server Settings → Roles.`
    );
  }
  await i.editReply({ embeds: [okEmbed(lines.join("\n"))] });
}

// ---------------------------------------------------------------- buttons

export function takeoverButtons(requestId: string, label?: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tk:${requestId}:accept`)
      .setLabel(label ? `Hand over: ${label}`.slice(0, 80) : "Hand it over")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tk:${requestId}:decline`).setLabel("Keep it").setStyle(ButtonStyle.Secondary)
  );
}

async function button(client: Client, i: ButtonInteraction) {
  const [kind, ...rest] = i.customId.split(":");
  if (kind === "tk") {
    const [requestId, answer] = rest;
    if (answer !== "accept" && answer !== "decline" && answer !== "cancel") return;
    const actor = await requireActor(i);
    const db = await getDb();
    const requestKey = safeId(requestId);
    const request = requestKey ? await db.collection(TAKEOVER_REQUESTS).findOne({ _id: requestKey }) : null;
    const result = await answerRequest(db, actor, requestId, answer);
    const requester = request ? await db.collection("users").findOne({ _id: request.requesterId }) : null;
    const who = (requester?.displayName as string) ?? "them";
    const text =
      answer === "accept"
        ? `✅ You handed node **${result.node}** to **${who}**.`
        : answer === "decline"
          ? `You're keeping node **${result.node}**. ${who} has been told.`
          : `Request for node **${result.node}** withdrawn.`;
    await i.update({ embeds: [okEmbed(text)], components: [] });
    if (answer !== "cancel" && request) await tellRequester(client, db, request.requesterId, actor.member.displayName, result.node, answer);
    return;
  }
  if (kind === "sw") return smartButton(i, rest);
}

async function tellRequester(client: Client, db: Awaited<ReturnType<typeof getDb>>, requesterId: ObjectId, holder: string, node: string, answer: "accept" | "decline") {
  const link = await db.collection(DISCORD_LINKS).findOne({ userId: requesterId });
  if (!link) return;
  const user = await client.users.fetch(link.discordId).catch(() => null);
  const text = answer === "accept" ? `✅ **${holder}** handed node **${node}** over to you.` : `**${holder}** is keeping node **${node}**.`;
  await user?.send({ embeds: [answer === "accept" ? okEmbed(text) : new EmbedBuilder().setColor(BRASS).setDescription(text)] }).catch(() => undefined);
}

/** Buttons the bot adds under chat messages like "I'll take 41". */
async function smartButton(i: ButtonInteraction, [action, authorId, bg, nodes]: string[]) {
  if (authorId !== i.user.id) {
    throw new UserError("This button is for the person who wrote the message. Use `/book` to book a node yourself.");
  }
  const actor = await requireActor(i);
  const db = await getDb();
  const list = (nodes ?? "").split(",").map(Number).filter(Boolean);
  if (action === "no") {
    await i.update({ components: [] }).catch(() => undefined);
    return;
  }
  const lines: string[] = [];
  for (const node of list) {
    try {
      if (action === "book") {
        await bookNode(db, actor, { battlegroup: Number(bg) as 1 | 2 | 3, node, forUserId: null, championId: null });
        lines.push(`✅ Node ${node} booked.`);
      } else if (action === "ask") {
        const result = await askForNode(db, actor, { node, championId: null });
        lines.push(`📨 Asked ${result.holderName} for node ${node}.`);
      }
    } catch (err) {
      lines.push(`❌ Node ${node}: ${err instanceof UserError ? err.message : "something went wrong."}`);
    }
  }
  await i.update({ components: [] }).catch(() => undefined);
  await i.followUp({ embeds: [new EmbedBuilder().setColor(TEAL).setDescription(lines.join("\n"))], flags: EPHEMERAL });
}

// ---------------------------------------------------------------- autocomplete

async function autocomplete(i: AutocompleteInteraction) {
  if (i.commandName === "counter") return counterAutocomplete(i);
  const focused = i.options.getFocused(true);
  const db = await getDb();
  if (focused.name === "champion" && i.commandName === "findchamp") {
    const list = searchChampions(await allChampions(db), String(focused.value));
    return i.respond(list.map((c) => ({ name: c.name.slice(0, 100), value: c.id })));
  }
  const actor = await requireActor(i).catch(() => null);
  if (!actor) return i.respond([]);

  if (focused.name === "member") {
    const bg = i.options.getInteger("bg");
    const q = String(focused.value).toLowerCase();
    const members = (await allianceMembers(db, actor.allianceId))
      .filter((m) => (i.commandName === "roster" ? true : m.battlegroup && (!bg || m.battlegroup === bg)))
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
      .slice(0, 25);
    return i.respond(
      members.map((m) => ({ name: `${m.displayName}${m.battlegroup ? ` · BG ${m.battlegroup}` : ""}`.slice(0, 100), value: String(m._id) }))
    );
  }

  if (focused.name === "champion") {
    // The roster of whoever the node is for.
    const forUser = i.options.getString("member");
    const owner = forUser && actor.isOfficer && safeId(forUser) ? safeId(forUser)! : actor.member._id;
    const roster = await memberRoster(db, owner);
    const q = String(focused.value).toLowerCase().replace(/[^a-z0-9]/g, "");
    const matches = roster.filter((c) => !q || c.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(q)).slice(0, 25);
    return i.respond(
      matches.map((c) => ({
        name: `${c.name}${c.stars ? ` ${c.stars}★` : ""}${c.rank ? ` R${c.rank}` : ""}`.slice(0, 100),
        value: c.championId
      }))
    );
  }
  return i.respond([]);
}

function safeId(id: string | undefined | null): ObjectId | null {
  try {
    return id ? new ObjectId(id) : null;
  } catch {
    return null;
  }
}

export { requireGuildConfig };
