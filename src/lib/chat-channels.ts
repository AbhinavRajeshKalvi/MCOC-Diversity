import { isOfficerRole } from "./roles";

// Chat rooms: one for the whole alliance and one per battlegroup. Safe to
// import from client code.

export type ChatChannel = "alliance" | "bg1" | "bg2" | "bg3";

export const CHAT_CHANNELS: ChatChannel[] = ["alliance", "bg1", "bg2", "bg3"];

export const CHAT_CHANNEL_LABELS: Record<ChatChannel, string> = {
  alliance: "Alliance",
  bg1: "BG 1",
  bg2: "BG 2",
  bg3: "BG 3"
};

/** Longest message, in characters. */
export const MAX_CHAT_MESSAGE_LENGTH = 1000;

export function isChatChannel(value: unknown): value is ChatChannel {
  return typeof value === "string" && (CHAT_CHANNELS as string[]).includes(value);
}

/**
 * Everyone in the alliance can use the alliance chat. A battlegroup chat is
 * for that battlegroup's members; officers can read and post in all three
 * because they plan every battlegroup.
 */
export function canUseChannel(
  member: { role: string | null | undefined; battlegroup: number | null | undefined },
  channel: ChatChannel
): boolean {
  if (channel === "alliance") return true;
  if (isOfficerRole(member.role)) return true;
  return channel === `bg${member.battlegroup}`;
}

export function channelsFor(member: { role: string | null | undefined; battlegroup: number | null | undefined }): ChatChannel[] {
  return CHAT_CHANNELS.filter((channel) => canUseChannel(member, channel));
}

/** A message as the web and mobile clients see it. */
export type ChatMessage = {
  id: string;
  channel: ChatChannel;
  userId: string;
  displayName: string;
  role: string;
  text: string;
  createdAt: string;
};
