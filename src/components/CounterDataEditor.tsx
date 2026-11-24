"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, EyeOff, Plus, RotateCcw, Save, Search } from "lucide-react";
import {
  BASE_RAW,
  OVERRIDE_KINDS,
  buildFinderData,
  exportFiles,
  mergeRaw,
  validateData,
  type DataOverride,
  type OverrideKind
} from "@/lib/counter-finder-data";
import { slugify } from "@/lib/counter-finder";

const KIND_LABELS: Record<OverrideKind, string> = {
  champion: "Champions",
  boss: "Bosses",
  node: "Nodes",
  effect: "Effects",
  trait: "Traits"
};

const TEMPLATES: Record<OverrideKind, Record<string, unknown>> = {
  champion: { name: "", class: "Tech", immunities: [], resistances: {}, traits: [], inflicts: [], confidence: "low", notes: "" },
  boss: { name: "", class: "Mutant", inflicts: [], immunities: [], helpfulTraits: [], strongCounters: [], avoid: [], confidence: "low", notes: "" },
  node: { name: "", inflicts: [], helpfulTraits: [], favorsInflicts: [], grantsImmunities: [], confidence: "low" },
  effect: { name: "", category: "other" },
  trait: { name: "", notes: "" }
};

type Raw = Record<string, unknown>;
const rawId = (raw: Raw) => (typeof raw.id === "string" && raw.id ? raw.id : slugify(String(raw.name ?? "")));

