import { EmbedBuilder, type Client, type MessageCreateOptions, type SendableChannels } from "discord.js";
import type { Db } from "mongodb";
import { UPPER_NODES, nodeSlot } from "../../src/lib/attack-map";
import { ATTACK_ASSIGNMENTS, TAKEOVER_REQUESTS, clearExpiredBookings } from "../../src/lib/attack-plans";
import { lastAttackReset, nextAttackReset } from "../../src/lib/attack-reset";
import { WAR_MODE_LABELS, type WarMode } from "../../src/lib/war-mode";
import { getWarMode } from "../../src/lib/war-settings";
import { appLink, env } from "./env";
import { BRASS, TEAL, resetLine, slotLabel } from "./format";
import { takeoverButtons } from "./handlers";
import { syncGuildRoles, syncMemberEverywhere } from "./roles";
import {
  DISCORD_GUILDS,
  ObjectId,
  allGuildConfigs,
  discordIdsFor,
  getDb,
  toMember,
  announcementChannel,
  type AnnounceKind,
  type GuildConfig,
  type Member
} from "./store";

// Watches the database and tells Discord what changed: bookings, node
// requests, the attack reset, roster updates and members joining or leaving.
// Each check compares with the previous one, so the first check after a
// start only takes a snapshot.

type Assignment = { userId: string; championId: string | null };
type Snapshot = {
  mode: WarMode;
  lastReset: number | null;
  /** "<bg>:<slot>" -> holder */
  assignments: Map<string, Assignment>;
  /** request id -> request */
  requests: Map<string, { bg: number; slot: string; requesterId: string; holderId: string; championId: string | null }>;
  /** user id -> member + when they last got a roster notification */
  members: Map<string, { member: Member; rosterAt: number | null }>;
};

const snapshots = new Map<string, Snapshot>();
/** Request id -> the DMs/messages showing its buttons, so they can be closed when answered in the app. */
const requestMessages = new Map<string, { channelId: string; messageId: string }[]>();
let lastRoleSync = 0;

export function startWatcher(client: Client) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkAll(client);
    } catch (err) {
      console.error("[watcher]", err);
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(tick, env.pollMs);
}

async function checkAll(client: Client) {
  const db = await getDb();
  const configs = await allGuildConfigs(db);
  const byAlliance = new Map<string, GuildConfig[]>();
  for (const config of configs) {
    if (!client.guilds.cache.has(config.guildId)) continue; // bot was removed from the server
    const key = String(config.allianceId);
    byAlliance.set(key, [...(byAlliance.get(key) ?? []), config]);
  }
  for (const [allianceKey, guilds] of byAlliance) {
    try {
      await checkAlliance(client, db, new ObjectId(allianceKey), guilds);
    } catch (err) {
      console.error(`[watcher] alliance ${allianceKey}:`, err);
    }
  }
  await sendReminders(client, db, configs);

  // A full role sync every 15 minutes catches anything missed.
  if (Date.now() - lastRoleSync > 15 * 60 * 1000) {
    lastRoleSync = Date.now();
    for (const config of configs.filter((c) => c.roleSync)) {
      await syncGuildRoles(client, db, config.guildId).catch((err) => console.warn("[roles]", err.message));
    }
  }
}

async function takeSnapshot(db: Db, allianceId: ObjectId): Promise<Snapshot> {
  const mode = await getWarMode(db, allianceId);
  if (mode === "regular") await clearExpiredBookings(db, allianceId);
  const [assignmentDocs, requestDocs, userDocs] = await Promise.all([
    db.collection(ATTACK_ASSIGNMENTS[mode]).find({ allianceId }).toArray(),
    mode === "regular" ? db.collection(TAKEOVER_REQUESTS).find({ allianceId }).toArray() : Promise.resolve([]),
    db.collection("users").find({ allianceId }).toArray()
  ]);
  const members = new Map(
    userDocs.map((doc) => [
      String(doc._id),
      { member: toMember(doc), rosterAt: doc.lastRosterNotifiedAt ? new Date(doc.lastRosterNotifiedAt).getTime() : null }
    ])
  );
  const assignments = new Map<string, Assignment>();
  for (const doc of assignmentDocs) {
    // A spot held by someone who has left the battlegroup counts as empty, as in the app.
    const holder = members.get(String(doc.userId));
    if (!holder || holder.member.battlegroup !== doc.battlegroup) continue;
    assignments.set(`${doc.battlegroup}:${doc.slot}`, {
      userId: String(doc.userId),
      championId: doc.championId ? String(doc.championId) : null
    });
  }
  const requests: Snapshot["requests"] = new Map();
  for (const doc of requestDocs) {
    if (assignments.get(`${doc.battlegroup}:${doc.slot}`)?.userId !== String(doc.holderId)) continue;
    requests.set(String(doc._id), {
      bg: doc.battlegroup,
      slot: doc.slot,
      requesterId: String(doc.requesterId),
      holderId: String(doc.holderId),
      championId: doc.championId ? String(doc.championId) : null
    });
  }
  return { mode, lastReset: lastAttackReset()?.getTime() ?? null, assignments, requests, members };
}

