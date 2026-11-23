import { PermissionFlagsBits, type Client, type Guild } from "discord.js";
import type { Db } from "mongodb";
import { isOfficerRole } from "../../src/lib/roles";
import { DISCORD_LINKS, type DiscordLinkDoc } from "../../src/lib/discord-link";
import { ROLE_NAMES, allianceMembers, getGuildConfig, type GuildConfig, type Member, type RoleKey } from "./store";

// Gives linked members Discord roles that match their War Room role and
// battlegroup. Only the roles set up with /roles are touched.

function wanted(member: Member | null): Set<RoleKey> {
  const keys = new Set<RoleKey>();
  if (!member) return keys;
  if (isOfficerRole(member.role)) keys.add("officer");
  if (member.battlegroup) keys.add(`bg${member.battlegroup}` as RoleKey);
  return keys;
}

/** Brings one Discord member's managed roles in line. `member` null means they're no longer in the alliance. */
async function syncOne(guild: Guild, config: GuildConfig, discordId: string, member: Member | null): Promise<boolean> {
  const discordMember = await guild.members.fetch(discordId).catch(() => null);
  if (!discordMember) return false;
  const want = wanted(member);
  const add: string[] = [];
  const remove: string[] = [];
  for (const key of Object.keys(ROLE_NAMES) as RoleKey[]) {
    const roleId = config.roleIds[key];
    if (!roleId || !guild.roles.cache.has(roleId)) continue;
    const has = discordMember.roles.cache.has(roleId);
    if (want.has(key) && !has) add.push(roleId);
    if (!want.has(key) && has) remove.push(roleId);
  }
  if (add.length) await discordMember.roles.add(add, "War Room role sync");
  if (remove.length) await discordMember.roles.remove(remove, "War Room role sync");
  return add.length + remove.length > 0;
}

/** Syncs every linked alliance member in the server. Returns how many members changed. */
export async function syncGuildRoles(client: Client, db: Db, guildId: string): Promise<number> {
  const config = await getGuildConfig(db, guildId);
  if (!config?.roleSync) return 0;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return 0;
  const members = await allianceMembers(db, config.allianceId);
  const links = await db
    .collection<DiscordLinkDoc>(DISCORD_LINKS)
    .find({ userId: { $in: members.map((m) => m._id) } })
    .toArray();
  const byId = new Map(members.map((m) => [String(m._id), m]));
  let changed = 0;
  for (const link of links) {
    try {
      if (await syncOne(guild, config, link.discordId, byId.get(String(link.userId)) ?? null)) changed += 1;
    } catch (err) {
      console.warn(`[roles] couldn't update ${link.discordUsername} in ${guild.name}:`, (err as Error).message);
    }
  }
  return changed;
}

/** Syncs one person in every server of their alliance (after /link, a role change, or leaving). */
export async function syncMemberEverywhere(
  client: Client,
  db: Db,
  configs: GuildConfig[],
  discordId: string,
  member: Member | null
) {
  for (const config of configs) {
    if (!config.roleSync) continue;
    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (!guild) continue;
    await syncOne(guild, config, discordId, member).catch((err) =>
      console.warn(`[roles] couldn't update ${discordId} in ${guild.name}:`, (err as Error).message)
    );
  }
}

/** Creates any missing War Officer / BG roles and returns their ids. */
export async function createRoles(guild: Guild, existing: GuildConfig["roleIds"]): Promise<GuildConfig["roleIds"]> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("The bot needs the Manage Roles permission. Give it that in Server Settings → Roles, then try again.");
  }
  await guild.roles.fetch();
  const ids: GuildConfig["roleIds"] = { ...existing };
  for (const key of Object.keys(ROLE_NAMES) as RoleKey[]) {
    if (ids[key] && guild.roles.cache.has(ids[key]!)) continue;
    const found = guild.roles.cache.find((role) => role.name === ROLE_NAMES[key]);
    const role =
      found ??
      (await guild.roles.create({
        name: ROLE_NAMES[key],
        mentionable: true,
        color: key === "officer" ? 0xe0a93b : undefined,
        reason: "War Room role sync"
      }));
    ids[key] = role.id;
  }
  return ids;
}

/** Roles the bot can't assign because they sit above its own highest role. */
export function rolesAboveBot(guild: Guild, roleIds: GuildConfig["roleIds"]): string[] {
  const top = guild.members.me?.roles.highest.position ?? 0;
  return Object.values(roleIds)
    .filter((id): id is string => Boolean(id))
    .map((id) => guild.roles.cache.get(id))
    .filter((role) => role && role.position >= top)
    .map((role) => role!.name);
}
