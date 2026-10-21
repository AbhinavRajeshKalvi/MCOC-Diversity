import { NextRequest, NextResponse } from "next/server";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { listChatMessages, loadChatMember, memberCanUse, subscribeToChat, type ChatEvent } from "@/lib/chat";
import { isChatChannel, type ChatChannel } from "@/lib/chat-channels";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Keeps proxies (and Render's load balancer) from closing an idle connection. */
const HEARTBEAT_MS = 20_000;
/** How often to re-check that the member is still allowed in this chat. */
const ACCESS_CHECK_MS = 60_000;
/** Most messages sent when catching up after a reconnect. */
const CATCH_UP_LIMIT = 200;

/**
 * A live feed of one chat as Server-Sent Events. The website reads it with
 * EventSource and the app with a streaming fetch.
 *
 * Events: `message` (data: a ChatMessage, id: its id), `delete` (data: {id}),
 * `denied` when the member loses access, and comments as heartbeats. After a
 * dropped connection the client reconnects with ?after=<last id> (or the
 * Last-Event-ID header EventSource sends) and gets what it missed first.
 */
export const GET = withErrorHandling(
  "GET /api/chat/stream",
  async (req: NextRequest, { params }: { params: { channel: string } }) => {
    const session = await requireAlliance();
    if (!isChatChannel(params.channel)) return NextResponse.json({ error: "Unknown chat." }, { status: 404 });
    const channel: ChatChannel = params.channel;
    const db = await getDb();
    if (!memberCanUse(await loadChatMember(db, session.userId), session.allianceId, channel)) {
      return NextResponse.json({ error: "This chat is only for members of that battlegroup and officers." }, { status: 403 });
    }

    const after = toObjectId(req.nextUrl.searchParams.get("after") ?? req.headers.get("last-event-id") ?? "");
    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let lastSentId = after?.toString() ?? "";
        // Events that arrive while the catch-up query runs wait here.
        let pending: ChatEvent[] | null = [];

        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            close();
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          cleanup();
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        };

        const deliver = (event: ChatEvent) => {
          if (event.type === "resync") return close();
          if (event.allianceId !== session.allianceId) return;
          if (event.type === "message") {
            if (event.message.channel !== channel) return;
            // ObjectIds sort by time, so anything at or before the last one sent is a repeat.
            if (lastSentId && event.message.id <= lastSentId) return;
            lastSentId = event.message.id;
            write(`id: ${event.message.id}\nevent: message\ndata: ${JSON.stringify(event.message)}\n\n`);
          } else if (event.channel === channel) {
            write(`event: delete\ndata: ${JSON.stringify({ id: event.id })}\n\n`);
          }
        };

        const unsubscribe = await subscribeToChat((event) => {
          if (pending) pending.push(event);
          else deliver(event);
        });
        const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
        const accessCheck = setInterval(async () => {
          try {
            if (!memberCanUse(await loadChatMember(db, session.userId), session.allianceId, channel)) {
              write(`event: denied\ndata: {}\n\n`);
              close();
            }
          } catch {
            // Database hiccup: keep the connection and check again next time.
          }
        }, ACCESS_CHECK_MS);
        cleanup = () => {
          unsubscribe();
          clearInterval(heartbeat);
          clearInterval(accessCheck);
        };
        req.signal.addEventListener("abort", close);
        if (req.signal.aborted) return close();

        // Tell EventSource to wait 3s before reconnecting, and say we're live.
        write(`retry: 3000\nevent: ready\ndata: {}\n\n`);
        if (after) {
          try {
            const missed = await listChatMessages(db, session.alliance, channel, { after, limit: CATCH_UP_LIMIT });
            for (const message of missed) deliver({ type: "message", allianceId: session.allianceId, message });
          } catch {
            return close();
          }
        }
        const queued = pending;
        pending = null;
        for (const event of queued) deliver(event);
      },
      cancel() {
        cleanup();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        // no-transform stops Next's gzip from buffering the stream.
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  }
);
