import bcrypt from "bcryptjs";
import type { TokenPayload } from "./token";

export type { Role } from "./roles";
export { isOfficerRole, isLeaderOrAbove } from "./roles";
export * from "./token";

export type SessionPayload = TokenPayload & {
  /** The alliance the member belongs to, or null before they create or join one. */
  allianceId: string | null;
  /** May edit the shared champion list and counter notes, which every alliance sees. */
  gameDataEditor: boolean;
};

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(plain, hash);
}

