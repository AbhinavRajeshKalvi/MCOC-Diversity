import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { allowRequest } from "@/lib/rate-limit";
import { CHAT_COLLECTION, listChatMessages, loadChatMember, memberCanUse, publishChatEvent, toChatMessage } from "@/lib/chat";
import { MAX_CHAT_MESSAGE_LENGTH, isChatChannel, type ChatChannel } from "@/lib/chat-channels";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 50;

/** The signed-in member, if they may use this channel. */
async function channelAccess(channel: string) {
  const session = await requireAlliance();
  if (!isChatChannel(channel)) return { error: NextResponse.json({ error: "Unknown chat." }, { status: 404 }) };
  const db = await getDb();
  const member = await loadChatMember(db, session.userId);
  if (!member || !memberCanUse(member, session.allianceId, channel)) {
    return {
      error: NextResponse.json({ error: "This chat is only for members of that battlegroup and officers." }, { status: 403 })
    };
  }
  return { db, session, member, channel: channel as ChatChannel };
}

// The latest messages in a chat, or older ones with ?before=<message id>.
export const GET = withErrorHandling("GET /api/chat", async (req: NextRequest, { params }: { params: { channel: string } }) => {
  const access = await channelAccess(params.channel);
  if (access.error) return access.error;
  const before = toObjectId(req.nextUrl.searchParams.get("before") ?? "");
  const messages = await listChatMessages(access.db, access.member.allianceId, access.channel, {
    before,
    limit: PAGE_SIZE
  });
  return NextResponse.json({ messages, hasMore: messages.length === PAGE_SIZE });
});

const schema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Type a message first.")
    .max(MAX_CHAT_MESSAGE_LENGTH, `Messages can be at most ${MAX_CHAT_MESSAGE_LENGTH} characters.`)
});

// Posts a message. Everyone connected to the chat gets it straight away.
export const POST = withErrorHandling("POST /api/chat", async (req: NextRequest, { params }: { params: { channel: string } }) => {
  const access = await channelAccess(params.channel);
  if (access.error) return access.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Type a message first." }, { status: 400 });
  }
  if (!allowRequest(`chat:${access.session.userId}`, 15, 20_000)) {
    return NextResponse.json({ error: "You're sending messages too fast. Wait a few seconds." }, { status: 429 });
  }

  const doc = {
    allianceId: access.member.allianceId,
    channel: access.channel,
    userId: toObjectId(access.session.userId)!,
    displayName: access.member.displayName,
    role: access.member.role,
    text: parsed.data.text,
    createdAt: new Date()
  };
  const result = await access.db.collection(CHAT_COLLECTION).insertOne(doc);
  const message = toChatMessage({ ...doc, _id: result.insertedId });
  await publishChatEvent({ type: "message", allianceId: access.session.allianceId, message });
  return NextResponse.json({ message }, { status: 201 });
});
