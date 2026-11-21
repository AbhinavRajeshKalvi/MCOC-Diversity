import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, ObjectId } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { removeSubscription, saveSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) })
});

// Saves this device's push subscription for the signed-in member.
export const POST = withErrorHandling("POST /api/push/subscription", async (req: NextRequest) => {
  const session = await requireSession();
  const parsed = z.object({ subscription: subscriptionSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.subscription.endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  await saveSubscription(
    await getDb(),
    new ObjectId(session.userId),
    parsed.data.subscription,
    req.headers.get("user-agent")?.slice(0, 300) ?? null
  );
  return NextResponse.json({ ok: true });
});

// Forgets this device.
export const DELETE = withErrorHandling("DELETE /api/push/subscription", async (req: NextRequest) => {
  const session = await requireSession();
  const parsed = z.object({ endpoint: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await removeSubscription(await getDb(), new ObjectId(session.userId), parsed.data.endpoint);
  return NextResponse.json({ ok: true });
});
