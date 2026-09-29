"use client";

import { useMemo, useState } from "react";
import { Check, ImagePlus, Loader2, Lock, Trash2, UploadCloud, X } from "lucide-react";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";

export type ImportChampion = {
  name: string;
  championId: string | null;
  matchedName: string | null;
  stars: number | null;
  rating: number | null;
  awakened: boolean | null;
  ascended: boolean | null;
};

type Champion = { id: string; name: string; imageUrl: string | null };

export default function RosterImport({ champions, onImported }: { champions: Champion[]; onImported: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportChampion[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    const images = Array.from(incoming).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    setFiles((current) => [...current, ...images].slice(0, 5));
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function analyze() {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    files.forEach((file) => form.append("screenshots", file));

    try {
      const res = await fetch("/api/roster/analyze", { method: "POST", body: form });
      const raw = await res.text();
      let data: { error?: string; champions?: ImportChampion[] } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`The server returned an invalid response (HTTP ${res.status}). Check the terminal for the detailed error.`);
      }
      if (!res.ok) throw new Error(data.error ?? `Couldn't analyze the screenshots (HTTP ${res.status}).`);
      setResults(data.champions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze the screenshots.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!results?.length) return;
    const unresolved = results.filter((item) => !item.championId);
    if (unresolved.length) {
      setError("Every detected champion must be matched before importing.");
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/roster/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champions: results })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't import the roster.");
      setFiles([]);
      setResults(null);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import the roster.");
    } finally {
      setConfirming(false);
    }
  }

  function updateResult(index: number, patch: Partial<ImportChampion>) {
    setResults((current) => current?.map((item, i) => (i === index ? { ...item, ...patch } : item)) ?? null);
  }

  if (!SCREENSHOT_IMPORT_ENABLED) {
    return (
      <div className="panel p-5 opacity-60 cursor-not-allowed select-none" aria-disabled="true">
        <div className="flex items-center gap-2 mb-1">
          <ImagePlus size={18} className="text-parchment-faint" />
          <h3 className="font-display text-xl tracking-wide text-parchment-dim">Import from screenshots</h3>
          <Lock size={16} className="ml-auto text-parchment-faint" aria-label="Locked" />
        </div>
        <p className="text-sm text-parchment-faint">
          Locked — this feature is still under development. Add champions manually below for now.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ImagePlus size={18} className="text-brass-bright" />
          <h3 className="font-display text-xl tracking-wide text-parchment">Import from screenshots</h3>
        </div>
        <p className="text-sm text-parchment-faint">
          Upload up to 5 MCOC roster screenshots. AI will read only what is visible: champion, stars, rating, awakened, and ascended.
        </p>
      </div>

      {!results && (
        <>
          <label
            className={`block rounded-lg border border-dashed p-7 text-center cursor-pointer transition ${
              dragging ? "border-brass bg-brass/10" : "border-parchment-faint/30 hover:border-brass/60 hover:bg-white/[0.02]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          >
            <UploadCloud className="mx-auto mb-2 text-brass-bright" size={28} />
            <span className="block text-sm text-parchment">Drop screenshots here or click to browse</span>
            <span className="block text-xs text-parchment-faint mt-1">JPG, PNG or WebP · up to 5 screenshots · 10 MB each</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ""; }} />
          </label>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-sm">
                  <span className="truncate text-parchment">{file.name}</span>
                  <button type="button" onClick={() => removeFile(index)} className="text-parchment-faint hover:text-crimson-bright" aria-label={`Remove ${file.name}`}>
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button onClick={analyze} disabled={busy} className="btn-primary w-full mt-3">
                {busy ? <><Loader2 size={15} className="animate-spin" /> Analyzing screenshots… this can take a couple of minutes</> : <>Analyze {files.length} screenshot{files.length === 1 ? "" : "s"}</>}
              </button>
            </div>
          )}
        </>
      )}

      {results && (
        <ImportReview
          results={results}
          champions={champions}
          onChange={updateResult}
          onCancel={() => setResults(null)}
          onConfirm={confirm}
          confirming={confirming}
        />
      )}

      {error && <p className="text-sm text-crimson-bright">{error}</p>}
    </div>
  );
}

function ImportReview({
  results,
  champions,
  onChange,
  onCancel,
  onConfirm,
  confirming
}: {
  results: ImportChampion[];
  champions: Champion[];
  onChange: (index: number, patch: Partial<ImportChampion>) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  confirming: boolean;
}) {
  const sortedChampions = useMemo(() => [...champions].sort((a, b) => a.name.localeCompare(b.name)), [champions]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-lg text-parchment">Review import</h4>
          <p className="text-xs text-parchment-faint">{results.length} champion{results.length === 1 ? "" : "s"} detected. Check the matches before saving.</p>
        </div>
        <button onClick={onCancel} className="btn-secondary">Start over</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-parchment-faint/10">
        <table className="w-full text-sm">
          <thead className="bg-black/20 text-parchment-faint text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Champion</th>
              <th className="px-2 py-2">★</th>
              <th className="px-2 py-2">Rating</th>
              <th className="px-2 py-2">Awakened</th>
              <th className="px-2 py-2">Ascended</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item, index) => (
              <tr key={`${item.name}-${index}`} className="border-t border-parchment-faint/10 align-middle">
                <td className="px-3 py-2 min-w-56">
                  <select
                    className={`field-input text-xs ${item.championId ? "" : "border-crimson-bright/70"}`}
                    value={item.championId ?? ""}
                    onChange={(e) => {
                      const selected = sortedChampions.find((champion) => champion.id === e.target.value);
                      onChange(index, { championId: selected?.id ?? null, matchedName: selected?.name ?? null });
                    }}
                  >
                    <option value="">Unmatched — choose champion</option>
                    {sortedChampions.map((champion) => <option key={champion.id} value={champion.id}>{champion.name}</option>)}
                  </select>
                  <div className="text-[10px] text-parchment-faint mt-1">Detected: {item.name}</div>
                </td>
                <td className="px-2 py-2 text-center stat">{item.stars ?? "—"}</td>
                <td className="px-2 py-2 text-center stat">{item.rating?.toLocaleString() ?? "—"}</td>
                <td className="px-2 py-2 text-center">{item.awakened === true ? <Check size={16} className="mx-auto text-emerald-400" /> : item.awakened === false ? "No" : "—"}</td>
                <td className="px-2 py-2 text-center">{item.ascended === true ? <Check size={16} className="mx-auto text-emerald-400" /> : item.ascended === false ? "No" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={onConfirm} disabled={confirming} className="btn-primary">
          {confirming ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Check size={15} /> Confirm import</>}
        </button>
      </div>
    </div>
  );
}
