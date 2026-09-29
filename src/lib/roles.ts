// Role ladder, highest first: admin > leader > officer > member.
// There is at most one Admin and one Leader. Safe to import from client code.

export type Role = "admin" | "leader" | "officer" | "member";

/** Officers, the Leader and the Admin: every officer permission. */
export function isOfficerRole(role: string | null | undefined): boolean {
  return role === "officer" || role === "leader" || role === "admin";
}

/** The Leader and the Admin: leader-only permissions (removing officers, etc.). */
export function isLeaderOrAbove(role: string | null | undefined): boolean {
  return role === "leader" || role === "admin";
}
