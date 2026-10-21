export type Role = "admin" | "leader" | "officer" | "member";
export type WarMode = "regular" | "bigThings";

export type User = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  battlegroup: 1 | 2 | 3 | null;
  allianceId: string | null;
  gameDataEditor: boolean;
  mustChangePassword: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
};

export type Alliance = {
  id: string;
  name: string;
  /** Only officers and above get the join code. */
  code: string | null;
  warMode: WarMode;
  memberCount: number;
};

export type Member = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  battlegroup: 1 | 2 | 3 | null;
  mustChangePassword: boolean;
};

/** What sign-in, sign-up, password reset and Google sign-in return. */
export type LoginResult = { token: string; user: User; alliance: Alliance | null; mustChangePassword: boolean };

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  leader: "Leader",
  officer: "Officer",
  member: "Member"
};

export function isOfficerRole(role: Role | undefined | null): boolean {
  return role === "officer" || role === "leader" || role === "admin";
}

export function isLeaderOrAbove(role: Role | undefined | null): boolean {
  return role === "leader" || role === "admin";
}
