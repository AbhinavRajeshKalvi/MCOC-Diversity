"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal, Trash2 } from "lucide-react";
import { isOfficerRole, type Role } from "@/lib/roles";
import { sendJson } from "@/lib/client-fetch";
import {
  CHAT_CHANNEL_LABELS,
  MAX_CHAT_MESSAGE_LENGTH,
  type ChatChannel,
  type ChatMessage
} from "@/lib/chat-channels";
import SlidingTabs from "./SlidingTabs";

type Viewer = { userId: string; role: Role };
type Status = "connecting" | "live" | "reconnecting" | "denied";

/** Messages from the same member within this long share one name header. */
const GROUP_WINDOW_MS = 5 * 60_000;

const ROLE_COLORS: Record<string, string> = {
  admin: "#C084FC",
  leader: "#F6C861",
  officer: "#38BDF8"
};

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  // ObjectIds sort by creation time.
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export default function ChatPanel({
  channels,
  initialChannel,
  myBattlegroup,
  viewer
}: {
  channels: ChatChannel[];
  initialChannel: ChatChannel;
  myBattlegroup: number | null;
  viewer: Viewer;
}) {
  const [channel, setChannel] = useState(initialChannel);
  const active = Math.max(0, channels.indexOf(channel));

  function select(index: number) {
    const next = channels[index]!;
    setChannel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("c", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      {channels.length > 1 && (
        <SlidingTabs
          tabs={channels.map((c) => ({
            key: c,
            label: c === `bg${myBattlegroup}` ? `${CHAT_CHANNEL_LABELS[c]} (yours)` : CHAT_CHANNEL_LABELS[c]
          }))}
          active={active}
          onSelect={select}
        />
      )}
      {/* Remount per chat so each starts with its own history and connection. */}
      <ChatRoom key={channel} channel={channel} viewer={viewer} />
    </div>
  );
}

/** One chat's messages, live feed and composer. `className` sizes it (full page or the floating popup). */
export function ChatRoom({
  channel,
  viewer,
  className = "panel h-[calc(100dvh-15rem)] min-h-[420px] md:h-[calc(100vh-14rem)]"
}: {
  channel: ChatChannel;
  viewer: Viewer;
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Stick to the bottom when new messages arrive, unless the member scrolled up to read.
  const stickToBottom = useRef(true);
  // Keeps the view in place when older messages are added above.
  const restoreFrom = useRef<number | null>(null);
  const lastId = useRef<string | null>(null);
  const officer = isOfficerRole(viewer.role);

  useEffect(() => {
    lastId.current = messages.length ? messages[messages.length - 1]!.id : lastId.current;
  }, [messages]);

  // History first, then the live feed from the newest message we have.
  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;
    let retryTimer: number | undefined;

    function connect() {
      if (cancelled) return;
      const after = lastId.current ? `?after=${encodeURIComponent(lastId.current)}` : "";
      source = new EventSource(`/api/chat/${channel}/stream${after}`);
      source.addEventListener("ready", () => setStatus("live"));
      source.addEventListener("message", (event) => {
        const message = JSON.parse((event as MessageEvent).data) as ChatMessage;
        setMessages((current) => mergeMessages(current, [message]));
      });
      source.addEventListener("delete", (event) => {
        const { id } = JSON.parse((event as MessageEvent).data) as { id: string };
        setMessages((current) => current.filter((m) => m.id !== id));
      });
      source.addEventListener("denied", () => {
        setStatus("denied");
        source?.close();
      });
      source.onerror = () => {
        // EventSource retries by itself, but resumes from its own last id, which
        // misses messages we only got from our own POST. Reconnect ourselves.
        source?.close();
        if (cancelled) return;
        setStatus((s) => (s === "denied" ? s : "reconnecting"));
        retryTimer = window.setTimeout(connect, 3000);
      };
    }

    (async () => {
      try {
        const res = await fetch(`/api/chat/${channel}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the chat.");
        if (cancelled) return;
        setMessages((current) => mergeMessages(current, data.messages));
        setHasMore(Boolean(data.hasMore));
        lastId.current = data.messages.length ? data.messages[data.messages.length - 1].id : null;
        setLoaded(true);
        connect();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load the chat.");
        setLoaded(true);
        setStatus("reconnecting");
        retryTimer = window.setTimeout(connect, 3000);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [channel]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (restoreFrom.current !== null) {
      list.scrollTop = list.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, loaded]);

  function onScroll() {
    const list = listRef.current;
    if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  const loadOlder = useCallback(async () => {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/chat/${channel}?before=${encodeURIComponent(messages[0]!.id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load older messages.");
      const list = listRef.current;
      if (list) restoreFrom.current = list.scrollHeight - list.scrollTop;
      setMessages((current) => mergeMessages(current, data.messages));
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [channel, messages, loadingOlder]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await sendJson<{ message: ChatMessage }>(`/api/chat/${channel}`, "POST", { text });
      stickToBottom.current = true;
      setMessages((current) => mergeMessages(current, [data.message]));
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function remove(message: ChatMessage) {
    if (!window.confirm("Remove this message for everyone?")) return;
    setError(null);
    try {
      await sendJson(`/api/chat/${channel}/${message.id}`, "DELETE");
      setMessages((current) => current.filter((m) => m.id !== message.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the message.");
    }
  }

  const statusLabel =
    status === "live" ? "Live" : status === "connecting" ? "Connecting…" : status === "denied" ? "No access" : "Reconnecting…";
  const statusColor = status === "live" ? "bg-teal-bright" : status === "denied" ? "bg-crimson-bright" : "bg-brass animate-pulse";

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-ink-line/80">
        <div className="font-display text-lg font-semibold uppercase tracking-wider text-parchment">
          {CHAT_CHANNEL_LABELS[channel]} chat
        </div>
        <div className="flex items-center gap-2 text-xs text-parchment-faint" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} aria-hidden />
          {statusLabel}
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3" role="log" aria-label={`${CHAT_CHANNEL_LABELS[channel]} messages`}>
        {hasMore && (
          <div className="flex justify-center mb-3">
            <button type="button" onClick={loadOlder} disabled={loadingOlder} className="btn-ghost !py-1 !px-3 text-xs">
              {loadingOlder && <Loader2 size={12} className="animate-spin" aria-hidden />}
              Load older messages
            </button>
          </div>
        )}
        {!loaded ? (
          <div className="h-full grid place-items-center text-parchment-faint">
            <Loader2 size={20} className="animate-spin" aria-label="Loading" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-parchment-faint text-center px-6">
            No messages yet. Say hello to your {channel === "alliance" ? "alliance" : "battlegroup"}.
          </div>
        ) : (
          messages.map((message, i) => {
            const previous = messages[i - 1];
            const grouped =
              previous &&
              previous.userId === message.userId &&
              Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_WINDOW_MS;
            const mine = message.userId === viewer.userId;
            const roleColor = ROLE_COLORS[message.role];
            return (
              <div key={message.id} className={`group relative flex flex-col ${grouped ? "mt-0.5" : "mt-3 first:mt-0"}`}>
                {!grouped && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className={`text-sm font-semibold ${mine ? "text-brass-bright" : "text-parchment"}`}>
                      {message.displayName}
                    </span>
                    {roleColor && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: roleColor }}>
                        {message.role}
                      </span>
                    )}
                    <span className="text-[11px] text-parchment-faint">{formatTime(message.createdAt)}</span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm text-parchment-dim whitespace-pre-wrap break-words" title={grouped ? formatTime(message.createdAt) : undefined}>
                    {message.text}
                  </p>
                  {(mine || officer) && (
                    <button
                      type="button"
                      onClick={() => remove(message)}
                      className="shrink-0 p-1 rounded text-parchment-faint/70 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 hover:text-crimson-bright hover:bg-crimson/10 transition-opacity"
                      aria-label="Remove message"
                      title="Remove message"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && <div className="px-4 py-2 text-xs text-crimson-bright border-t border-crimson/30 bg-crimson/10">{error}</div>}
      {status === "denied" ? (
        <div className="px-4 py-3 text-sm text-parchment-faint border-t border-ink-line/80">
          You no longer have access to this chat. Reload the page to see your chats.
        </div>
      ) : (
        <form
          className="flex items-end gap-2 p-3 border-t border-ink-line/80 bg-ink/40"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter starts a new line.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            placeholder={`Message ${CHAT_CHANNEL_LABELS[channel]}`}
            aria-label="Message"
            className="field-input resize-none max-h-32 min-h-[40px]"
          />
          <button type="submit" disabled={!draft.trim() || sending} className="btn-primary h-10 w-10 !p-0 shrink-0" aria-label="Send">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
          </button>
        </form>
      )}
    </div>
  );
}
