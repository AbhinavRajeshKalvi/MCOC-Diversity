// Ascension is stored as a level: 0 = not ascended, 1-3 = ascension level.
// Older roster entries stored a yes/no boolean; those read as level 1 / 0.

export function normalizeAscension(value: unknown): number | null {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) return value;
  return null;
}

export function ascensionLabel(level: number | null | undefined): string {
  if (level == null) return "Ascension unknown";
  return level === 0 ? "Not ascended" : `Ascended ${level}`;
}