async function championNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const docs = await db
    .collection("champions")
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((doc) => [String(doc._id), String(doc.name)]));
}

type Line = { kind: AnnounceKind; bg: number | null; text: string };

async function checkAlliance(client: Client, db: Db, allianceId: ObjectId, guilds: GuildConfig[]) {
  const key = String(allianceId);
  const before = snapshots.get(key);
  const now = await takeSnapshot(db, allianceId);
  snapshots.set(key, now);
  if (!before) return;

  const name = (id: string) => now.members.get(id)?.member.displayName ?? before.members.get(id)?.member.displayName ?? "Someone";
  const lines: Line[] = [];

  const everyBg = (kind: AnnounceKind, text: string) => {
    for (const bg of [1, 2, 3]) lines.push({ kind, bg, text });
  };
  if (before.mode !== now.mode) {
    everyBg("bookings", `⚔️ War mode switched to **${WAR_MODE_LABELS[now.mode]}**.`);
  } else if (now.mode === "regular" && before.lastReset !== now.lastReset) {
    everyBg(
      "reminders",
      `🔄 **New war cycle.** Bookings on nodes 37-50 have cleared, so book your nodes again. Next reset: ${resetLine(nextAttackReset())}`
    );
  } else {
    // Bookings.
    const champs = await championNames(
      db,
      [...now.assignments.values()].map((a) => a.championId).filter((id): id is string => Boolean(id))
    );
    const keys = new Set([...before.assignments.keys(), ...now.assignments.keys()]);
    for (const k of [...keys].sort()) {
      const [bgText, slot] = k.split(":");
      const bg = Number(bgText);
      const was = before.assignments.get(k);
      const is = now.assignments.get(k);
      const label = slotLabel(slot);
      const champ = is?.championId ? champs.get(is.championId) : null;
      if (!was && is) {
        lines.push({ kind: "bookings", bg, text: `📌 BG ${bg} · **${label}** booked by **${name(is.userId)}**${champ ? ` with ${champ}` : ""}` });
      } else if (was && !is) {
        lines.push({ kind: "bookings", bg, text: `🟢 BG ${bg} · **${label}** is open again (was ${name(was.userId)})` });
      } else if (was && is && was.userId !== is.userId) {
        lines.push({
          kind: "bookings",
          bg,
          text: `🔁 BG ${bg} · **${label}** moved from ${name(was.userId)} to **${name(is.userId)}**${champ ? ` (${champ})` : ""}`
        });
      } else if (was && is && was.championId !== is.championId && champ) {
        lines.push({ kind: "bookings", bg, text: `✏️ BG ${bg} · ${name(is.userId)} will use **${champ}** on ${label.toLowerCase()}` });
      }
    }

    // Node requests.
    for (const [id, request] of now.requests) {
      if (before.requests.has(id)) continue;
      lines.push({
        kind: "takeovers",
        bg: request.bg,
        text: `📨 BG ${request.bg} · **${name(request.requesterId)}** asked ${name(request.holderId)} for ${slotLabel(request.slot).toLowerCase()}`
      });
      await sendRequestButtons(client, db, guilds, id, request, name);
    }
    for (const id of before.requests.keys()) {
      if (!now.requests.has(id)) await closeRequestMessages(client, id);
    }
  }

  // Members and rosters.
  const changedMembers: { member: Member | null; userId: string }[] = [];
  for (const [id, entry] of now.members) {
    const old = before.members.get(id);
    if (!old) {
      lines.push({ kind: "members", bg: entry.member.battlegroup, text: `👋 **${entry.member.displayName}** joined the alliance.` });
      changedMembers.push({ member: entry.member, userId: id });
      continue;
    }
    if (old.member.role !== entry.member.role || old.member.battlegroup !== entry.member.battlegroup) {
      changedMembers.push({ member: entry.member, userId: id });
      if (old.member.battlegroup !== entry.member.battlegroup) {
        // Both battlegroups hear about a move.
        const text = `↔️ **${entry.member.displayName}** moved ${old.member.battlegroup ? `from BG ${old.member.battlegroup} ` : ""}to ${entry.member.battlegroup ? `BG ${entry.member.battlegroup}` : "no battlegroup"}.`;
        for (const bg of new Set([old.member.battlegroup, entry.member.battlegroup])) lines.push({ kind: "members", bg, text });
      }
    }
    if (entry.rosterAt && entry.rosterAt !== old.rosterAt) {
      lines.push({ kind: "roster", bg: entry.member.battlegroup, text: `📋 **${entry.member.displayName}** updated their roster.` });
    }
  }
  for (const [id, old] of before.members) {
    if (!now.members.has(id)) {
      lines.push({ kind: "members", bg: old.member.battlegroup, text: `🚪 **${old.member.displayName}** left the alliance.` });
      changedMembers.push({ member: null, userId: id });
    }
  }

  if (changedMembers.length) {
    const discordIds = await discordIdsFor(db, changedMembers.map((c) => new ObjectId(c.userId)));
    for (const change of changedMembers) {
      const discordId = discordIds.get(change.userId);
      if (discordId) await syncMemberEverywhere(client, db, guilds, discordId, change.member);
    }
  }

  if (lines.length) await postLines(client, guilds, lines);
}

