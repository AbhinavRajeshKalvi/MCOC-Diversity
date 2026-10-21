import { fetch as streamingFetch } from "expo/fetch";
import { api, getApiToken } from "./api";
import { API_URL } from "./config";
import { isOfficerRole, type Role } from "./types";

// Alliance and battlegroup chat. Same rules as the server's src/lib/chat-channels.ts.

export type ChatChannel = "alliance" | "bg1" | "bg2" | "bg3";

export const CHAT_CHANNEL_LABELS: Record<ChatChannel, string> = {
  alliance: "Alliance",
  bg1: "BG 1",
  bg2: "BG 2",
  bg3: "BG 3"
};

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

export type ChatMessage = {
  id: string;
  channel: ChatChannel;
  userId: string;
  displayName: string;
  role: Role;
  text: string;
  createdAt: string;
};

/** Everyone gets the alliance chat; members get their own battlegroup's; officers get all three. */
export function chatChannelsFor(member: { role: Role; battlegroup: number | null }): ChatChannel[] {
  const all: ChatChannel[] = ["alliance", "bg1", "bg2", "bg3"];
  return all.filter((c) => c === "alliance" || isOfficerRole(member.role) || c === `bg${member.battlegroup}`);
}

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  // Message ids sort by creation time.
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function loadChat(channel: ChatChannel, before?: string) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return api<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/${channel}${query}`);
}

export function sendChat(channel: ChatChannel, text: string) {
  return api<{ message: ChatMessage }>(`/api/chat/${channel}`, { method: "POST", body: { text } });
}

export function deleteChat(channel: ChatChannel, id: string) {
  return api(`/api/chat/${channel}/${id}`, { method: "DELETE" });
}

type StreamHandlers = {
  onReady: () => void;
  onMessage: (message: ChatMessage) => void;
  onDelete: (id: string) => void;
  /** The member lost access (moved battlegroup, removed from the alliance). */
  onDenied: () => void;
  /** The connection ended for any other reason; the caller reconnects. */
  onClosed: () => void;
};

/**
 * Follows one chat live over the server's Server-Sent Events stream. React
 * Native has no EventSource, so this reads the stream with Expo's streaming
 * fetch, which can send the login token as a header. Returns a function that
 * closes the connection.
 */
export function openChatStream(channel: ChatChannel, after: string | null, handlers: StreamHandlers): () => void {
  const controller = new AbortController();
  let stopped = false;

  (async () => {
    let denied = false;
    try {
      const token = getApiToken();
      const query = after ? `?after=${encodeURIComponent(after)}` : "";
      const res = await streamingFetch(`${API_URL}/api/chat/${channel}/stream${query}`, {
        headers: { Accept: "text/event-stream", "X-Client": "mobile", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal
      });
      if (res.status === 403) {
        denied = true;
        return;
      }
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (block.startsWith(":") || stopped) continue; // heartbeat
          if (event === "ready") handlers.onReady();
          else if (event === "message") handlers.onMessage(JSON.parse(data) as ChatMessage);
          else if (event === "delete") handlers.onDelete((JSON.parse(data) as { id: string }).id);
          else if (event === "denied") denied = true;
        }
      }
    } catch {
      // Network drop or our own abort.
    } finally {
      if (!stopped) (denied ? handlers.onDenied : handlers.onClosed)();
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
  };
}
