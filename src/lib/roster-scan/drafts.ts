import { randomBytes } from "node:crypto";
import type { Db, ObjectId } from "mongodb";
import type { ImportRow } from "./analyze";

/**
 * Import drafts: screenshots scanned somewhere other than the web app (the
 * Discord bot), waiting for their owner to review and save them on the roster
 * page. Nothing reaches the roster until the owner confirms in the app.
 */
export const DRAFTS = "rosterScanDrafts";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type DraftDoc = {
  /** Random, URL-safe token; also the link the user opens. */
  _id: string;
  userId: ObjectId;
  rows: ImportRow[];
  errors: { file: string; error: string }[];
  screenshots: number;
  source: "discord";
  createdAt: Date;
  expiresAt: Date;
};

const indexed = new WeakSet<Db>();
async function ensureIndex(db: Db) {
  if (indexed.has(db)) return;
  // Mongo deletes drafts once expiresAt has passed (checked about once a minute).
  await db.collection(DRAFTS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexed.add(db);
}

/** 24 random bytes as base64url: 32 characters of A-Z a-z 0-9 - _. */
export function isDraftId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{32}$/.test(id);
}

export async function createDraft(
  db: Db,
  userId: ObjectId,
  data: { rows: ImportRow[]; errors: { file: string; error: string }[]; screenshots: number }
): Promise<string> {
  await ensureIndex(db);
  const now = new Date();
  const id = randomBytes(24).toString("base64url");
  await db.collection<DraftDoc>(DRAFTS).insertOne({
    _id: id,
    userId,
    rows: data.rows,
    errors: data.errors,
    screenshots: data.screenshots,
    source: "discord",
    createdAt: now,
    expiresAt: new Date(now.getTime() + DRAFT_TTL_MS)
  });
  return id;
}

/** The draft, only if it belongs to this user and hasn't expired. */
export async function loadDraft(db: Db, id: string, userId: ObjectId): Promise<DraftDoc | null> {
  if (!isDraftId(id)) return null;
  return db.collection<DraftDoc>(DRAFTS).findOne({ _id: id, userId, expiresAt: { $gt: new Date() } });
}

export async function deleteDraft(db: Db, id: string, userId: ObjectId): Promise<void> {
  if (!isDraftId(id)) return;
  await db.collection<DraftDoc>(DRAFTS).deleteOne({ _id: id, userId });
}
