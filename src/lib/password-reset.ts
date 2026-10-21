import { createHash } from "crypto";

export const RESET_CODE_MINUTES = 15;

export function hashResetCode(code: string): string {
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${code}`).digest("hex");
}
