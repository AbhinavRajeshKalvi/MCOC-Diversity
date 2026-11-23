import type { Db, Document, WithId } from "mongodb";
import { getDb, ObjectId } from "../../src/lib/db";
import { DISCORD_LINKS, ensureDiscordIndexes, type DiscordLinkDoc } from "../../src/lib/discord-link";
import type { Role } from "../../src/lib/roles";

export { getDb, ObjectId };

// The bot's own data, in the app's database.

/** One Discord server's settings, set up with /setup. */
export const DISCORD_GUILDS = "discordGuilds";

export type AnnounceKind = "bookings" | "takeovers" | "reminders" | "roster" | "members";
export const ANNOUNCE_KINDS: { kind: AnnounceKind; label: string }[] = [
  { kind: "bookings", label: "Node bookings" },
  { kind: "takeovers", label: "Node requests" },
  { kind: "reminders", label: "Reset reminders" },
  { kind: "roster", label: "Roster updates" },
  { kind: "members", label: "Member changes" }
];

export type RoleKey = "officer" | "bg1" | "bg2" | "bg3";
export const ROLE_NAMES: Record<RoleKey, string> = {
  officer: "War Officer",
  bg1: "BG 1",
  bg2: "BG 2",
  bg3: "BG 3"
};

export type GuildConfig = {
  guildId: string;
  allianceId: ObjectId;
  setupBy: ObjectId;
  setupAt: Date;
  /** Where announcements go. */
  warChannelId: string | null;
  /** Optional per-battlegroup channels for that battlegroup's bookings and reminders. */
  bgChannelIds: Partial<Record<"1" | "2" | "3", string>>;
  announce: Record<AnnounceKind, boolean>;
  /** Hours before the attack reset to post a reminder, largest first. */
  reminderHours: number[];
  /** Reminder keys already posted ("<reset ms>:<hours>"). */
  sentReminders: string[];
  /** Reply to messages like "I'll take 41" and "anyone have Hercules?". */
  smartWatch: boolean;
  roleSync: boolean;
  roleIds: Partial<Record<RoleKey, string>>;
};

export const DEFAULT_ANNOUNCE: Record<AnnounceKind, boolean> = {
  bookings: true,
  takeovers: true,
  reminders: true,
  roster: true,
  members: true
};

export type Member = {
  _id: ObjectId;
  username: string;
  displayName: string;
  role: Role;
  battlegroup: 1 | 2 | 3 | null;
  allianceId: ObjectId | null;
};

export function toMember(doc: WithId<Document>): Member {
  return {
    _id: doc._id,
    username: doc.username as string,
    displayName: doc.displayName as string,
    role: (doc.role as Role) ?? "member",
    battlegroup: (doc.battlegroup as 1 | 2 | 3 | null) ?? null,
    allianceId: (doc.allianceId as ObjectId | null) ?? null
  };
}

export async function initStore(db: Db) {
  await ensureDiscordIndexes(db);
  await db.collection(DISCORD_GUILDS).createIndex({ guildId: 1 }, { unique: true });
  await db.collection(DISCORD_GUILDS).createIndex({ allianceId: 1 });
}

export async function getGuildConfig(db: Db, guildId: string): Promise<GuildConfig | null> {
  const doc = await db.collection<GuildConfig>(DISCORD_GUILDS).findOne({ guildId });
  return doc ? withDefaults(doc) : null;
}

export async function allGuildConfigs(db: Db): Promise<GuildConfig[]> {
  return (await db.collection<GuildConfig>(DISCORD_GUILDS).find({}).toArray()).map(withDefaults);
}

function withDefaults(doc: GuildConfig): GuildConfig {
  return {
    ...doc,
    warChannelId: doc.warChannelId ?? null,
    bgChannelIds: doc.bgChannelIds ?? {},
    announce: { ...DEFAULT_ANNOUNCE, ...(doc.announce ?? {}) },
    reminderHours: Array.isArray(doc.reminderHours) ? doc.reminderHours : [2],
    sentReminders: doc.sentReminders ?? [],
    smartWatch: doc.smartWatch ?? true,
    roleSync: doc.roleSync ?? false,
    roleIds: doc.roleIds ?? {}
  };
}

export async function updateGuildConfig(db: Db, guildId: string, set: Partial<GuildConfig>) {
  await db.collection<GuildConfig>(DISCORD_GUILDS).updateOne({ guildId }, { $set: set });
}

/** The app member linked to a Discord account. */
export async function memberForDiscord(db: Db, discordId: string): Promise<Member | null> {
  const link = await db.collection<DiscordLinkDoc>(DISCORD_LINKS).findOne({ discordId });
  if (!link) return null;
  const user = await db.collection("users").findOne({ _id: link.userId });
  return user ? toMember(user) : null;
}

/** Discord ids of linked members, keyed by app user id. */
export async function discordIdsFor(db: Db, userIds: ObjectId[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const links = await db
    .collection<DiscordLinkDoc>(DISCORD_LINKS)
    .find({ userId: { $in: userIds } })
    .toArray();
  return new Map(links.map((link) => [String(link.userId), link.discordId]));
}

export async function allianceMembers(db: Db, allianceId: ObjectId): Promise<Member[]> {
  const docs = await db.collection("users").find({ allianceId }).sort({ displayName: 1 }).toArray();
  return docs.map(toMember);
}

export async function allianceName(db: Db, allianceId: ObjectId): Promise<string> {
  const doc = await db.collection("alliances").findOne({ _id: allianceId }, { projection: { name: 1 } });
  return (doc?.name as string) ?? "your alliance";
}