async function channelFor(client: Client, id: string | null | undefined): Promise<SendableChannels | null> {
  if (!id) return null;
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel && channel.isSendable() ? channel : null;
}

/** Posts lines to each server, grouped by channel, a few per message. */
async function postLines(client: Client, guilds: GuildConfig[], lines: Line[]) {
  for (const config of guilds) {
    const byChannel = new Map<string, string[]>();
    for (const line of lines) {
      if (!config.announce[line.kind]) continue;
      const channelId = announcementChannel(config, line.kind, line.bg);
      if (!channelId) continue;
      const texts = byChannel.get(channelId) ?? [];
      // Alliance-wide news is sent once per battlegroup; post it once per channel.
      if (!texts.includes(line.text)) texts.push(line.text);
      byChannel.set(channelId, texts);
    }
    for (const [channelId, texts] of byChannel) {
      const channel = await channelFor(client, channelId);
      if (!channel) continue;
      for (let start = 0; start < texts.length; start += 15) {
        const embed = new EmbedBuilder().setColor(BRASS).setDescription(texts.slice(start, start + 15).join("\n"));
        await channel.send({ embeds: [embed] }).catch((err) => console.warn(`[watcher] can't post in ${channelId}:`, err.message));
      }
    }
  }
}

/** DMs the holder Accept/Decline buttons; if their DMs are closed, posts them in the server instead. */
async function sendRequestButtons(
  client: Client,
  db: Db,
  guilds: GuildConfig[],
  requestId: string,
  request: Snapshot["requests"] extends Map<string, infer R> ? R : never,
  name: (id: string) => string
) {
  if (!guilds.some((g) => g.announce.takeovers)) return;
  const discordIds = await discordIdsFor(db, [new ObjectId(request.holderId)]);
  const holderDiscord = discordIds.get(request.holderId);
  const champ = request.championId ? (await championNames(db, [request.championId])).get(request.championId) : null;
  const node = request.slot.slice(5);
  const link = appLink(`/attack?bg=${request.bg}&node=${node}`);
  const embed = new EmbedBuilder()
    .setColor(TEAL)
    .setTitle(`${name(request.requesterId)} wants node ${node}`)
    .setDescription(
      `BG ${request.bg}. ${champ ? `They'd use **${champ}**. ` : ""}Hand it over, or keep it?${link ? `\n[Open the map](${link})` : ""}`
    );
  const message: MessageCreateOptions = { embeds: [embed], components: [takeoverButtons(requestId)] };
  const sent: { channelId: string; messageId: string }[] = [];

  if (holderDiscord) {
    const user = await client.users.fetch(holderDiscord).catch(() => null);
    const dm = await user?.send(message).catch(() => null);
    if (dm) sent.push({ channelId: dm.channelId, messageId: dm.id });
  }
  if (sent.length === 0 && holderDiscord) {
    // DMs closed: post in the battlegroup or announcements channel and mention them.
    for (const config of guilds.filter((g) => g.announce.takeovers)) {
      const channel = await channelFor(client, announcementChannel(config, "takeovers", request.bg));
      const posted = await channel?.send({ ...message, content: `<@${holderDiscord}>` }).catch(() => null);
      if (posted) sent.push({ channelId: posted.channelId, messageId: posted.id });
    }
  }
  if (sent.length) requestMessages.set(requestId, sent);
}

