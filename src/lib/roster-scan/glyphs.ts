import type { RgbImage } from "./image";

/** Ink mask of a text line, upsampled ×S. Text in MCOC cards is light on a dark panel. */
export type InkLine = { W: number; H: number; S: number; ink: Uint8Array };
export type Comp = { x0: number; x1: number; y0: number; y1: number; n: number }; // mask coords, inclusive

const S = 4;
export const PATCH_W = 8;
export const PATCH_H = 12;

export function inkLine(img: RgbImage): InkLine {
  const W = img.width * S, H = img.height * S;
  const lum = new Float32Array(img.width * img.height);
  for (let i = 0; i < lum.length; i++) lum[i] = Math.max(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]);
  const up = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) / S - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), dy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) / S - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), dx = fx - x0;
      up[y * W + x] =
        lum[y0 * img.width + x0] * (1 - dx) * (1 - dy) + lum[y0 * img.width + x1] * dx * (1 - dy) +
        lum[y1 * img.width + x0] * (1 - dx) * dy + lum[y1 * img.width + x1] * dx * dy;
    }
  }
  const sorted = Float32Array.from(up).sort();
  const lo = sorted[Math.floor(sorted.length * 0.2)], hi = sorted[Math.floor(sorted.length * 0.97)];
  const thr = lo + (hi - lo) * 0.5;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < ink.length; i++) ink[i] = up[i] > thr ? 1 : 0;
  return { W, H, S, ink };
}

export function components(line: InkLine): Comp[] {
  const { W, H, ink } = line;
  const label = new Int32Array(W * H).fill(-1);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i] || label[i] >= 0) continue;
    const c = { x0: W, x1: -1, y0: H, y1: -1, n: 0 };
    label[i] = comps.length;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W, y = (p / W) | 0;
      c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && ink[p - 1] && label[p - 1] < 0) { label[p - 1] = comps.length; stack.push(p - 1); }
      if (x < W - 1 && ink[p + 1] && label[p + 1] < 0) { label[p + 1] = comps.length; stack.push(p + 1); }
      if (y > 0 && ink[p - W] && label[p - W] < 0) { label[p - W] = comps.length; stack.push(p - W); }
      if (y < H - 1 && ink[p + W] && label[p + W] < 0) { label[p + W] = comps.length; stack.push(p + W); }
    }
    comps.push(c);
  }
  return comps.filter((c) => c.n >= 6 * S);
}

/**
 * Digit boxes inside [fromX, toX) (original-pixel offsets within the crop),
 * using a known digit pitch (original px) to split touching digits like "00".
 */
export function digitBoxes(line: InkLine, fromX: number, toX: number, pitch: number): Comp[] {
  const s = line.S;
  let comps = components(line).filter((c) => c.x0 >= fromX * s - s && c.x1 <= toX * s + s);
  if (!comps.length) return [];
  const maxH = Math.max(...comps.map((c) => c.y1 - c.y0 + 1));
  comps = comps.filter((c) => c.y1 - c.y0 + 1 >= maxH * 0.7 && c.x1 - c.x0 + 1 >= pitch * s * 0.2);
  comps.sort((a, b) => a.x0 - b.x0);
  // merge pieces overlapping in x (broken glyphs)
  const merged: Comp[] = [];
  for (const c of comps) {
    const m = merged[merged.length - 1];
    if (m && c.x0 <= m.x1 - s) { m.x1 = Math.max(m.x1, c.x1); m.y0 = Math.min(m.y0, c.y0); m.y1 = Math.max(m.y1, c.y1); m.n += c.n; }
    else merged.push({ ...c });
  }
  const top = Math.min(...merged.map((c) => c.y0)), bottom = Math.max(...merged.map((c) => c.y1));
  const out: Comp[] = [];
  for (const c of merged) {
    const w = c.x1 - c.x0 + 1;
    const k = Math.max(1, Math.round(w / (pitch * s * 0.97)));
    for (let j = 0; j < k; j++) {
      out.push({ x0: Math.round(c.x0 + (w * j) / k), x1: Math.round(c.x0 + (w * (j + 1)) / k) - 1, y0: top, y1: bottom, n: 0 });
    }
  }
  return out;
}

/** Fixed-size patch from a digit box; narrow glyphs ("1") are centred in a pitch-wide window. */
export function patch(line: InkLine, b: Comp, pitch: number): Float32Array {
  const s = line.S;
  const minW = pitch * s * 0.85;
  let x0 = b.x0, x1 = b.x1;
  if (x1 - x0 + 1 < minW) { const cx = (x0 + x1) / 2; x0 = cx - minW / 2; x1 = cx + minW / 2; }
  const v = new Float32Array(PATCH_W * PATCH_H);
  const bw = x1 - x0 + 1, bh = b.y1 - b.y0 + 1;
  for (let gy = 0; gy < PATCH_H; gy++)
    for (let gx = 0; gx < PATCH_W; gx++) {
      let on = 0, tot = 0;
      const sx0 = Math.floor(x0 + (gx * bw) / PATCH_W), sx1 = Math.ceil(x0 + ((gx + 1) * bw) / PATCH_W);
      const sy0 = Math.floor(b.y0 + (gy * bh) / PATCH_H), sy1 = Math.ceil(b.y0 + ((gy + 1) * bh) / PATCH_H);
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          tot++;
          if (x >= 0 && x < line.W && y >= 0 && y < line.H && line.ink[y * line.W + x]) on++;
        }
      v[gy * PATCH_W + gx] = tot ? on / tot : 0;
    }
  return v;
}
