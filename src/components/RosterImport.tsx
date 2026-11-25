"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ImagePlus, Loader2, Lock, MessageSquare, Trash2, UploadCloud, X } from "lucide-react";
import { SCREENSHOT_IMPORT_ENABLED } from "@/lib/features";
import type { ImportRow } from "@/lib/roster-scan/analyze";
import { DRAFT_PARAM, REVIEW_THRESHOLD } from "@/lib/roster-scan/constants";

type Champion = { id: string; name: string; imageUrl: string | null };

/** A review row: what the scanner read, plus the champion the scanner guessed. */
type ReviewRow = ImportRow & { guessedChampionId: string | null };

export default function RosterImport({ champions, onImported }: { champions: Champion[]; onImported: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  /** Set when the rows came from a /roster-import scan in Discord. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A link from the Discord bot opens its scan here: /profile?importDraft=<token>.
  useEffect(() => {
    if (!SCREENSHOT_IMPORT_ENABLED) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get(DRAFT_PARAM);
    if (!id) return;
    url.searchParams.delete(DRAFT_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const res = await fetch(`/api/roster/import-draft/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data: { error?: string; rows?: ImportRow[]; errors?: { file: string; error: string }[] } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Couldn't open the import from Discord (HTTP ${res.status}).`);
        if (cancelled) return;
        setRows((data.rows ?? []).map((r) => ({ ...r, guessedChampionId: r.championId })));
        setWarnings((data.errors ?? []).map((e) => `${e.file}: ${e.error}`));
        setDraftId(id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't open the import from Discord.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addFiles(incoming: FileList | File[]) {
    const images = Array.from(incoming).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    setFiles((current) => [...current, ...images].slice(0, 5));
    setError(null);
    setSaved(null);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function analyze() {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    const form = new FormData();
    files.forEach((file) => form.append("screenshots", file));

    try {
      const res = await fetch("/api/roster/analyze", { method: "POST", body: form });
      const raw = await res.text();
      let data: { error?: string; rows?: ImportRow[]; errors?: { file: string; error: string }[] } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`The server returned an invalid response (HTTP ${res.status}). Check the terminal for the detailed error.`);
      }
      if (!res.ok) throw new Error(data.error ?? `Couldn't analyze the screenshots (HTTP ${res.status}).`);
      setRows((data.rows ?? []).map((r) => ({ ...r, guessedChampionId: r.championId })));
      setWarnings((data.errors ?? []).map((e) => `${e.file}: ${e.error}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze the screenshots.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!rows?.length) return;
    if (rows.some((r) => !r.championId)) {
      setError("Pick a champion for every row, or remove the rows you don't want.");
      return;
    }
    const ids = rows.map((r) => r.championId);
    if (new Set(ids).size !== ids.length) {
      setError("The same champion is picked on more than one row. Your roster keeps one entry per champion, so fix or remove the extra row.");
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/roster/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          champions: rows.map((r) => ({
            championId: r.championId,
            stars: r.stars,
            rank: r.rank,
            sigLevel: r.sigLevel,
            rating: r.rating,
            awakened: r.awakened,
            ascended: r.ascended,
            feature: r.feature,
            guessedChampionId: r.guessedChampionId
          })),
          ...(draftId ? { draftId } : {})
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't import the roster.");
      setFiles([]);
      setRows(null);
      setWarnings([]);
      setDraftId(null);
      setSaved(`Saved ${data.imported} champion${data.imported === 1 ? "" : "s"} to your roster.`);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import the roster.");
    } finally {
      setConfirming(false);
    }
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((current) => current?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  function removeRow(key: string) {
    setRows((current) => current?.filter((r) => r.key !== key) ?? null);
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
    <div ref={panelRef} className="panel p-5 space-y-5 scroll-mt-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ImagePlus size={18} className="text-brass-bright" />
          <h3 className="font-display text-xl tracking-wide text-parchment">Import from screenshots</h3>
        </div>
        <p className="text-sm text-parchment-faint">
          Upload up to 5 Battle Deck screenshots from the game. Each card&apos;s champion, stars, rank, signature level, PI,
          awakened and ascended are read for you to check before anything is saved.
        </p>
      </div>

      {!rows && (
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
                {busy ? <><Loader2 size={15} className="animate-spin" /> Reading screenshots…</> : <>Analyze {files.length} screenshot{files.length === 1 ? "" : "s"}</>}
              </button>
            </div>
          )}
        </>
      )}

      {rows && (
        <ImportReview
          rows={rows}
          warnings={warnings}
          champions={champions}
          fromDiscord={!!draftId}
          onChange={updateRow}
          onRemove={removeRow}
          onCancel={() => { setRows(null); setWarnings([]); setError(null); setDraftId(null); }}
          onConfirm={confirm}
          confirming={confirming}
        />
      )}

      {busy && !rows && files.length === 0 && (
        <p className="text-sm text-parchment-faint"><Loader2 size={14} className="inline mr-1 animate-spin" />Opening the import from Discord…</p>
      )}
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
      {saved &&<p className="text-sm text-emerald-400">{saved}</p>}
    </div>
  );
}

function ImportReview({
  rows,
  warnings,
  champions,
  fromDiscord,
  onChange,
  onRemove,
  onCancel,
  onConfirm,
  confirming
}: {
  rows: ReviewRow[];
  warnings: string[];
  champions: Champion[];
  fromDiscord: boolean;
  onChange: (key: string, patch: Partial<ReviewRow>) => void;
  onRemove: (key: string) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  confirming: boolean;
}) {
  const sortedChampions = useMemo(() => [...champions].sort((a, b) => a.name.localeCompare(b.name)), [champions]);
  const flagged = rows.filter((r) => r.confidence < REVIEW_THRESHOLD).length;
  const pickedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.championId) m.set(r.championId, (m.get(r.championId) ?? 0) + 1);
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-lg text-parchment">Review import</h4>
          {fromDiscord && (
            <p className="text-xs text-brass-bright mb-0.5">
              <MessageSquare size={12} className="inline mr-1" />From Discord: these were read from the screenshots you sent the bot.
            </p>
          )}
          <p className="text-xs text-parchment-faint">
            {rows.length} card{rows.length === 1 ? "" : "s"} read.{" "}
            {flagged > 0 ? `${flagged} need a check and are listed first.` : "All look confident, but give them a glance."} Nothing is saved until you confirm.
          </p>
        </div>
        <button onClick={onCancel} className="btn-secondary">Start over</button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md bg-black/20 px-3 py-2 text-xs text-parchment-faint space-y-1">
          {warnings.map((w) => <div key={w}><AlertTriangle size={12} className="inline mr-1 text-brass-bright" />{w}</div>)}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-parchment-faint/10">
        <table className="w-full text-sm">
          <thead className="bg-black/20 text-parchment-faint text-xs uppercase tracking-wide">
            <tr>
              <th className="px-2 py-2">Card</th>
              <th className="text-left px-3 py-2">Champion</th>
              <th className="px-2 py-2">★</th>
              <th className="px-2 py-2">Rank</th>
              <th className="px-2 py-2">Sig</th>
              <th className="px-2 py-2">PI</th>
              <th className="px-2 py-2">Awakened</th>
              <th className="px-2 py-2">Ascended</th>
              <th className="px-2 py-2">Confidence</th>
              <th className="px-2 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const unsure = row.confidence < REVIEW_THRESHOLD;
              const clash = !!row.championId && (pickedCount.get(row.championId) ?? 0) > 1;
              const candidateIds = new Set(row.candidates.map((c) => c.championId));
              return (
                <tr key={row.key} className={`border-t border-parchment-faint/10 align-middle ${unsure ? "bg-brass/5" : ""}`}>
                  <td className="px-2 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.thumbnail} alt="" className="h-16 w-auto rounded" />
                  </td>
                  <td className="px-3 py-2 min-w-56">
                    <select
                      className={`field-input text-xs ${!row.championId || clash ? "border-crimson-bright/70" : ""}`}
                      value={row.championId ?? ""}
                      onChange={(e) => onChange(row.key, { championId: e.target.value || null })}
                    >
                      <option value="">Choose champion</option>
                      {row.candidates.length > 0 && (
                        <optgroup label="Best matches">
                          {row.candidates.map((c) => <option key={c.championId} value={c.championId}>{c.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="All champions">
                        {sortedChampions.filter((c) => !candidateIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    </select>
                    {clash && <div className="text-[10px] text-crimson-bright mt-1">Also picked on another row</div>}
                    {row.duplicates > 0 && <div className="text-[10px] text-parchment-faint mt-1">Seen in {row.duplicates + 1} screenshots, merged</div>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <NumberCell value={row.stars} min={1} max={7} onChange={(v) => onChange(row.key, { stars: v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <NumberCell value={row.rank} min={1} max={6} onChange={(v) => onChange(row.key, { rank: v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <NumberCell value={row.sigLevel} min={0} max={200} onChange={(v) => onChange(row.key, { sigLevel: v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <NumberCell value={row.rating} min={0} max={99999} wide onChange={(v) => onChange(row.key, { rating: v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={row.awakened} onChange={(e) => onChange(row.key, { awakened: e.target.checked })} aria-label="Awakened" />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <select className="field-input text-xs w-16" value={row.ascended} onChange={(e) => onChange(row.key, { ascended: Number(e.target.value) })} aria-label="Ascension level">
                      <option value={0}>No</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <ConfidenceBadge value={row.confidence} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button type="button" onClick={() => onRemove(row.key)} className="text-parchment-faint hover:text-crimson-bright" aria-label="Remove row">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={onConfirm} disabled={confirming || rows.length === 0} className="btn-primary">
          {confirming ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Confirm and save {rows.length}</>}
        </button>
      </div>
    </div>
  );
}

function NumberCell({ value, min, max, wide, onChange }: { value: number | null; min: number; max: number; wide?: boolean; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className={`field-input text-xs text-center stat ${wide ? "w-20" : "w-14"} ${value == null ? "border-crimson-bright/70" : ""}`}
      value={value ?? ""}
      min={min}
      max={max}
      onChange={(e) => {
        const n = e.target.value === "" ? null : Math.round(Number(e.target.value));
        onChange(n == null || Number.isNaN(n) ? null : Math.max(min, Math.min(max, n)));
      }}
    />
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.75 ? "text-emerald-400 bg-emerald-400/10" : value >= REVIEW_THRESHOLD ? "text-brass-bright bg-brass/10" : "text-crimson-bright bg-crimson-bright/10";
  const label = value >= 0.75 ? "High" : value >= REVIEW_THRESHOLD ? "Check" : "Low";
  return <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${tone}`} title={`${pct}%`}>{label}</span>;
}
