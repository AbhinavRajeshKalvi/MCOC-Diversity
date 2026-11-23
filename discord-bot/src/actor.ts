import type { Interaction } from "discord.js";
import { isOfficerRole } from "../../src/lib/roles";
import { getDb, getGuildConfig, memberForDiscord, ObjectId, type GuildConfig, type Member } from "./store";

// Works out which app member a Discord user is, and which alliance a server belongs to.

export class UserError extends Error {}

export const NOT_LINKED =
  "Link your War Room account first: in the app open **Account → Discord → Link Discord**, then type `/link` here with the code.";
export const NOT_SET_UP = "This server isn't linked to an alliance yet. An officer runs `/setup` here first.";

export type Actor = {
  member: Member;
  allianceId: ObjectId;
  isOfficer: boolean;
  /** The server's settings, when the interaction came from a server. */
  config: GuildConfig | null;
};

/**
 * The linked member behind an interaction, checked against the server's
 * alliance. In DMs the member's own alliance is used.
 */
export async function requireActor(interaction: Interaction): Promise<Actor> {
  const db = await getDb();
  const member = await memberForDiscord(db, interaction.user.id);
  if (!member) throw new UserError(NOT_LINKED);
  if (!member.allianceId) throw new UserError("Your War Room account isn't in an alliance right now.");

  let config: GuildConfig | null = null;
  if (interaction.guildId) {
    config = await getGuildConfig(db, interaction.guildId);
    if (!config) throw new UserError(NOT_SET_UP);
    if (!config.allianceId.equals(member.allianceId)) {
      throw new UserError("This server belongs to a different alliance from your War Room account.");
    }
  }
  return { member, allianceId: member.allianceId, isOfficer: isOfficerRole(member.role), config };
}

export async function requireOfficer(interaction: Interaction): Promise<Actor> {
  const actor = await requireActor(interaction);
  if (!actor.isOfficer) throw new UserError("Only officers (in the War Room app) can do that.");
  return actor;
}

/** The server's settings, for commands anyone in the server can use without linking. */
export async function requireGuildConfig(interaction: Interaction): Promise<GuildConfig> {
  if (!interaction.guildId) throw new UserError("Use this command in your alliance's Discord server.");
  const config = await getGuildConfig(await getDb(), interaction.guildId);
  if (!config) throw new UserError(NOT_SET_UP);
  return config;
}

/** The battlegroup a command is about: the one given, or the member's own. */
export function pickBattlegroup(actor: Actor | null, given: number | null): 1 | 2 | 3 {
  if (given === 1 || given === 2 || given === 3) return given;
  const own = actor?.member.battlegroup;
  if (own) return own;
  throw new UserError("You're not in a battlegroup. Add the `bg` option to say which one.");
}
