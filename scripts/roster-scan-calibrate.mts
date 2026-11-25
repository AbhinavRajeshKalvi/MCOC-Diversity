/**
 * Calibrates which window of a champion portrait (imageUrl) lines up with
 * the portrait crop on a Battle Deck card, and reports matching accuracy.
 *   npx tsx scripts/roster-scan-calibrate.mts <fingerprints.txt> <portrait-cache-dir> [out.json]
 * fingerprints.txt: JSON lines of [id, label | null, pack6-feature].
 * The cache dir holds champions.json + images from mcocscout (downloaded if missing).
 */
import fs from "node:fs";
import path from "node:path";
import { unpack6 } from "../src/lib/roster-scan/pack";
import { decodeReference, referenceFeaturesFromRaw, similarity, type RefWindow } from "../src/lib/roster-scan/portrait";

const [cropsPath, cacheDir, outPath = "roster-scan-calibration.json"] = process.argv.slice(2);
const key = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/Æ/g, "Ae").toLowerCase().replace(/[^a-z0-9]/g, "");

fs.mkdirSync(cacheDir, { recursive: true });
const indexPath = path.join(cacheDir, "champions.json");
if (!fs.existsSync(indexPath)) {
  const r = await fetch("https://mcocscout.com/data/champions.json");
  fs.writeFileSync(indexPath, Buffer.from(await r.arrayBuffer()));
}
const index = JSON.parse(fs.readFileSync(indexPath, "utf8")).data as { name: string; image: string }[];
const refs: { name: string; img: Awaited<ReturnType<typeof decodeReference>> }[] = [];
for (const c of index) {
  const file = path.join(cacheDir, c.image.replace(/[\\/]/g, "__"));
  if (!fs.existsSync(file)) {
    const r = await fetch("https://mcocscout.com/" + encodeURI(c.image));
    if (!r.ok) { console.warn("skip", c.name, r.status); continue; }
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    await new Promise((res) => setTimeout(res, 100));
  }
  try { refs.push({ name: c.name, img: await decodeReference(fs.readFileSync(file)) }); } catch (e) { console.warn("bad image", c.name); }
}
console.log("references", refs.length);

const queries = fs.readFileSync(cropsPath, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => {
  const [id, label, p] = JSON.parse(l) as [string, string | null, string];
  return { id, label, f: unpack6(p) };
});
const labelled = queries.filter((q) => q.label);
const refIndexByKey = new Map(refs.map((r, i) => [key(r.name), i]));
for (const q of labelled) if (!refIndexByKey.has(key(q.label!))) console.warn("label not in references:", q.label);

function evaluate(windows: RefWindow[]) {
  const feats = refs.map((r) => referenceFeaturesFromRaw(r.img, windows));
  let correct = 0, marginSum = 0;
  const rows = queries.map((q) => {
    const scores = feats.map((fs) => Math.max(...fs.map((f) => similarity(q.f, f))));
    const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
    const top = order.slice(0, 5).map(([s, i]) => ({ name: refs[i].name, score: Math.round(s * 1000) / 1000 }));
    let truthRank: number | null = null, truthScore: number | null = null;
    if (q.label) {
      const ti = refIndexByKey.get(key(q.label));
      if (ti !== undefined) {
        truthRank = order.findIndex(([, i]) => i === ti) + 1;
        truthScore = scores[ti];
        const bestOther = order.find(([, i]) => i !== ti)![0];
        marginSum += truthScore - bestOther;
        if (truthRank === 1) correct++;
      }
    }
    return { id: q.id, label: q.label, truthRank, truthScore, top };
  });
  return { correct, total: labelled.length, meanMargin: marginSum / Math.max(1, labelled.length), rows };
}

const results: { win: RefWindow; correct: number; meanMargin: number }[] = [];
for (let w = 0.4; w <= 1.05; w += 0.1)
  for (let cx = 0.35; cx <= 0.651; cx += 0.05)
    for (let cy = 0.15; cy <= 0.651; cy += 0.05) {
      const win = { cx: +cx.toFixed(2), cy: +cy.toFixed(2), w: +w.toFixed(2) };
      const r = evaluate([win]);
      results.push({ win, correct: r.correct, meanMargin: r.meanMargin });
    }
results.sort((a, b) => b.correct - a.correct || b.meanMargin - a.meanMargin);
console.log("best single windows:", results.slice(0, 8));
let best = results[0];
for (let dw = -0.06; dw <= 0.061; dw += 0.02)
  for (let dx = -0.03; dx <= 0.031; dx += 0.01)
    for (let dy = -0.03; dy <= 0.031; dy += 0.01) {
      const win = { cx: +(best.win.cx + dx).toFixed(3), cy: +(best.win.cy + dy).toFixed(3), w: +(best.win.w + dw).toFixed(3) };
      const r = evaluate([win]);
      if (r.correct > best.correct || (r.correct === best.correct && r.meanMargin > best.meanMargin)) best = { win, correct: r.correct, meanMargin: r.meanMargin };
    }
console.log("refined:", best);
const j = best.win;
const multi: RefWindow[] = [j, { ...j, w: +(j.w * 0.9).toFixed(3) }, { ...j, w: +(j.w * 1.1).toFixed(3) }, { ...j, cy: +(j.cy - 0.04).toFixed(3) }, { ...j, cy: +(j.cy + 0.04).toFixed(3) }];
const single = evaluate([j]);
const multiR = evaluate(multi);
console.log("single", single.correct, "/", single.total, "margin", single.meanMargin.toFixed(3));
console.log("multi ", multiR.correct, "/", multiR.total, "margin", multiR.meanMargin.toFixed(3));
fs.writeFileSync(outPath, JSON.stringify({ best: best.win, multi, single: { correct: single.correct, total: single.total, rows: single.rows }, multiResult: { correct: multiR.correct, total: multiR.total, rows: multiR.rows }, topSingles: results.slice(0, 15) }, null, 1));
console.log("wrote", outPath);
