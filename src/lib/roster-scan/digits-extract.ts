import type { RgbImage } from "./image";
import { crop, clampBox } from "./image";
import { inkLine, digitBoxes, patch } from "./glyphs";

// Offsets relative to the "Rank" word's top-left, at unit 128 (see card.ts).
export const RANK_LINE = { x: -4, y: -3, w: 114, h: 16 };
export const PI_LINE = { x: 14, y: 11, w: 70, h: 22 };
const SIG_PITCH = 8.6, PI_PITCH = 12;

export type DigitPatches = { rank: Float32Array[]; sig: Float32Array[]; pi: Float32Array[] };

export function extractDigitPatches(img: RgbImage, ax: number, ay: number, unit: number): DigitPatches {
  const s = unit / 128;
  const rl = crop(img, clampBox(img, { x: ax + RANK_LINE.x * s, y: ay + RANK_LINE.y * s, w: RANK_LINE.w * s, h: RANK_LINE.h * s }));
  const rInk = inkLine(rl);
  const rankB = digitBoxes(rInk, 35 * s, 48 * s, SIG_PITCH * s);
  const sigB = digitBoxes(rInk, 72 * s, 109 * s, SIG_PITCH * s);
  const pl = crop(img, clampBox(img, { x: ax + PI_LINE.x * s, y: ay + PI_LINE.y * s, w: PI_LINE.w * s, h: PI_LINE.h * s }));
  const pInk = inkLine(pl);
  const piB = digitBoxes(pInk, 4 * s, 70 * s, PI_PITCH * s);
  return {
    rank: rankB.slice(0, 1).map((b) => patch(rInk, b, SIG_PITCH * s)),
    sig: sigB.map((b) => patch(rInk, b, SIG_PITCH * s)),
    pi: piB.map((b) => patch(pInk, b, PI_PITCH * s))
  };
}
