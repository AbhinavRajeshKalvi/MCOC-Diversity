import Tesseract from "tesseract.js";
import { ocrWords } from "./ocr";
import type { RgbImage } from "./image";
import { toSharp, crop, clampBox } from "./image";
import rankTemplate from "./rank-template.json";

/** Anchor = top-left of the "Rank" word on a Battle Deck card, in original image pixels. */
export type Anchor = { x: number; y: number; score: number };
export type Layout = { kind: "battle-deck"; unit: number; anchors: Anchor[] } | { kind: "unknown"; reason: string };

const OCR_WIDTH = 3200;
const ROW_PITCH = 1.266; // row spacing / column spacing on every Battle Deck seen
const MIN_SCORE = 0.6;

const T = rankTemplate as { w: number; h: number; x: number; y: number; v: number[] };
const TMEAN = T.v.reduce((a, b) => a + b, 0) / T.v.length;
const TC = T.v.map((v) => v - TMEAN);
const TNORM = Math.sqrt(TC.reduce((a, b) => a + b * b, 0));

/**
 * Normalised cross-correlation of the "Rank" word template around (x, y) at
 * scale s (= unit / 128), searching ±r template pixels. Returns the best
 * refined anchor.
 */
export async function matchRank(img: RgbImage, x: number, y: number, s: number, r = 4): Promise<Anchor> {
  const W = T.w + 2 * r, H = T.h + 2 * r;
  const box = { x: x + (T.x - r) * s, y: y + (T.y - r) * s, w: W * s, h: H * s };
  const b = clampBox(img, box);
  if (b.w < W * s * 0.8 || b.h < H * s * 0.8) return { x, y, score: -1 };
  const d = await toSharp(crop(img, b)).resize(W, H, { fit: "fill" }).raw().toBuffer();
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = Math.max(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]);
  let best = { x, y, score: -1 };
  for (let oy = 0; oy <= 2 * r; oy++)
    for (let ox = 0; ox <= 2 * r; ox++) {
      let sum = 0;
      for (let j = 0; j < T.h; j++) for (let i = 0; i < T.w; i++) sum += lum[(j + oy) * W + i + ox];
      const mean = sum / (T.w * T.h);
      let num = 0, den = 0;
      for (let j = 0; j < T.h; j++)
        for (let i = 0; i < T.w; i++) {
          const v = lum[(j + oy) * W + i + ox] - mean;
          num += v * TC[j * T.w + i];
          den += v * v;
        }
      const score = den > 0 ? num / (Math.sqrt(den) * TNORM) : -1;
      // The template's top-left sits at (ox, oy) in the crop and corresponds to anchor + (T.x, T.y).
      if (score > best.score) best = { x: b.x + ox * (b.w / W) - T.x * s, y: b.y + oy * (b.h / H) - T.y * s, score };
    }
  return best;
}

