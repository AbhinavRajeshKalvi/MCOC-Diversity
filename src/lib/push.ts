import webpush, { type PushSubscription } from "web-push";
import type { Db, Document } from "mongodb";
import { ObjectId } from "./db";
import type { NotificationKind } from "./notification-kinds";

// Web push for the home-screen app (and desktop browsers). Each device a
// member turns notifications on from saves a subscription; what they hear
// about is set per member on the Account page (users.notifications.<kind>).
//
// Needs VAPID keys in the environment. Generate them once with
// `npx web-push generate-vapid-keys` and keep them: changing the keys
// invalidates every saved subscription.

export const PUSH_SUBSCRIPTIONS = "pushSubscriptions";

export type PushPayload = {
  title: string;
  body: string;
  /** Page opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
};

type SubscriptionDoc = {
  userId: ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let configured: boolean | null = null;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set, so push notifications are off.");
    configured = false;
    return false;
  }
  const subject = process.env.VAPID_SUBJECT?.trim() || `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "admin@example.com"}`;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function pushEnabled(): boolean {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

let indexesReady: Promise<unknown> | null = null;
function ensureIndexes(db: Db) {
  indexesReady ??= Promise.all([
    db.collection(PUSH_SUBSCRIPTIONS).createIndex({ endpoint: 1 }, { unique: true }),
    db.collection(PUSH_SUBSCRIPTIONS).createIndex({ userId: 1 })
  ]).catch((err) => {
    indexesReady = null;
    throw err;
  });
  return indexesReady;
}

/** Saves this device's subscription for the member, moving it from anyone who used the device before. */
export async function saveSubscription(
  db: Db,
  userId: ObjectId,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null
) {
  await ensureIndexes(db);
  const now = new Date();
  await db.collection<SubscriptionDoc>(PUSH_SUBSCRIPTIONS).updateOne(
    { endpoint: subscription.endpoint },
    {
      $set: { userId, keys: subscription.keys, userAgent, updatedAt: now },
      $setOnInsert: { endpoint: subscription.endpoint, createdAt: now }
    },
    { upsert: true }
  );
}

export async function removeSubscription(db: Db, userId: ObjectId, endpoint: string) {
  await db.collection(PUSH_SUBSCRIPTIONS).deleteOne({ userId, endpoint });
}

/**
 * Sends a notification to every device of the given members who turned on
 * this kind of notification. Dead subscriptions are deleted as they're found.
 */
export async function sendPush(db: Db, kind: NotificationKind, userIds: ObjectId[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0 || !ensureConfigured()) return;
  const wanted = await db
    .collection("users")
    .find({ _id: { $in: userIds }, [`notifications.${kind}`]: true }, { projection: { _id: 1 } })
    .toArray();
  if (wanted.length === 0) return;
  const subscriptions = await db
    .collection<SubscriptionDoc>(PUSH_SUBSCRIPTIONS)
    .find({ userId: { $in: wanted.map((user) => user._id) } })
    .toArray();
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys } as PushSubscription, body, {
          TTL: 60 * 60 * 12,
          urgency: kind === "chat" ? "normal" : "high"
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.collection(PUSH_SUBSCRIPTIONS).deleteOne({ _id: sub._id });
        } else {
          console.warn(`[push] couldn't notify ${String(sub.userId)}:`, status ?? err);
        }
      }
    })
  );
}

/**
 * Members of an alliance matching `filter`, except the one who caused the
 * notification, who are then notified. Runs after the response so a slow
 * push service never holds up the request; failures are only logged.
 */
export function notifyAllianceMembers(
  db: Db,
  kind: NotificationKind,
  {
    allianceId,
    exclude,
    filter = {},
    include
  }: {
    allianceId: ObjectId;
    /** Who caused it, and anyone else who already knows. */
    exclude?: (ObjectId | string)[];
    filter?: Document;
    /** Narrows the matched members further, e.g. by who can see a chat. */
    include?: (user: Document) => boolean;
  },
  payload: PushPayload
): void {
  void (async () => {
    const users = await db
      .collection("users")
      .find(
        { allianceId, [`notifications.${kind}`]: true, ...filter },
        { projection: { _id: 1, role: 1, battlegroup: 1 } }
      )
      .toArray();
    const skip = new Set((exclude ?? []).map(String));
    const ids = users.filter((user) => !skip.has(String(user._id)) && (!include || include(user))).map((user) => user._id);
    await sendPush(db, kind, ids, payload);
  })().catch((err) => console.error(`[push] ${kind} notification failed:`, err));
}

/** Notifies specific members, after the response. */
export function notifyMembers(db: Db, kind: NotificationKind, userIds: (ObjectId | string)[], payload: PushPayload): void {
  const ids = userIds.map((id) => (typeof id === "string" ? new ObjectId(id) : id));
  void sendPush(db, kind, ids, payload).catch((err) => console.error(`[push] ${kind} notification failed:`, err));
}

export function truncate(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
