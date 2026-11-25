/**
 * Measures how well the screenshot scanner reads Battle Deck cards.
 *
 *   npx tsx scripts/roster-scan-eval.mts <fixtures-dir>
 *
 * The dir holds screenshots plus truth.json:
 *   { "<file>": [[championName | null, rank, sig, pi, "silver" | "gold", ascensionLevel], ...] }
 * with one row per card in reading order. Champion names aren't checked here
 * (portrait matching needs the reference art; see roster-scan-calibrate.mts).
 */
import fs from "node:fs";
import path from "node:path";
import { scanScreenshot, terminateOcr } from "../src/lib/roster-scan/index";

const dir = process.argv[2] ?? "fixtures";
const truth: Record<string, [string | null, number, number, number, string, number][]> = JSON.parse(
  fs.readFileSync(path.join(dir, "truth.json"), "utf8")
);
const tally: Record<string, [number, number]> = {};
const t = (k: string, ok: boolean) => {
  tally[k] ??= [0, 0];
  tally[k][1]++;
  if (ok) tally[k][0]++;
};

for (const [file, rows] of Object.entries(truth)) {
  const r = await scanScreenshot(fs.readFileSync(path.join(dir, file)));
  if (!r.ok) {
    console.log(file, "FAILED:", r.error);
    rows.forEach(() => t("card found", false));
    continue;
  }
  console.log(`${file}: ${r.cards.length}/${rows.length} cards in ${r.ms} ms`);
  rows.forEach((want, i) => {
    const c = r.cards[i];
    t("card found", !!c);
    if (!c) return;
    const [, rank, sig, pi, colour, asc] = want;
    t("rank", c.rank === rank);
    t("sig", c.sig === sig);
    t("pi", c.pi === pi);
    t("stars", c.stars === 7);
    t("awakened", c.awakened === (colour === "silver"));
    t("ascension level", c.ascended === asc);
    if (c.rank !== rank || c.sig !== sig || c.pi !== pi || c.ascended !== asc) {
      console.log(`  MISS card ${i}: read ${c.rank}/${c.sig}/${c.pi}/A${c.ascended}, want ${rank}/${sig}/${pi}/A${asc}`);
    }
  });
}
for (const [k, [ok, n]] of Object.entries(tally)) console.log(`${k.padEnd(16)} ${ok}/${n}`);
await terminateOcr();
