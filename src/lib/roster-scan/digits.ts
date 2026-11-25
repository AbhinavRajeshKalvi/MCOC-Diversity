import { DIGIT_TEMPLATES } from "./digit-templates";
import { PATCH_W, PATCH_H } from "./glyphs";

const N = PATCH_W * PATCH_H;
const TEMPLATES: { l: string; v: Float32Array }[] = DIGIT_TEMPLATES.trim()
  .split("\n")
  .map((line) => {
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = parseInt(line[i + 1], 16) / 15;
    return { l: line[0], v };
  });

/** k-NN over labelled glyph patches from real Battle Deck screenshots. */
export function classifyDigit(v: Float32Array): { digit: string; confidence: number } {
  const dists: { l: string; d: number }[] = [];
  for (const t of TEMPLATES) {
    let d = 0;
    for (let i = 0; i < N; i++) { const e = v[i] - t.v[i]; d += e * e; }
    dists.push({ l: t.l, d });
  }
  dists.sort((a, b) => a.d - b.d);
  const best = dists[0];
  const rival = dists.find((x) => x.l !== best.l);
  // margin between the nearest template and the nearest template of another digit
  const confidence = rival ? Math.max(0, Math.min(1, (rival.d - best.d) / (rival.d + 1e-6) * 2)) : 1;
  return { digit: best.l, confidence };
}

export function readDigits(patches: Float32Array[]): { value: number | null; text: string; confidence: number } {
  if (!patches.length) return { value: null, text: "", confidence: 0 };
  let text = "", conf = 1;
  for (const p of patches) { const r = classifyDigit(p); text += r.digit; conf = Math.min(conf, r.confidence); }
  return { value: Number(text), text, confidence: conf };
}
