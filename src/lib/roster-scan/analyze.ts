import { scanScreenshot, type ScannedCard } from "./index";
import { featureToBase64, matchConfidence, rankCandidates, type Reference } from "./portrait";

export type ImportCandidate = { championId: string; name: string; score: number };

export type ImportRow = {
  key: string;
  screenshot: number;
  thumbnail: string;
  /** Best guess; null when nothing matched at all. */
  championId: string | null;
  name: string | null;
  candidates: ImportCandidate[];
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  rating: number | null;
  awakened: boolean;
  ascended: number;
  /** 0..1 overall: the lower of champion match and number reading. */
  confidence: number;
  matchConfidence: number;
  textConfidence: number;
  /** Opaque token sent back on confirm so the crop can become a reference. */
  feature: string;
  /** Other copies of this card found in other screenshots. */
  duplicates: number;
};

export type AnalyzeResult = { rows: ImportRow[]; errors: { screenshot: number; error: string }[]; ms: number };

export async function analyzeScreenshots(
  files: Buffer[],
  refs: Reference[],
  names: Map<string, string>
): Promise<AnalyzeResult> {
  const t0 = Date.now();
  const rows: ImportRow[] = [];
  const errors: AnalyzeResult["errors"] = [];
  for (let i = 0; i < files.length; i++) {
    const r = await scanScreenshot(files[i]);
    if (!r.ok) {
      errors.push({ screenshot: i, error: r.error });
      continue;
    }
    for (const c of r.cards) rows.push(toRow(i, c, refs, names));
  }
  return { rows: sortRows(dedupe(rows)), errors, ms: Date.now() - t0 };
}

function toRow(screenshot: number, c: ScannedCard, refs: Reference[], names: Map<string, string>): ImportRow {
  const cands = rankCandidates(c.feature, refs, 5);
  const mc = matchConfidence(cands);
  const top = cands[0];
  return {
    key: `${screenshot}-${c.index}`,
    screenshot,
    thumbnail: c.thumbnail,
    championId: top?.championId ?? null,
    name: top ? names.get(top.championId) ?? null : null,
    candidates: cands.map((x) => ({ championId: x.championId, name: names.get(x.championId) ?? "?", score: round(x.score) })),
    stars: c.stars,
    rank: c.rank,
    sigLevel: c.sig,
    rating: c.pi,
    awakened: c.awakened ?? (c.sig ?? 0) > 0,
    ascended: c.ascended,
    confidence: round(Math.min(mc, c.textConfidence)),
    matchConfidence: round(mc),
    textConfidence: round(c.textConfidence),
    feature: featureToBase64(c.feature),
    duplicates: 0
  };
}

/**
 * The same card shows up twice when screenshots overlap (or an R4 and an R5
 * page share a row). Identical numbers with the same champion guess are the
 * same card, so they collapse into one row.
 *
 * The roster keeps one entry per champion, so two confident rows for the same
 * champion at different star levels also collapse, keeping the stronger copy
 * (more stars, then higher PI). Unsure rows are left for the user to sort out.
 */
const SURE = 0.5;
function dedupe(rows: ImportRow[]): ImportRow[] {
  const out: ImportRow[] = [];
  const byNumbers = new Map<string, ImportRow>();
  const byChampion = new Map<string, ImportRow>();
  for (const r of rows) {
    const k = [r.championId, r.stars, r.rank, r.sigLevel, r.rating, r.ascended].join("|");
    const same = byNumbers.get(k);
    if (same) {
      same.duplicates++;
      if (r.confidence > same.confidence) Object.assign(same, { ...r, key: same.key, duplicates: same.duplicates });
      continue;
    }
    const sameChamp = r.championId && r.matchConfidence >= SURE ? byChampion.get(r.championId) : undefined;
    if (sameChamp) {
      sameChamp.duplicates++;
      const stronger = (r.stars ?? 0) - (sameChamp.stars ?? 0) || (r.rating ?? 0) - (sameChamp.rating ?? 0);
      if (stronger > 0) Object.assign(sameChamp, { ...r, key: sameChamp.key, duplicates: sameChamp.duplicates });
      continue;
    }
    byNumbers.set(k, r);
    if (r.championId && r.matchConfidence >= SURE) byChampion.set(r.championId, r);
    out.push(r);
  }
  return out;
}

/** Least certain rows first, so the user reviews those while they're paying attention. */
function sortRows(rows: ImportRow[]): ImportRow[] {
  return rows.sort((a, b) => a.confidence - b.confidence || (b.rating ?? 0) - (a.rating ?? 0));
}

const round = (x: number) => Math.round(x * 1000) / 1000;
