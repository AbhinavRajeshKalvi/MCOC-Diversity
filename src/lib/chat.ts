import { EventEmitter } from "events";
import type { Db, Document, WithId } from "mongodb";
import { getDb, ObjectId } from "./db";
import { canUseChannel, type ChatChannel, type ChatMessage } from "./chat-channels";

export const CHAT_COLLECTION = "chatMessages";

/** What a live chat connection is told about. */
export type ChatEvent =
  | { type: "message"; allianceId: string; message: ChatMessage }
  | { type: "delete"; allianceId: string; channel: ChatChannel; id: string }
  /** The feed may have missed events; connections should close so clients reconnect and catch up. */
  | { type: "resync" };

export function toChatMessage(doc: WithId<Document>): ChatMessage {
  return {
    id: doc._id.toString(),
    channel: doc.channel as ChatChannel,
    userId: String(doc.userId),
    displayName: doc.displayName as string,
    role: doc.role as string,
    text: doc.text as string,
    createdAt: (doc.createdAt as Date).toISOString()
  };
}

/**
 * Live chat events for this server process.
 *
 * On a replica set (MongoDB Atlas always is) the hub follows a change stream
 * on the chat collection, so every server instance sees every message no
 * matter which instance saved it. A standalone mongod (a plain local install)
 * has no change streams, so the hub only relays messages saved by this
 * process, which is all there is when running one server.
 */
type Hub = {
  emitter: EventEmitter;
  mode: "changeStream" | "local";
  ready: Promise<void>;
};

declare global {
  // eslint-disable-next-line no-var
  var __mcocChatHub: Hub | undefined;
}

async function supportsChangeStreams(db: Db): Promise<boolean> {
  try {
    const hello = await db.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === "isdbgrid";
  } catch {
    return false;
  }
}

function followChangeStream(db: Db, hub: Hub) {
  const stream = db.collection(CHAT_COLLECTION).watch(
    [{ $match: { operationType: { $in: ["insert", "update"] } } }],
    { fullDocument: "updateLookup" }
  );
  stream.on("change", (change: any) => {
    const doc = change.fullDocument as WithId<Document> | undefined;
    if (!doc) return;
    const allianceId = String(doc.allianceId);
    if (doc.deletedAt) {
      hub.emitter.emit("event", { type: "delete", allianceId, channel: doc.channel, id: doc._id.toString() });
    } else if (change.operationType === "insert") {
      hub.emitter.emit("event", { type: "message", allianceId, message: toChatMessage(doc) });
    }
  });
  stream.on("error", (err) => {
    console.error("[chat] change stream failed, restarting:", err);
    stream.close().catch(() => undefined);
    // Anything said while the stream was down would be lost, so make every
    // open connection reconnect and catch up from its last message.
    hub.emitter.emit("event", { type: "resync" });
    setTimeout(() => followChangeStream(db, hub), 2000);
  });
}

async function startHub(hub: Hub) {
  const db = await getDb();
  if (await supportsChangeStreams(db)) {
    hub.mode = "changeStream";
    followChangeStream(db, hub);
  } else {
    console.log("[chat] MongoDB is not a replica set; live chat is relayed within this server only.");
  }
}

function getHub(): Hub {
  if (!globalThis.__mcocChatHub) {
    const hub: Hub = { emitter: new EventEmitter(), mode: "local", ready: Promise.resolve() };
    // One listener per open chat connection; up to 30 members x a few tabs.
    hub.emitter.setMaxListeners(0);
    hub.ready = startHub(hub).catch((err) => {
      globalThis.__mcocChatHub = undefined;
      throw err;
    });
    globalThis.__mcocChatHub = hub;
  }
  return globalThis.__mcocChatHub;
}

/** Calls `listener` for each chat event until the returned function is called. */
export async function subscribeToChat(listener: (event: ChatEvent) => void): Promise<() => void> {
  const hub = getHub();
  await hub.ready;
  hub.emitter.on("event", listener);
  return () => hub.emitter.off("event", listener);
}

/** Tells live connections about a change this process just saved (only needed without a change stream). */
export async function publishChatEvent(event: ChatEvent) {
  const hub = getHub();
  await hub.ready;
  if (hub.mode === "local") hub.emitter.emit("event", event);
}

/** The member's current alliance, role and battlegroup, read fresh so removals and BG moves apply at once. */
export async function loadChatMember(db: Db, userId: string) {
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { allianceId: 1, role: 1, battlegroup: 1, displayName: 1 } }
  );
  if (!user?.allianceId) return null;
  return {
    allianceId: user.allianceId as ObjectId,
    role: user.role as string,
    battlegroup: (user.battlegroup as number | null) ?? null,
    displayName: user.displayName as string
  };
}

export type ChatMember = NonNullable<Awaited<ReturnType<typeof loadChatMember>>>;

export function memberCanUse(member: ChatMember | null, allianceId: string, channel: ChatChannel): boolean {
  return Boolean(member) && String(member!.allianceId) === allianceId && canUseChannel(member!, channel);
}

/** Messages in a channel, oldest first: the latest `limit`, or those before/after a message id. */
export async function listChatMessages(
  db: Db,
  allianceId: ObjectId,
  channel: ChatChannel,
  { before, after, limit }: { before?: ObjectId | null; after?: ObjectId | null; limit: number }
): Promise<ChatMessage[]> {
  const filter: Document = { allianceId, channel, deletedAt: { $exists: false } };
  if (after) {
    filter._id = { $gt: after };
    const docs = await db.collection(CHAT_COLLECTION).find(filter).sort({ _id: 1 }).limit(limit).toArray();
    return docs.map(toChatMessage);
  }
  if (before) filter._id = { $lt: before };
  const docs = await db.collection(CHAT_COLLECTION).find(filter).sort({ _id: -1 }).limit(limit).toArray();
  return docs.reverse().map(toChatMessage);
}
