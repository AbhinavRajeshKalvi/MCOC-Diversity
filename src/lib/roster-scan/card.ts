import type { RgbImage, Box } from "./image";
import { crop, rgbToHsv, clampBox, toSharp } from "./image";
import { extractDigitPatches } from "./digits-extract";
import { readDigits } from "./digits";

/**
 * Geometry of a Battle Deck card, relative to the top-left corner of the
 * "Rank" word, in pixels of a screenshot where cards are 128 px apart.
 * Multiply by (unit / 128) for other resolutions.
 */
export const CARD_GEOMETRY = {
  card: { x: -9, y: -114, w: 122, h: 147 },
  portrait: { x: -6, y: -96, w: 114, h: 78 },
  stars: { x: -4, y: -18, w: 112, h: 15 },
  rankLine: { x: -4, y: -3, w: 114, h: 16 },
  badge: { x: 80, y: 9, w: 32, h: 26 }
};
const G = CARD_GEOMETRY;

export type CardRead = {
  box: Box;
  portraitBox: Box;
  rank: number | null;
  sig: number | null;
  pi: number | null;
  stars: number | null;
  awakened: boolean | null;
  ascended: number; // 0 = no, 1-2 = level (3 is reported as 2; see README)
  textConfidence: number; // 0..1
};

export function rel(ax: number, ay: number, s: number, r: { x: number; y: number; w: number; h: number }): Box {
  return { x: ax + r.x * s, y: ay + r.y * s, w: r.w * s, h: r.h * s };
}

function starStats(img: RgbImage, box: Box) {
  const c = crop(img, box);
  let gold = 0, silver = 0;
  const col = new Array(c.width).fill(0);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 3;
      const [h, s, v] = rgbToHsv(c.data[i], c.data[i + 1], c.data[i + 2]);
      if (v < 0.55) continue;
      if (s > 0.45 && h >= 18 && h <= 55) { gold++; col[x]++; }
      else if (s < 0.3) { silver++; col[x]++; }
    }
  const thr = Math.max(2, c.height * 0.2);
  let first = -1, last = -1;
  col.forEach((v, x) => { if (v >= thr) { if (first < 0) first = x; last = x; } });
  return { gold, silver, span: first >= 0 ? last - first + 1 : 0, area: c.width * c.height };
}

/**
 * Ascension badge (laurel to the right of the PI). Returns 0 when absent,
 * otherwise 1 or 2 judged from how much white the number in the middle has.
 */
async function ascension(img: RgbImage, box: Box, s: number): Promise<{ level: number; score: number }> {
  const c0 = crop(img, box);
  let warm = 0;
  for (let i = 0; i < c0.width * c0.height; i++) {
    const [h, sat, v] = rgbToHsv(c0.data[i * 3], c0.data[i * 3 + 1], c0.data[i * 3 + 2]);
    if (v > 0.3 && sat > 0.35 && (h <= 50 || h >= 340)) warm++;
  }
  const score = warm / (c0.width * c0.height);
  if (score < 0.05) return { level: 0, score };
  const k = 8 / s; // normalise to 8x upsampling at unit 128
  const W = Math.round(c0.width * k), H = Math.round(c0.height * k);
  const data = await toSharp(c0).resize(W, H, { kernel: "cubic" }).raw().toBuffer();
  let sx = 0, sy = 0, n = 0;
  const white = new Uint8Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const p = (j * W + i) * 3;
      const [h, sat, v] = rgbToHsv(data[p], data[p + 1], data[p + 2]);
      if ((h < 22 || h > 340) && sat > 0.55 && v > 0.12 && v < 0.55 && Math.abs(i - W / 2) < W * 0.25 && Math.abs(j - H / 2) < H * 0.3) { sx += i; sy += j; n++; }
      if (v > 0.62 && sat < 0.45) white[j * W + i] = 1;
    }
  if (!n) return { level: 1, score };
  const cx = Math.round(sx / n), cy = Math.round(sy / n);
  let wc = 0;
  for (let j = cy - 28; j <= cy + 28; j++) for (let i = cx - 28; i <= cx + 28; i++) if (j >= 0 && j < H && i >= 0 && i < W && white[j * W + i]) wc++;
  // Measured: level 1 = 340-435 white px, level 2 = 740-840.
  return { level: wc > 580 ? 2 : 1, score };
}

export async function readCard(img: RgbImage, ax: number, ay: number, unit: number): Promise<CardRead | null> {
  const s = unit / 128;
  const p = extractDigitPatches(img, ax, ay, unit);
  const rank = readDigits(p.rank);
  if (rank.value === null) return null;
  const sig = readDigits(p.sig);
  const pi = readDigits(p.pi);

  const st = starStats(img, clampBox(img, rel(ax, ay, s, G.stars)));
  const gold = st.gold > st.silver * 1.5 && st.gold > st.area * 0.08;
  const silver = !gold && st.silver > st.area * 0.08;
  const stars = st.span ? Math.max(1, Math.min(7, Math.round(st.span / (15.0 * s)))) : null;
  const asc = await ascension(img, clampBox(img, rel(ax, ay, s, G.badge)), s);

  let textConfidence = Math.min(rank.confidence, sig.confidence || 0, pi.confidence || 0);
  // Cross-checks: gold stars mean sig 0, silver means sig >= 1.
  if (sig.value !== null && ((gold && sig.value !== 0) || (silver && sig.value === 0))) textConfidence *= 0.5;
  if (rank.value < 1 || rank.value > 6 || (sig.value ?? 0) > 200 || pi.value === null || pi.value < 100) textConfidence *= 0.3;

  return {
    box: clampBox(img, rel(ax, ay, s, G.card)),
    portraitBox: clampBox(img, rel(ax, ay, s, G.portrait)),
    rank: rank.value,
    sig: sig.value,
    pi: pi.value,
    stars,
    awakened: gold ? false : silver ? true : null,
    ascended: asc.level,
    textConfidence
  };
}
