import { randomInt } from "crypto";
import type { Db } from "mongodb";
import type { ObjectId } from "./db";

// Links between app accounts and Discord accounts, used by the Discord bot
// (discord-bot/). A member makes a short code on the Account page and types
// `/link <code>` in Discord; the bot then acts as that member.

/** One Discord account per app account: { userId, discordId, discordUsername, linkedAt }. */
export const DISCORD_LINKS = "discordLinks";
/** Codes waiting to be typed into Discord: { code, userId, expiresAt }. */
export const DISCORD_LINK_CODES = "discordLinkCodes";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

export type DiscordLinkDoc = {
  userId: ObjectId;
  discordId: string;
  discordUsername: string;
  linkedAt: Date;
};

type LinkCodeDoc = { code: string; userId: ObjectId; expiresAt: Date; createdAt: Date };

let indexesReady: Promise<unknown> | null = null;
export function ensureDiscordIndexes(db: Db) {
  indexesReady ??= Promise.all([
    db.collection(DISCORD_LINKS).createIndex({ userId: 1 }, { unique: true }),
    db.collection(DISCORD_LINKS).createIndex({ discordId: 1 }, { unique: true }),
    db.collection(DISCORD_LINK_CODES).createIndex({ code: 1 }, { unique: true }),
    db.collection(DISCORD_LINK_CODES).createIndex({ userId: 1 }),
    db.collection(DISCORD_LINK_CODES).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]).catch((err) => {
    indexesReady = null;
    throw err;
  });
  return indexesReady;
}

export function normalizeLinkCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** A fresh 6-character code for the member, replacing any earlier one. */
export async function createLinkCode(db: Db, userId: ObjectId): Promise<{ code: string; expiresAt: Date }> {
  await ensureDiscordIndexes(db);
  const codes = db.collection<LinkCodeDoc>(DISCORD_LINK_CODES);
  await codes.deleteMany({ userId });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    try {
      await codes.insertOne({ code, userId, expiresAt, createdAt: now });
      return { code, expiresAt };
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error("Couldn't make a link code. Try again.");
}

/**
 * Used by the bot: turns a code into a link for this Discord account. Any
 * earlier link of either account is replaced. Returns the linked member's id,
 * or null when the code is wrong or has expired.
 */
export async function redeemLinkCode(
  db: Db,
  rawCode: string,
  discord: { id: string; username: string }
): Promise<ObjectId | null> {
  await ensureDiscordIndexes(db);
  const code = normalizeLinkCode(rawCode);
  const found = await db
    .collection<LinkCodeDoc>(DISCORD_LINK_CODES)
    .findOneAndDelete({ code, expiresAt: { $gt: new Date() } });
  if (!found) return null;
  const links = db.collection<DiscordLinkDoc>(DISCORD_LINKS);
  await links.deleteMany({ $or: [{ discordId: discord.id }, { userId: found.userId }] });
  await links.insertOne({
    userId: found.userId,
    discordId: discord.id,
    discordUsername: discord.username,
    linkedAt: new Date()
  });
  return found.userId;
}

export async function getDiscordLink(db: Db, userId: ObjectId): Promise<DiscordLinkDoc | null> {
  return db.collection<DiscordLinkDoc>(DISCORD_LINKS).findOne({ userId });
}

export async function removeDiscordLink(db: Db, userId: ObjectId): Promise<void> {
  await Promise.all([
    db.collection(DISCORD_LINKS).deleteMany({ userId }),
    db.collection(DISCORD_LINK_CODES).deleteMany({ userId })
  ]);
}