async function bestScale(img: RgbImage, x: number, y: number, s0: number, lo: number, hi: number, steps: number): Promise<{ s: number; a: Anchor }> {
  let best = { s: s0, a: { x, y, score: -1 } as Anchor };
  for (let k = 0; k <= steps; k++) {
    const s = s0 * (lo + ((hi - lo) * k) / steps);
    const a = await matchRank(img, x, y, s, 8);
    if (a.score > best.a.score) best = { s, a };
  }
  return best;
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g[Math.floor(g.length / 2)]);
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export async function detectLayout(img: RgbImage): Promise<Layout> {
  const scale = OCR_WIDTH / img.width;
  const png = await toSharp(img).resize({ width: OCR_WIDTH }).grayscale().png().toBuffer();
  const words = await ocrWords(png, { tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
  // Tesseract's left/top edges are reliable; widths are not (it sometimes glues the next word on).
  const cands = words
    .filter((w) => /^ra/i.test(w.text) && /^r[a-z]{2}k/i.test(w.text.replace(/[^a-z]/gi, "")))
    .map((w) => ({ x: w.x0 / scale, y: w.y0 / scale, h: (w.y1 - w.y0) / scale }));
  if (!cands.length) return { kind: "unknown", reason: "No \"Rank N Sig. M\" text found. Is this a Battle Deck screenshot?" };

  // Rough unit from the text height (Rank word cap height ≈ 10/128 of the card pitch), refined below.
  // Glued boxes only ever make a box taller, so trust the shorter ones.
  const hs = cands.map((c) => c.h).sort((a, b) => a - b);
  const hEst = hs[Math.floor((hs.length - 1) * 0.25)];
  let unit = (hEst / 10) * 128;
  const ys = cluster(cands.map((c) => c.y), hEst * 2);
  const xs = cluster(cands.map((c) => c.x), hEst * 2);
  const gaps: number[] = [];
  for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
  for (let i = 1; i < ys.length; i++) gaps.push((ys[i] - ys[i - 1]) / ROW_PITCH);
  if (gaps.length) {
    // the smallest consistent gap is one card pitch; others are multiples
    const unitH = unit;
    const multiples = gaps.map((g) => g / Math.max(1, Math.round(g / unitH)));
    unit = median(multiples);
  }

  // Refine the scale on the clearest candidate with template matching.
  let sc = { s: unit / 128, a: { x: 0, y: 0, score: -1 } as Anchor };
  for (const c of cands.slice(0, 4)) {
    const r = await bestScale(img, c.x, c.y, unit / 128, gaps.length ? 0.92 : 0.6, gaps.length ? 1.08 : 1.6, gaps.length ? 8 : 25);
    if (r.a.score > sc.a.score) sc = r;
    if (sc.a.score > 0.8) break;
  }
  if (sc.a.score < MIN_SCORE) return { kind: "unknown", reason: "Found text that looks like \"Rank\" but no Battle Deck cards." };
  if (!gaps.length) {
    unit = sc.s * 128;
    // Only one card's text was read: measure the pitch from a neighbouring card instead,
    // because the template's scale estimate is only good to ~5%.
    let bestN: { score: number; unit: number } = { score: MIN_SCORE, unit };
    for (let f = 0.88; f <= 1.13; f += 0.02) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, ROW_PITCH], [0, -ROW_PITCH]]) {
        const a = await matchRank(img, sc.a.x + dx * unit * f, sc.a.y + dy * unit * f, sc.s, 4);
        if (a.score > bestN.score) {
          const d = dx ? Math.abs(a.x - sc.a.x) : Math.abs(a.y - sc.a.y) / ROW_PITCH;
          bestN = { score: a.score, unit: d };
        }
      }
    }
    unit = bestN.unit;
  }
  const s = unit / 128;

  const anchors: Anchor[] = [];
  const has = (x: number, y: number) => anchors.some((a) => Math.abs(a.x - x) < unit * 0.3 && Math.abs(a.y - y) < unit * 0.3);
  const tryAt = async (x: number, y: number) => {
    if (x < -unit * 0.05 || y < unit * 0.8 || x + unit * 0.85 > img.width || y + unit * 0.3 > img.height || has(x, y)) return false;
    const a = await matchRank(img, x, y, s, 4);
    if (a.score < MIN_SCORE || has(a.x, a.y)) return false;
    anchors.push(a);
    return true;
  };
  anchors.push(sc.a);
  for (const c of cands) await tryAt(c.x, c.y);
  if (!anchors.length) return { kind: "unknown", reason: "Couldn't line up the Battle Deck cards." };

  // Walk the grid: from every found card, look one pitch left/right/up/down.
  const rowStep = unit * ROW_PITCH;
  for (let i = 0; i < anchors.length && anchors.length < 200; i++) {
    const a = anchors[i];
    await tryAt(a.x + unit, a.y);
    await tryAt(a.x - unit, a.y);
    await tryAt(a.x, a.y + rowStep);
    await tryAt(a.x, a.y - rowStep);
  }
  anchors.sort((a, b) => (Math.abs(a.y - b.y) < unit * 0.3 ? a.x - b.x : a.y - b.y));
  return { kind: "battle-deck", unit, anchors };
}