function download(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CounterDataEditor({
  initialOverrides,
  canEdit
}: {
  initialOverrides: DataOverride[];
  canEdit: boolean;
}) {
  const [overrides, setOverrides] = useState<DataOverride[]>(initialOverrides);
  const [kind, setKind] = useState<OverrideKind>("champion");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const merged = useMemo(() => mergeRaw(BASE_RAW, overrides), [overrides]);
  const issues = useMemo(() => validateData(buildFinderData(merged)), [merged]);
  const overrideFor = (k: OverrideKind, id: string) => overrides.find((o) => o.kind === k && o.id === id);
  const baseIds = useMemo(() => new Set(BASE_RAW[kind].map(rawId)), [kind]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = merged[kind].map((raw) => ({ id: rawId(raw), name: String(raw.name ?? ""), raw }));
    // Hidden base entries stay listed so they can be restored.
    for (const o of overrides) {
      if (o.kind === kind && o.deleted) {
        const base = BASE_RAW[kind].find((r) => rawId(r) === o.id);
        list.push({ id: o.id, name: String(base?.name ?? o.id), raw: base ?? {} });
      }
    }
    return list.filter((e) => !q || e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [merged, kind, query, overrides]);

  function select(id: string, raw: Raw) {
    setSelectedId(id);
    setIsNew(false);
    setDraft(JSON.stringify(raw, null, 2));
    setError(null);
    setMessage(null);
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setDraft(JSON.stringify(TEMPLATES[kind], null, 2));
    setError(null);
    setMessage(null);
  }

  async function send(init: RequestInit, url = "/api/counter-finder/overrides"): Promise<DataOverride[] | null> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body.overrides)) {
        setError(body.error ?? "Couldn't save that change.");
        return null;
      }
      setOverrides(body.overrides);
      return body.overrides;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    let data: unknown;
    try {
      data = JSON.parse(draft);
    } catch (err) {
      setError(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setError("The entry must be a JSON object.");
      return;
    }
    const body = { kind, ...(selectedId ? { id: selectedId } : {}), data, deleted: false };
    const result = await send({ method: "PUT", body: JSON.stringify(body) });
    if (result) {
      const id = selectedId ?? slugify(String((data as Raw).name ?? ""));
      setSelectedId(id);
      setIsNew(false);
      setMessage("Saved. The Counter Finder uses this correction now.");
    }
  }

  async function hide() {
    if (!selectedId || !window.confirm("Hide this entry from the Counter Finder? You can restore it later.")) return;
    if (await send({ method: "PUT", body: JSON.stringify({ kind, id: selectedId, data: null, deleted: true }) })) {
      setMessage("Hidden. Restore it with Revert to file.");
    }
  }

  async function revert() {
    if (!selectedId) return;
    const result = await send({ method: "DELETE" }, `/api/counter-finder/overrides?kind=${kind}&id=${encodeURIComponent(selectedId)}`);
    if (result) {
      const base = BASE_RAW[kind].find((r) => rawId(r) === selectedId);
      if (base) select(selectedId, base);
      else {
        setSelectedId(null);
        setDraft("");
      }
      setMessage("Reverted to the JSON file.");
    }
  }

  const files = exportFiles(merged);
  const selectedOverride = selectedId ? overrideFor(kind, selectedId) : undefined;
  const kindIssues = issues.filter((i) => i.kind === kind);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/counters/finder" className="text-parchment-dim hover:text-brass-bright">← Counter Finder</Link>
      </div>

      <section className="panel p-4 space-y-3">
        <p className="text-sm text-parchment-dim">
          The finder reads <code className="text-brass-bright">src/data/counters/*.json</code>. Corrections saved here are stored in the database,
          shared with everyone and merged over those files. Download the merged files to commit them back to the repo.
          {overrides.length > 0 && <> {overrides.length} correction{overrides.length === 1 ? "" : "s"} saved.</>}
        </p>
        {!canEdit && (
          <p className="text-xs text-parchment-faint">You can view and export the data. Only game-data editors can save corrections.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {Object.entries(files).map(([name, value]) => (
            <button key={name} className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => download(name, value)}>
              <Download size={13} /> {name}
            </button>
          ))}
          <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => download("counter-finder-overrides.json", overrides)} disabled={overrides.length === 0}>
            <Download size={13} /> corrections only
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {OVERRIDE_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setSelectedId(null);
              setIsNew(false);
              setDraft("");
              setError(null);
              setMessage(null);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${kind === k ? "border-brass bg-brass/15 text-brass-bright" : "border-ink-line text-parchment-dim hover:text-parchment"}`}
          >
            {KIND_LABELS[k]} <span className="stat text-xs text-parchment-faint">{merged[k].length}</span>
          </button>
        ))}
      </div>

      {kindIssues.length > 0 && (
        <div className="rounded-lg border border-crimson/50 bg-crimson/10 p-3 text-xs text-crimson-bright space-y-0.5">
          <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> Data problems</div>
          {kindIssues.slice(0, 10).map((i, n) => (
            <div key={n}>{i.id}: {i.message}</div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <section className="panel p-3 space-y-2">
          <div className="field-input flex items-center gap-2 !py-1.5">
            <Search size={14} className="text-parchment-faint" aria-hidden />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${KIND_LABELS[kind].toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {canEdit && (
            <button className="btn-ghost w-full !py-1.5 !text-xs" onClick={startNew}>
              <Plus size={13} /> New {kind}
            </button>
          )}
          <ul className="max-h-[60vh] overflow-y-auto -mx-1">
            {entries.map((e) => {
              const o = overrideFor(kind, e.id);
              const conf = typeof e.raw.confidence === "string" ? e.raw.confidence : null;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => select(e.id, o?.deleted ? (BASE_RAW[kind].find((r) => rawId(r) === e.id) ?? {}) : e.raw)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${selectedId === e.id ? "bg-white/[0.06] text-parchment" : "text-parchment-dim hover:bg-white/[0.04]"}`}
                  >
                    <span className={`truncate ${o?.deleted ? "line-through opacity-60" : ""}`}>{e.name || e.id}</span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider">
                      {o && <span className="text-teal-bright">{o.deleted ? "hidden" : baseIds.has(e.id) ? "edited" : "new"}</span>}
                      {conf && conf !== "high" && <span className={conf === "low" ? "text-crimson-bright" : "text-brass-bright"}>{conf}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel p-3 space-y-3 min-w-0">
          {selectedId || isNew ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg text-parchment">{isNew ? `New ${kind}` : selectedId}</h2>
                {selectedOverride && (
                  <span className="text-xs text-parchment-faint">
                    {selectedOverride.deleted ? "Hidden" : "Corrected"}
                    {selectedOverride.updatedBy ? ` by ${selectedOverride.updatedBy}` : ""}
                    {selectedOverride.updatedAt ? ` on ${new Date(selectedOverride.updatedAt).toLocaleDateString()}` : ""}
                  </span>
                )}
              </div>
              <textarea
                className="field-input font-mono !text-xs min-h-[22rem]"
                spellCheck={false}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                readOnly={!canEdit}
                aria-label="Entry JSON"
              />
              {error && <p className="text-sm text-crimson-bright">{error}</p>}
              {message && <p className="text-sm text-teal-bright">{message}</p>}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={save} disabled={busy}>
                    <Save size={15} /> Save correction
                  </button>
                  {selectedOverride && (
                    <button className="btn-ghost" onClick={revert} disabled={busy}>
                      <RotateCcw size={15} /> Revert to file
                    </button>
                  )}
                  {selectedId && !selectedOverride?.deleted && baseIds.has(selectedId) && (
                    <button className="btn-danger" onClick={hide} disabled={busy}>
                      <EyeOff size={15} /> Hide
                    </button>
                  )}
                </div>
              )}
              <ReferenceHelp kind={kind} effects={merged.effect.map(rawId)} traits={merged.trait.map(rawId)} />
            </>
          ) : (
            <p className="text-sm text-parchment-faint p-3">Pick an entry to view{canEdit ? " or correct" : ""} it as JSON.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ReferenceHelp({ kind, effects, traits }: { kind: OverrideKind; effects: string[]; traits: string[] }) {
  if (kind === "effect" || kind === "trait") return null;
  return (
    <details className="text-xs text-parchment-faint">
      <summary className="cursor-pointer hover:text-parchment">Valid effect and trait ids</summary>
      <p className="mt-2"><span className="text-parchment-dim">Effects: </span>{effects.join(", ")}</p>
      <p className="mt-1"><span className="text-parchment-dim">Traits: </span>{traits.join(", ")}</p>
      <p className="mt-1"><span className="text-parchment-dim">Classes: </span>Cosmic, Tech, Mutant, Skill, Science, Mystic. <span className="text-parchment-dim">Confidence: </span>high, medium, low.</p>
    </details>
  );
}
