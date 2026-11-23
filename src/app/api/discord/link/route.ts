import { NextResponse } from "next/server";
import { getDb, ObjectId } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { allowRequest } from "@/lib/rate-limit";
import { createLinkCode, getDiscordLink, removeDiscordLink } from "@/lib/discord-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The member's Discord link, for the Account page.
export const GET = withErrorHandling("GET /api/discord/link", async () => {
  const session = await requireSession();
  const link = await getDiscordLink(await getDb(), new ObjectId(session.userId));
  return NextResponse.json({
    linked: Boolean(link),
    discordUsername: link?.discordUsername ?? null,
    linkedAt: link?.linkedAt?.toISOString() ?? null
  });
});

// A new code to type into Discord as `/link <code>`. Valid for 10 minutes.
export const POST = withErrorHandling("POST /api/discord/link", async () => {
  const session = await requireSession();
  if (!allowRequest(`discord-link:${session.userId}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many codes. Wait a few minutes and try again." }, { status: 429 });
  }
  const { code, expiresAt } = await createLinkCode(await getDb(), new ObjectId(session.userId));
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
});

// Unlinks Discord: the bot stops acting for this member.
export const DELETE = withErrorHandling("DELETE /api/discord/link", async () => {
  const session = await requireSession();
  await removeDiscordLink(await getDb(), new ObjectId(session.userId));
  return NextResponse.json({ ok: true });
});
