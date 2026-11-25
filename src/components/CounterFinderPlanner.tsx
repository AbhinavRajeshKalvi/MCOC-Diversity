"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleMinus, Database, Info, Search, ShieldCheck, X } from "lucide-react";
import ChampionCard from "./ChampionCard";
import {
  findCounters,
  indexData,
  describeFight,
  type CounterResult,
  type FinderClass,
  type Reason
} from "@/lib/counter-finder";
import { loadFinderData } from "@/lib/counter-finder-data";
import type { FinderPageData } from "@/lib/counter-finder-server";

const CLASS_COLORS: Record<FinderClass, string> = {
  Cosmic: "#38BDF8",
  Tech: "#60A5FA",
  Mutant: "#FACC15",
  Skill: "#F87171",
  Science: "#4ADE80",
  Mystic: "#C084FC"
};

const SEARCH_LIMIT = 10;
const PAGE_SIZE = 24;

type Target = { id: string; name: string; kind: "Boss" | "Champion"; className: FinderClass | null };

function readList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export default function CounterFinderPlanner({
  initialData,
  initialSearch
}: {
  initialData: FinderPageData;
  initialSearch: { boss?: string; nodes?: string; effects?: string; all?: string };
}) {
  const data = useMemo(() => loadFinderData(initialData.overrides), [initialData.overrides]);
  const index = useMemo(() => indexData(data), [data]);
  const ownsAny = initialData.roster.length > 0;

  const [bossId, setBossId] = useState<string | null>(initialSearch.boss ?? null);
  const [nodeIds, setNodeIds] = useState<string[]>(readList(initialSearch.nodes));
  const [effectIds, setEffectIds] = useState<string[]>(readList(initialSearch.effects));
  const [onlyRoster, setOnlyRoster] = useState(ownsAny && initialSearch.all !== "1");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [effectsOpen, setEffectsOpen] = useState(effectIds.length > 0);

  // Bosses first, then every champion with data, so any defender can be picked.
  const targets = useMemo<Target[]>(() => {
    const list: Target[] = data.bosses.map((b) => ({ id: b.id, name: b.name, kind: "Boss", className: b.class }));
    const bossIds = new Set(list.map((t) => t.id));
    for (const c of data.champions) {
      if (!bossIds.has(c.id)) list.push({ id: c.id, name: c.name, kind: "Champion", className: c.class });
    }
    return list;
  }, [data]);

  const imageById = useMemo(
    () => new Map(initialData.champions.map((c) => [c.id, c.imageUrl])),
    [initialData.champions]
  );
  const nameById = useMemo(
    () => new Map(initialData.champions.map((c) => [c.id, c.name])),
    [initialData.champions]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return targets
      .filter((t) => t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        if (a.kind !== b.kind) return a.kind === "Boss" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, SEARCH_LIMIT);
  }, [query, targets]);

  // Keep the fight in the URL so it can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    set("boss", bossId);
    set("nodes", nodeIds.join(",") || null);
    set("effects", effectIds.join(",") || null);
    set("all", ownsAny && !onlyRoster ? "1" : null);
    window.history.replaceState(null, "", url.toString());
  }, [bossId, nodeIds, effectIds, onlyRoster, ownsAny]);

  useEffect(() => setShown(PAGE_SIZE), [bossId, nodeIds, effectIds, onlyRoster]);

  const selection = useMemo(() => ({ bossId, nodeIds, effectIds }), [bossId, nodeIds, effectIds]);
  const fight = useMemo(() => describeFight(index, selection), [index, selection]);
  const hasFight = Boolean(fight.boss) || nodeIds.length > 0 || effectIds.length > 0;

  const results = useMemo(() => {
    if (!hasFight) return [];
    return findCounters(data, selection, initialData.roster, {
      onlyRoster,
      officerCounters: initialData.officerCounters,
      extraChampions: initialData.champions.map((c) => ({ id: c.id, name: c.name }))
    });
  }, [hasFight, data, selection, initialData, onlyRoster]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function pickTarget(id: string | null) {
    setBossId(id);
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/counters" className="text-parchment-dim hover:text-brass-bright">
          ← Alliance counter picks
        </Link>
        <Link href="/counters/data" className="inline-flex items-center gap-1.5 text-parchment-dim hover:text-brass-bright">
          <Database size={14} aria-hidden /> View or correct the data
        </Link>
      </div>

      {/* 1. Boss / defender */}
      <section className="panel p-4 sm:p-5 space-y-4">
        <div>
          <label className="field-label" htmlFor="finder-boss">1. Boss or defender</label>
          <div className="relative max-w-2xl">
            <div className="field-input flex items-center gap-2 py-1.5 pl-3">
              <Search size={16} className="shrink-0 text-parchment-faint" aria-hidden />
              {fight.boss && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-brass/15 px-2 py-1 text-xs text-brass-bright">
                  {fight.boss.name}
                  {fight.boss.class && <span style={{ color: CLASS_COLORS[fight.boss.class] }}>· {fight.boss.class}</span>}
                  <button onClick={() => pickTarget(null)} aria-label="Clear boss" className="hover:text-parchment">
                    <X size={13} />
                  </button>
                </span>
              )}
              <input
                id="finder-boss"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm text-parchment outline-none placeholder:text-parchment-faint"
                placeholder={fight.boss ? "Change boss" : "Search a boss or champion, e.g. Onslaught"}
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults[0]) pickTarget(searchResults[0].id);
                  if (e.key === "Escape") setSearchOpen(false);
                }}
              />
            </div>
            {searchOpen && query.trim() && (
              <div className="panel absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto shadow-xl shadow-black/40">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-parchment-faint">Nothing matches.</p>
                ) : (
                  searchResults.map((t) => (
                    <button
                      key={t.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickTarget(t.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-parchment hover:bg-ink-raised"
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0 text-xs text-parchment-faint">
                        {t.className && <span style={{ color: CLASS_COLORS[t.className] }}>{t.className} </span>}
                        {t.kind === "Boss" ? "· boss profile" : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {!fight.boss && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.bosses.slice(0, 8).map((b) => (
                <button key={b.id} onClick={() => pickTarget(b.id)} className="rounded-full border border-ink-line px-2.5 py-1 text-xs text-parchment-dim hover:border-brass/60 hover:text-brass-bright">
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. Nodes */}
        <div>
          <div className="field-label">2. Node effects (optional)</div>
          <div className="flex flex-wrap gap-1.5">
            {data.nodes.map((n) => {
              const on = nodeIds.includes(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => setNodeIds((list) => toggle(list, n.id))}
                  aria-pressed={on}
                  title={n.notes}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on ? "border-brass bg-brass/15 text-brass-bright" : "border-ink-line text-parchment-dim hover:border-brass/60 hover:text-parchment"
                  }`}
                >
                  {on && <Check size={12} aria-hidden />}
                  {n.name}
                </button>
              );
            })}
          </div>
          <button onClick={() => setEffectsOpen((o) => !o)} className="mt-3 text-xs text-parchment-faint hover:text-brass-bright">
            {effectsOpen ? "Hide raw effects" : "Or pick raw effects the fight inflicts…"}
          </button>
          {effectsOpen && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.effects.map((e) => {
                const on = effectIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => setEffectIds((list) => toggle(list, e.id))}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on ? "border-crimson-bright bg-crimson/15 text-crimson-bright" : "border-ink-line text-parchment-dim hover:border-crimson/60 hover:text-parchment"
                    }`}
                  >
                    {on && <Check size={12} aria-hidden />}
                    {e.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {hasFight && <FightSummary fight={fight} effectName={index.effectName} traitName={index.traitName} />}
      </section>

      {/* Results */}
      {hasFight ? (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-display text-xl tracking-wide text-parchment">
              Best counters{fight.boss ? ` vs ${fight.boss.name}` : ""}
            </h2>
            <label className="inline-flex items-center gap-2 text-sm text-parchment-dim">
              <input type="checkbox" className="accent-brass" checked={onlyRoster} disabled={!ownsAny} onChange={(e) => setOnlyRoster(e.target.checked)} />
              Only my roster
            </label>
          </div>
          {!ownsAny && (
            <p className="mb-3 text-xs text-parchment-faint">
              Your roster is empty, so all champions are shown. Add champions on <Link href="/profile" className="text-brass-bright hover:underline">My Roster</Link> to rank your own.
            </p>
          )}
          {results.length === 0 ? (
            <p className="panel p-6 text-sm text-parchment-faint">No champions to rank.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {results.slice(0, shown).map((r, i) => (
                  <ResultCard key={r.championId} rank={i + 1} result={r} imageUrl={imageById.get(r.championId) ?? null} displayName={nameById.get(r.championId) ?? r.name} />
                ))}
              </div>
              {results.length > shown && (
                <div className="mt-4 text-center">
                  <button className="btn-ghost" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    Show more ({results.length - shown} left)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <p className="panel p-6 text-sm text-parchment-faint">
          Pick a boss or defender, add any node effects, and your champions are ranked by immunity to what the fight inflicts,
          class advantage, how well they match up, and how built-up your copy is.
        </p>
      )}
    </div>
  );
}

function ConfidenceBadge({ level, label }: { level: "high" | "medium" | "low"; label?: string }) {
  if (level === "high") return null;
  const low = level === "low";
  return (
    <span
      title={low ? "Mostly unverified data: double-check in game." : "Partly verified data."}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        low ? "border-crimson/50 bg-crimson/10 text-crimson-bright" : "border-brass/50 bg-brass/10 text-brass-bright"
      }`}
    >
      <AlertTriangle size={11} aria-hidden />
      {label ?? `${level} confidence`}
    </span>
  );
}

function FightSummary({
  fight,
  effectName,
  traitName
}: {
  fight: ReturnType<typeof describeFight>;
  effectName: (id: string) => string;
  traitName: (id: string) => string;
}) {
  const helpful = Array.from(fight.helpfulTraits.entries()).sort((a, b) => b[1].weight - a[1].weight);
  return (
    <div className="rounded-lg border border-ink-line/80 bg-ink/40 p-3 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wider text-parchment-dim">The fight</span>
        <ConfidenceBadge level={fight.confidence} label={fight.confidence === "low" ? "low-confidence boss/node data" : undefined} />
      </div>
      <p className="text-parchment-dim">
        <span className="text-parchment-faint">Inflicts: </span>
        {fight.threats.length ? fight.threats.map((t) => effectName(t.effectId)).join(", ") : "nothing modelled"}
      </p>
      {fight.defenderImmunities.size > 0 && (
        <p className="text-parchment-dim">
          <span className="text-parchment-faint">Defender immune to: </span>
          {Array.from(fight.defenderImmunities.keys()).map(effectName).join(", ")}
        </p>
      )}
      {helpful.length > 0 && (
        <p className="text-parchment-dim">
          <span className="text-parchment-faint">Helps: </span>
          {helpful.map(([trait]) => traitName(trait)).join(", ")}
        </p>
      )}
      {fight.boss?.notes && <p className="text-parchment-faint">{fight.boss.notes}</p>}
    </div>
  );
}

const BREAKDOWN: { key: "immunity" | "classAdvantage" | "matchup" | "roster"; label: string; max: number; color: string }[] = [
  { key: "immunity", label: "Immunity", max: 45, color: "#4FD1A9" },
  { key: "classAdvantage", label: "Class", max: 10, color: "#60A5FA" },
  { key: "matchup", label: "Matchup", max: 40, color: "#F6C861" },
  { key: "roster", label: "Roster", max: 25, color: "#C084FC" }
];

function ReasonLine({ reason }: { reason: Reason }) {
  const Icon = reason.tone === "good" ? ShieldCheck : reason.tone === "bad" ? CircleMinus : Info;
  const color = reason.tone === "good" ? "text-teal-bright" : reason.tone === "bad" ? "text-crimson-bright" : "text-parchment-faint";
  return (
    <li className="flex items-start gap-1.5">
      <Icon size={13} className={`mt-0.5 shrink-0 ${color}`} aria-hidden />
      <span className={reason.tone === "info" ? "text-parchment-faint" : "text-parchment-dim"}>{reason.text}</span>
    </li>
  );
}

function ResultCard({
  rank,
  result,
  imageUrl,
  displayName
}: {
  rank: number;
  result: CounterResult;
  imageUrl: string | null;
  displayName: string;
}) {
  const accent = result.championClass ? CLASS_COLORS[result.championClass] : null;
  const owned = result.owned;
  return (
    <article className="panel p-3 flex gap-3">
      <div className="w-16 sm:w-20 shrink-0">
        <ChampionCard
          name={displayName}
          imageUrl={imageUrl}
          size="sm"
          showName={false}
          accent={accent}
          stats={owned ? { stars: owned.stars, rank: owned.rank, ascended: owned.ascended, sigLevel: owned.sigLevel } : undefined}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="stat text-xs text-parchment-faint">#{rank}</span>
              <h3 className="font-semibold text-parchment truncate">{displayName}</h3>
              <ConfidenceBadge level={result.championConfidence} label={result.hasData ? undefined : "no data"} />
            </div>
            <div className="text-xs text-parchment-faint">
              {result.championClass && <span style={{ color: accent ?? undefined }}>{result.championClass}</span>}
              {owned && (
                <span className="stat">
                  {" · "}★{owned.stars ?? "?"} R{owned.rank ?? "?"} · Sig {owned.sigLevel ?? 0}
                  {owned.rating ? ` · PI ${owned.rating.toLocaleString()}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="stat text-2xl font-bold text-brass-bright leading-none">{Math.round(result.score)}</div>
            <div className="text-[10px] uppercase tracking-wider text-parchment-faint">score</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Score breakdown">
          {BREAKDOWN.map((b) => {
            const value = result.breakdown[b.key];
            const pct = Math.max(0, Math.min(1, Math.abs(value) / b.max)) * 100;
            return (
              <div key={b.key} title={`${b.label}: ${value}`}>
                <div className="flex justify-between text-[10px] text-parchment-faint">
                  <span>{b.label}</span>
                  <span className={`stat ${value < 0 ? "text-crimson-bright" : ""}`}>{value > 0 ? `+${value}` : value}</span>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: value < 0 ? "#F05A72" : b.color }} />
                </div>
              </div>
            );
          })}
        </div>

        <ul className="mt-2 space-y-0.5 text-xs">
          {result.reasons.slice(0, 6).map((r, i) => (
            <ReasonLine key={i} reason={r} />
          ))}
        </ul>
      </div>
    </article>
  );
}
