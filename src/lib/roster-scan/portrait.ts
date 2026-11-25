import sharp from "sharp";
import type { RgbImage } from "./image";

/**
 * Champion identification by portrait.
 *
 * A Battle Deck card shows a crop of the same art the app stores as the
 * champion's portrait (imageUrl), so we compare small, normalised colour
 * thumbnails. Icons the game draws on top of the card (synergy champion,
 * class/ability badges, the "i" and boost badges) are masked out.
 *
 * Feature: FW x FH grid, 3 channels (opponent colour space), each channel
 * z-normalised over the unmasked cells, then L2-normalised. Similarity is the
 * dot product (cosine), in [-1, 1].
 */
export const FW = 24;
export const FH = 16;
export const FEATURE_LEN = FW * FH * 3;
/** Card portrait box is 114 x 78 at unit 128 (see card.ts). */
export const PORTRAIT_ASPECT = 114 / 78;

/** 1 = use the cell, 0 = covered by game UI on the card. */
export const MASK: Uint8Array = (() => {
  const m = new Uint8Array(FW * FH);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const u = (x + 0.5) / FW, v = (y + 0.5) / FH;
      let on = 1;
      if (v < 0.24) on = 0; // synergy icon + class/ability badges across the top
      if (u < 0.22 && v < 0.45) on = 0; // "i" info badge
      if (u < 0.17 && v > 0.5) on = 0; // small boost badge bottom-left
      m[y * FW + x] = on;
    }
  return m;
})();

function featureFromGrid(rgb: Buffer): Float32Array {
  const f = new Float32Array(FEATURE_LEN);
  const n = FW * FH;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    // opponent colours: intensity, red-green, yellow-blue
    f[i] = (r + g + b) / 3;
    f[n + i] = (r - g) * 0.7;
    f[2 * n + i] = ((r + g) / 2 - b) * 0.7;
  }
  // z-normalise each channel over the unmasked cells
  for (let c = 0; c < 3; c++) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (MASK[i]) { sum += f[c * n + i]; cnt++; }
    const mean = sum / cnt;
    let sq = 0;
    for (let i = 0; i < n; i++) if (MASK[i]) { const d = f[c * n + i] - mean; sq += d * d; }
    // intensity keeps its own contrast; chroma channels are scaled by the intensity spread so grey art stays grey
    const sd = Math.sqrt(sq / cnt) || 1;
    for (let i = 0; i < n; i++) f[c * n + i] = MASK[i] ? (f[c * n + i] - mean) / (c === 0 ? sd : Math.max(sd, 20)) : 0;
  }
  let norm = 0;
  for (let i = 0; i < FEATURE_LEN; i++) norm += f[i] * f[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < FEATURE_LEN; i++) f[i] /= norm;
  return f;
}

/** Area-average a window of a raw RGB image into the FW x FH grid (pixels outside read as black). */
export function gridFromRaw(data: Uint8Array | Buffer, W: number, H: number, x0: number, y0: number, w: number, h: number): Buffer {
  const out = Buffer.alloc(FW * FH * 3);
  for (let gy = 0; gy < FH; gy++)
    for (let gx = 0; gx < FW; gx++) {
      const sx0 = x0 + (gx * w) / FW, sx1 = x0 + ((gx + 1) * w) / FW;
      const sy0 = y0 + (gy * h) / FH, sy1 = y0 + ((gy + 1) * h) / FH;
      let r = 0, g = 0, b = 0, a = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx <= 0) continue;
          const wt = wx * wy;
          a += wt;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = (y * W + x) * 3;
          r += data[p] * wt; g += data[p + 1] * wt; b += data[p + 2] * wt;
        }
      }
      const o = (gy * FW + gx) * 3;
      out[o] = a ? Math.round(r / a) : 0; out[o + 1] = a ? Math.round(g / a) : 0; out[o + 2] = a ? Math.round(b / a) : 0;
    }
  return out;
}

/** Feature of a portrait crop taken from a Battle Deck card. */
export function cardPortraitFeature(crop: RgbImage): Float32Array {
  return featureFromGrid(gridFromRaw(crop.data, crop.width, crop.height, 0, 0, crop.width, crop.height));
}

/**
 * Window in a reference portrait (relative to its width/height) that lines
 * up with the card crop. Calibrated on labelled screenshots against the
 * mcocscout portraits the app uses as champion imageUrl.
 */
export type RefWindow = { cx: number; cy: number; w: number };
// Calibrated on 35 labelled cards from real screenshots: 34/35 correct (the miss
// is a Doctor Strange card whose in-game art differs from the reference art).
export let REF_WINDOWS: RefWindow[] = [{ cx: 0.49, cy: 0.44, w: 1.06 }];
export function setRefWindows(w: RefWindow[]) { REF_WINDOWS = w; }

export async function decodeReference(image: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(image).flatten({ background: "#000000" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export function referenceFeaturesFromRaw(img: RgbImage, windows: RefWindow[] = REF_WINDOWS): Float32Array[] {
  return windows.map((win) => {
    const w = win.w * img.width, h = w / PORTRAIT_ASPECT;
    return featureFromGrid(gridFromRaw(img.data, img.width, img.height, win.cx * img.width - w / 2, win.cy * img.height - h / 2, w, h));
  });
}

/** Features for a reference portrait (any image format sharp reads), one per calibrated window. */
export async function referenceFeatures(image: Buffer, windows: RefWindow[] = REF_WINDOWS): Promise<Float32Array[]> {
  return referenceFeaturesFromRaw(await decodeReference(image), windows);
}

export function similarity(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** A champion's reference features: official portrait windows, or crops users confirmed. */
export type Reference = { championId: string; source: "portrait" | "confirmed"; features: Float32Array[] };

/** Best `k` champions for a card feature; each champion scores its best reference feature. */
export function rankCandidates(f: Float32Array, refs: Reference[], k = 5): { championId: string; score: number }[] {
  const best = new Map<string, number>();
  for (const r of refs)
    for (const rf of r.features) {
      const s = similarity(f, rf);
      if (s > (best.get(r.championId) ?? -Infinity)) best.set(r.championId, s);
    }
  return [...best].map(([championId, score]) => ({ championId, score })).sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * 0..1 confidence in the top candidate, from its score and its lead over the
 * runner-up. On the calibration set, correct matches scored 0.35-0.92 with a
 * lead of ~0.25 on average; weak or close calls fall below 0.5.
 */
export function matchConfidence(cands: { score: number }[]): number {
  if (!cands.length) return 0;
  const top = cands[0].score, lead = top - (cands[1]?.score ?? 0);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return clamp((top - 0.3) / 0.4) * clamp(lead / 0.2);
}

export function featureToBase64(f: Float32Array): string {
  const q = new Int8Array(f.length);
  for (let i = 0; i < f.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(f[i] * 127 * 8)));
  return Buffer.from(q.buffer).toString("base64");
}

export function featureFromBase64(s: string): Float32Array {
  const buf = Buffer.from(s, "base64");
  const q = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
  const f = new Float32Array(q.length);
  let norm = 0;
  for (let i = 0; i < q.length; i++) { f[i] = q[i] / (127 * 8); norm += f[i] * f[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}
