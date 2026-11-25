import { loadRgb, crop, toSharp } from "./image";
import { detectLayout } from "./layout";
import { readCard } from "./card";
import { cardPortraitFeature } from "./portrait";

export type ScannedCard = {
  /** Position in the screenshot, reading order (row by row). */
  index: number;
  rank: number | null;
  sig: number | null;
  pi: number | null;
  stars: number | null;
  awakened: boolean | null;
  ascended: number;
  /** 0..1, how sure we are about rank/sig/PI. */
  textConfidence: number;
  feature: Float32Array;
  /** Small JPEG of the whole card for the review table. */
  thumbnail: string;
};

export type ScanResult =
  | { ok: true; width: number; height: number; cards: ScannedCard[]; ms: number }
  | { ok: false; error: string };

/**
 * Reads every champion card on one MCOC "Battle Deck" screenshot. Free and
 * local: Tesseract finds the cards, everything else is pixel maths.
 */
export async function scanScreenshot(input: Buffer): Promise<ScanResult> {
  const t0 = Date.now();
  let img;
  try {
    img = await loadRgb(input);
  } catch {
    return { ok: false, error: "This file isn't an image we can read." };
  }
  const layout = await detectLayout(img);
  if (layout.kind !== "battle-deck") return { ok: false, error: layout.reason };
  const cards: ScannedCard[] = [];
  for (const a of layout.anchors) {
    const c = await readCard(img, a.x, a.y, layout.unit);
    if (!c) continue;
    // Hard plausibility guard: something that merely looks like a "Rank" word
    // (e.g. a screenshot of a web page) reads as nonsense numbers.
    if (c.rank === null || c.rank < 1 || c.rank > 6) continue;
    if (c.sig !== null && c.sig > 200) continue;
    if (c.pi === null || c.pi < 100 || c.pi > 99999) continue;
    if (c.stars === null) continue;
    const thumb = await toSharp(crop(img, c.box)).resize({ height: 120 }).jpeg({ quality: 70 }).toBuffer();
    cards.push({
      index: cards.length,
      rank: c.rank,
      sig: c.sig,
      pi: c.pi,
      stars: c.stars,
      awakened: c.awakened,
      ascended: c.ascended,
      textConfidence: c.textConfidence,
      feature: cardPortraitFeature(crop(img, c.portraitBox)),
      thumbnail: "data:image/jpeg;base64," + thumb.toString("base64")
    });
  }
  if (!cards.length) return { ok: false, error: "No champion cards found. Use a Battle Deck screenshot from the game." };
  return { ok: true, width: img.width, height: img.height, cards, ms: Date.now() - t0 };
}

export { terminateOcr } from "./ocr";
