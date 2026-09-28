// We don't have rights to redistribute official MCOC champion artwork, so
// champions without an admin-supplied imageUrl get a generated "poster" look
// instead: a deterministic gradient plus initials, so the grid still reads
// like a wall of distinct cards rather than a bland list.

const PALETTES: [string, string][] = [
  ["#7C3AED", "#312E81"], // violet -> indigo
  ["#DB2777", "#7C2D12"], // pink -> rust
  ["#0891B2", "#164E63"], // cyan -> deep teal
  ["#C89B3C", "#7C2D12"], // brass -> rust
  ["#DC2626", "#450A0A"], // red -> near-black
  ["#059669", "#064E3B"], // emerald -> deep green
  ["#4F46E5", "#1E1B4B"], // indigo -> ink
  ["#EA580C", "#7C2D12"], // orange -> rust
  ["#0D9488", "#134E4A"], // teal -> deep teal
  ["#B91C1C", "#292524"], // crimson -> stone
  ["#7E22CE", "#1E1B4B"], // purple -> ink
  ["#CA8A04", "#422006"] // gold -> deep brown
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getChampionArt(name: string): { from: string; to: string; initials: string } {
  const hash = hashString(name);
  const [from, to] = PALETTES[hash % PALETTES.length];
  const words = name.replace(/[()]/g, "").split(/\s+/).filter(Boolean);
  const initials =
    words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return { from, to, initials };
}
