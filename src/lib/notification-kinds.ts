// The things a member can be notified about. Safe to import from client code.

export type NotificationKind = "chat" | "booking" | "takeover" | "roster" | "members";

export const NOTIFICATION_KINDS: { kind: NotificationKind; label: string; description: string }[] = [
  { kind: "chat", label: "Chat messages", description: "A new message in any chat you're part of." },
  { kind: "booking", label: "Node bookings", description: "Someone in your battlegroup books an attack node." },
  {
    kind: "takeover",
    label: "Node requests",
    description: "Someone asks for a node you booked, or answers your request for theirs."
  },
  { kind: "roster", label: "Roster updates", description: "Someone in the alliance updates their roster." },
  {
    kind: "members",
    label: "Member changes",
    description: "Someone joins the alliance, leaves it, or is removed by an officer."
  }
];

export type NotificationPrefs = Record<NotificationKind, boolean>;

/** Everything starts off until the member turns it on. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  chat: false,
  booking: false,
  takeover: false,
  roster: false,
  members: false
};

export function readNotificationPrefs(value: unknown): NotificationPrefs {
  const stored = (value ?? {}) as Partial<Record<NotificationKind, unknown>>;
  return {
    chat: stored.chat === true,
    booking: stored.booking === true,
    takeover: stored.takeover === true,
    roster: stored.roster === true,
    members: stored.members === true
  };
}