async function closeRequestMessages(client: Client, requestId: string) {
  const sent = requestMessages.get(requestId);
  requestMessages.delete(requestId);
  for (const { channelId, messageId } of sent ?? []) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message && message.components.length) {
      await message
        .edit({ embeds: [new EmbedBuilder().setColor(BRASS).setDescription("This request was answered or has lapsed.")], components: [] })
        .catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------- reminders

async function sendReminders(client: Client, db: Db, configs: GuildConfig[]) {
  const next = nextAttackReset();
  const msLeft = next.getTime() - Date.now();
  for (const config of configs) {
    if (!config.announce.reminders || config.reminderHours.length === 0) continue;
    if (!client.guilds.cache.has(config.guildId)) continue;
    const due = config.reminderHours.filter(
      (h) => msLeft <= h * 3600_000 && !config.sentReminders.includes(`${next.getTime()}:${h}`)
    );
    if (due.length === 0) continue;
    // Mark first, so a slow post can't send it twice.
    const keys = due.map((h) => `${next.getTime()}:${h}`);
    const marked = await db.collection<GuildConfig>(DISCORD_GUILDS).updateOne(
      { guildId: config.guildId, sentReminders: { $nin: keys } },
      { $push: { sentReminders: { $each: keys, $slice: -20 } } }
    );
    if (marked.modifiedCount === 0) continue;
    if ((await getWarMode(db, config.allianceId)) !== "regular") continue;
    await postReminder(client, db, config, next);
  }
}

async function postReminder(client: Client, db: Db, config: GuildConfig, next: Date) {
  const users = await db.collection("users").find({ allianceId: config.allianceId, battlegroup: { $in: [1, 2, 3] } }).toArray();
  const docs = await db
    .collection(ATTACK_ASSIGNMENTS.regular)
    .find({ allianceId: config.allianceId, slot: { $in: UPPER_NODES.map(nodeSlot) } })
    .toArray();
  const hoursLeft = Math.max(1, Math.round((next.getTime() - Date.now()) / 3600_000));
  for (const bg of [1, 2, 3] as const) {
    const members = users.filter((u) => u.battlegroup === bg);
    if (members.length === 0) continue;
    const ids = new Set(members.map((m) => String(m._id)));
    const held = new Set(docs.filter((d) => d.battlegroup === bg && ids.has(String(d.userId))).map((d) => d.slot));
    const open = UPPER_NODES.filter((n) => !held.has(nodeSlot(n)));
    const text =
      `⏰ **About ${hoursLeft}h until the attack reset** (${resetLine(next)}).\n` +
      (open.length
        ? `BG ${bg} still has **${open.length}** open node${open.length === 1 ? "" : "s"}: ${open.join(", ")}.`
        : `BG ${bg} has every node 37-50 booked. 💪`);
    const channel = await channelFor(client, announcementChannel(config, "reminders", bg));
    await channel?.send({ embeds: [new EmbedBuilder().setColor(BRASS).setDescription(text)] }).catch(() => undefined);
  }
}
