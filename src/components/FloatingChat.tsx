"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, MessagesSquare, X } from "lucide-react";
import type { Role } from "@/lib/roles";
import { CHAT_CHANNEL_LABELS, isChatChannel, type ChatChannel } from "@/lib/chat-channels";
import { ChatRoom } from "./ChatPanel";

// Whether the popup is open and which chat it shows survive moving between
// pages (each page renders its own AppShell, so this component remounts).
const STORAGE_KEY = "warroom.floatingChat";

function readSaved(): { open: boolean; channel: ChatChannel } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    return { open: saved.open === true, channel: isChatChannel(saved.channel) ? saved.channel : "alliance" };
  } catch {
    return { open: false, channel: "alliance" };
  }
}

/**
 * The chat bubble fixed to the bottom-right corner of every page. Clicking it
 * opens a small popup with the same live chat as the Chat page.
 */
export default function FloatingChat({ viewer }: { viewer: { userId: string; role: Role } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<ChatChannel>("alliance");
  const [channels, setChannels] = useState<ChatChannel[] | null>(null);
  const [battlegroup, setBattlegroup] = useState<number | null>(null);

  useEffect(() => {
    const saved = readSaved();
    setOpen(saved.open);
    setChannel(saved.channel);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ open, channel }));
    } catch {
      // Storage blocked: the popup just won't stay open across pages.
    }
  }, [open, channel]);

  // Which chats this member can use; fetched the first time the popup opens.
  useEffect(() => {
    if (!open || channels) return;
    fetch("/api/chat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setChannels(data.channels);
        setBattlegroup(data.battlegroup ?? null);
      })
      .catch(() => undefined);
  }, [open, channels]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The Chat page already shows the full chat.
  if (pathname.startsWith("/chat")) return null;

  const shown = channels && !channels.includes(channel) ? "alliance" : channel;

  return (
    <div className="app-chrome">
      {open && (
        <div
          role="dialog"
          aria-label="Chat"
          className="fixed z-[45] inset-x-2 top-16 bottom-24 sm:inset-auto sm:right-5 sm:bottom-24 sm:w-[380px] sm:h-[min(560px,calc(100dvh-8rem))] flex flex-col rounded-xl border border-ink-line/80 bg-ink-panel shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] overflow-hidden fx-fade-in"
        >
          <div className="flex items-center gap-1 px-2 py-2 border-b border-ink-line/80 bg-ink-raised/60">
            <div className="flex flex-1 min-w-0 gap-1 overflow-x-auto">
              {(channels ?? ["alliance" as const]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  aria-pressed={c === shown}
                  className={`shrink-0 rounded-md px-2.5 py-1 font-display text-sm font-semibold uppercase tracking-wider transition-colors ${
                    c === shown
                      ? "bg-gradient-to-b from-brass-bright to-brass text-ink"
                      : "text-parchment-dim hover:text-parchment hover:bg-white/[0.05]"
                  }`}
                >
                  {CHAT_CHANNEL_LABELS[c]}
                  {c !== "alliance" && c === `bg${battlegroup}` ? " ★" : ""}
                </button>
              ))}
            </div>
            <Link
              href={`/chat?c=${shown}`}
              onClick={() => setOpen(false)}
              className="grid place-items-center h-8 w-8 shrink-0 rounded-md text-parchment-faint hover:text-parchment hover:bg-white/[0.06]"
              aria-label="Open full chat page"
              title="Open full chat page"
            >
              <Maximize2 size={15} />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid place-items-center h-8 w-8 shrink-0 rounded-md text-parchment-faint hover:text-parchment hover:bg-white/[0.06]"
              aria-label="Close chat"
            >
              <X size={17} />
            </button>
          </div>
          <ChatRoom key={shown} channel={shown} viewer={viewer} className="flex-1 min-h-0" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        className="fixed z-[45] bottom-5 right-5 grid place-items-center h-14 w-14 rounded-full text-ink bg-gradient-to-br from-brass-bright via-brass to-orange-500 shadow-[0_8px_24px_-6px_rgba(246,200,97,0.6)] hover:brightness-110 active:scale-95 transition-all"
      >
        {open ? <X size={24} /> : <MessagesSquare size={24} />}
      </button>
    </div>
  );
}
