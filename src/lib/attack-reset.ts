// When the regular map's bookable nodes (37-50) clear. Safe to import from client code.
//
// A war lasts two days, so bookings clear every 48 hours at 3:00 AM IST
// (21:30 UTC the evening before). The first clear is on 23 November 2026.
// Nothing runs on a timer: bookings made before the latest clear are treated
// as gone and deleted the next time the map is read or changed, so a server
// that was asleep at 3 AM still gets it right.

/** 23 Nov 2026, 03:00 IST. */
export const ATTACK_RESET_ANCHOR_MS = Date.UTC(2026, 10, 22, 21, 30);
export const ATTACK_RESET_INTERVAL_MS = 48 * 60 * 60 * 1000;

/** The most recent clear, or null before the first one. */
export function lastAttackReset(now: number = Date.now()): Date | null {
  if (now < ATTACK_RESET_ANCHOR_MS) return null;
  const cycles = Math.floor((now - ATTACK_RESET_ANCHOR_MS) / ATTACK_RESET_INTERVAL_MS);
  return new Date(ATTACK_RESET_ANCHOR_MS + cycles * ATTACK_RESET_INTERVAL_MS);
}

/** The next clear. */
export function nextAttackReset(now: number = Date.now()): Date {
  const last = lastAttackReset(now);
  return new Date(last ? last.getTime() + ATTACK_RESET_INTERVAL_MS : ATTACK_RESET_ANCHOR_MS);
}

/** e.g. "Mon, 23 Nov, 3:00 AM IST". */
export function formatIst(date: Date): string {
  const text = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
  return `${text.replace(/\bam\b/i, "AM").replace(/\bpm\b/i, "PM")} IST`;
}
