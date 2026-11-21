import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { pushEnabled, vapidPublicKey } from "@/lib/push";
import { readNotificationPrefs } from "@/lib/notification-kinds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The member's notification settings and the key a device subscribes with.
export const GET = withErrorHandling("GET /api/push", async () => {
  const session = await requireSession();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId) }, { projection: { notifications: 1 } });
  return NextResponse.json({
    enabled: pushEnabled(),
    publicKey: vapidPublicKey(),
    prefs: readNotificationPrefs(user?.notifications)
  });
});

const prefsSchema = z
  .object({
    chat: z.boolean(),
    booking: z.boolean(),
    takeover: z.boolean(),
    roster: z.boolean(),
    members: z.boolean()
  })
  .partial();

// Turns notification kinds on or off for the member, on every device.
export const PATCH = withErrorHandling("PATCH /api/push", async (req: NextRequest) => {
  const session = await requireSession();
  const parsed = prefsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid notification settings." }, { status: 400 });
  }
  const set = Object.fromEntries(Object.entries(parsed.data).map(([kind, on]) => [`notifications.${kind}`, on]));
  const db = await getDb();
  const user = await db
    .collection("users")
    .findOneAndUpdate({ _id: new ObjectId(session.userId) }, { $set: set }, { returnDocument: "after", projection: { notifications: 1 } });
  return NextResponse.json({ prefs: readNotificationPrefs(user?.notifications) });
});
