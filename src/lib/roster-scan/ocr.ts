import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Tesseract from "tesseract.js";

// Tesseract (free, local, no API) is only used to find the "Rank" words that
// anchor each Battle Deck card; the numbers are read by our own digit
// classifier (digits.ts), which is far more reliable on the game's font.

let workerPromise: Promise<Tesseract.Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function langPath(): string {
  // English model shipped as an npm package (@tesseract.js-data/eng), so
  // nothing is downloaded from a CDN at runtime.
  const candidates = [
    path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int"),
    path.join(__dirname, "..", "..", "..", "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int")
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, "eng.traineddata.gz"))) ?? candidates[0];
}

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    const cachePath = path.join(os.tmpdir(), "roster-scan-tess");
    fs.mkdirSync(cachePath, { recursive: true });
    workerPromise = Tesseract.createWorker("eng", 1, { langPath: langPath(), gzip: true, cachePath }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Runs jobs on the shared worker one at a time (parameters are per worker). */
function exclusive<T>(job: (w: Tesseract.Worker) => Promise<T>): Promise<T> {
  const run = queue.then(async () => job(await getWorker()));
  queue = run.catch(() => undefined);
  return run;
}

export type OcrWord = { text: string; conf: number; x0: number; y0: number; x1: number; y1: number };

export function ocrWords(png: Buffer, params: Partial<Tesseract.WorkerParams> = {}): Promise<OcrWord[]> {
  return exclusive(async (worker) => {
    await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: Tesseract.PSM.AUTO, ...params });
    const { data } = await worker.recognize(png, {}, { blocks: true });
    const out: OcrWord[] = [];
    for (const b of data.blocks || [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words) out.push({ text: w.text, conf: w.confidence, ...w.bbox });
    return out;
  });
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    workerPromise = null;
    await w.terminate();
  }
}
