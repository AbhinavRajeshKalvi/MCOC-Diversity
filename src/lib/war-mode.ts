// The alliance's war mode. Safe to import from client code.
//
// Regular wars have every member place 5 defenders on the 50-node map. In Big
// Things wars every member places 1 defender on a 10-node map. Each mode keeps
// its own defender and attack plans, so switching back restores the other one.

export type WarMode = "regular" | "bigThings";

export const WAR_MODES: WarMode[] = ["regular", "bigThings"];

export const WAR_MODE_LABELS: Record<WarMode, string> = {
  regular: "Regular",
  bigThings: "Big Things"
};

export function isWarMode(value: unknown): value is WarMode {
  return value === "regular" || value === "bigThings";
}

/** How many defenders each member places in this mode. */
export function defendersPerMember(mode: WarMode): number {
  return mode === "bigThings" ? 1 : 5;
}
