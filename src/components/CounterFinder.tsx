"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Search, ShieldHalf, Swords, Trash2, X } from "lucide-react";
import ChampionCard from "./ChampionCard";
import {
  CHAMPION_CLASSES,
  compareCounters,
  type ChampionClass,
  type Counter,
  type CounterChampion,
  type CounterData,
  type CounterProfile,
  type CounterStrength,
  type OwnedChampion
} from "@/lib/counters";

const CLASS_COLORS: Record<ChampionClass, string> = {
  Cosmic: "#38BDF8",
  Tech: "#60A5FA",
  Mutant: "#FACC15",
  Skill: "#F87171",
  Science: "#4ADE80",
  Mystic: "#C084FC"
};

const SEARCH_LIMIT = 8;

export default function CounterFinder({
  initialData,
  isOfficer,
  initialDefenderId
}: {
  initialData: CounterData;
  isOfficer: boolean;
  initialDefenderId: string | null;
}) {
  const [data, setData] = useState<CounterData>(initialData);
  const [defenderId, setDefenderId] = useState<string | null>(
    initialDefenderId && initialData.champions.some((c) => c.id === initialDefenderId) ? initialDefenderId : null
  );
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Counter | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  const championsById = useMemo(() => new Map(data.champions.map((c) => [c.id, c])), [data.champions]);
  const profilesById = useMemo(() => new Map(data.profiles.map((p) => [p.championId, p])), [data.profiles]);
  const ownedById = useMemo(() => new Map(data.owned.map((o) => [o.championId, o])), [data.owned]);
  const classColor = (championId: string) => {
    const championClass = profilesById.get(championId)?.championClass;
    return championClass ? CLASS_COLORS[championClass] : null;
  };

  const countersByDefender = useMemo(() => {
    const map = new Map<string, Counter[]>();
    for (const counter of data.counters) {
      if (!championsById.has(counter.counterId)) continue;
      const list = map.get(counter.defenderId) ?? [];
      list.push(counter);
      map.set(counter.defenderId, list);
    }
    map.forEach((list) => list.sort(compareCounters));
    return map;
  }, [data.counters, championsById]);

  // Keep the selected defender in the URL so a counter list can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (defenderId) url.searchParams.set("defender", defenderId);
    else url.searchParams.delete("defender");
    window.history.replaceState(null, "", url.toString());
  }, [defenderId]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return data.champions
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Names that start with the query first, then defenders that have counters.
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        const countDiff = (countersByDefender.get(b.id)?.length ?? 0) - (countersByDefender.get(a.id)?.length ?? 0);
        return countDiff || a.name.localeCompare(b.name);
      })
      .slice(0, SEARCH_LIMIT);
  }, [query, data.champions, countersByDefender]);

  function selectDefender(id: string | null) {
    setDefenderId(id);
    setQuery("");
    setSearchOpen(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function reload() {
    const res = await fetch("/api/counters", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.counters)) throw new Error(body.error ?? "Couldn't reload counters.");
    setData(body as CounterData);
  }

  /** Sends a change, then reloads. Returns false (and shows the error) if it failed. */
  async function send(url: string, init: RequestInit): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't save that change.");
        return false;
      }
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change.");
      return false;
    }
  }

  const defender = defenderId ? championsById.get(defenderId) ?? null : null;
  const allCounters = defenderId ? countersByDefender.get(defenderId) ?? [] : [];
  const shownCounters = onlyOwned ? allCounters.filter((c) => ownedById.has(c.counterId)) : allCounters;

  async function move(counter: Counter, direction: -1 | 1) {
    // Reorder within the counter's strength group (hard picks always rank above soft ones).
    const group = allCounters.filter((c) => c.strength === counter.strength);
    const from = group.findIndex((c) => c.id === counter.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= group.length) return;
    const reordered = [...group];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    const changes = reordered
      .map((c, index) => ({ c, index }))
      .filter(({ c, index }) => c.order !== index);
    setError(null);
    const results = await Promise.all(
      changes.map(({ c, index }) =>
        fetch(`/api/counters/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: index })
        })
      )
    );
    if (results.some((res) => !res.ok)) setError("Couldn't reorder those counters.");
    await reload().catch((err) => setError(err.message));
  }

  async function remove(counter: Counter) {
    const name = championsById.get(counter.counterId)?.name ?? "this counter";
    if (!window.confirm(`Remove ${name} from the counters for ${defender?.name ?? "this defender"}?`)) return;
    await send(`/api/counters/${counter.id}`, { method: "DELETE" });
  }

  // Defenders this champion is listed as a counter for ("Good against").
  const goodAgainst = useMemo(() => {
    if (!defenderId) return [];
    const ids = data.counters.filter((c) => c.counterId === defenderId).map((c) => c.defenderId);
    return Array.from(new Set(ids))
      .map((id) => championsById.get(id))
      .filter((c): c is CounterChampion => Boolean(c))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [defenderId, data.counters, championsById]);

  const defendersWithCounters = useMemo(
    () =>
      Array.from(countersByDefender.keys())
        .map((id) => championsById.get(id))
        .filter((c): c is CounterChampion => Boolean(c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [countersByDefender, championsById]
  );

  return (
    <div className="space-y-6">
      {/* Defender search */}
      <div className="relative max-w-2xl">
        <div className="field-input flex items-center gap-2 py-1.5 pl-3">
          <Search size={16} className="shrink-0 text-parchment-faint" aria-hidden />
          {defender && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-brass/15 px-2 py-1 text-xs text-brass-bright">
              Counters for: {defender.name}
              <button onClick={() => selectDefender(null)} aria-label="Clear defender" className="hover:text-parchment">
                <X size={13} />
              </button>
            </span>
          )}
          <input
            className="min-w-0 flex-1 bg-transparent py-1 text-sm text-parchment outline-none placeholder:text-parchment-faint"
            placeholder={defender ? "Search another defender" : "Search defender"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults[0]) selectDefender(searchResults[0].id);
              if (e.key === "Escape") setSearchOpen(false);
            }}
            aria-label="Search defender"
          />
        </div>
        {searchOpen && query.trim() && (
          <div className="panel absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto shadow-xl shadow-black/40">
            {searchResults.length === 0 ? (
              <p className="px-3 py-3 text-sm text-parchment-faint">No champions match.</p>
            ) : (
              searchResults.map((c) => {
                const count = countersByDefender.get(c.id)?.length ?? 0;
                return (
                  <button
                    key={c.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectDefender(c.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-parchment hover:bg-ink-raised"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-parchment-faint">
                      {count === 0 ? "No counters yet" : `${count} counter${count === 1 ? "" : "s"}`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-crimson-bright">{error}</p>}

      {!defender ? (
        <section>
          <h2 className="font-display text-xl tracking-wide text-parchment mb-3">Defenders with counters</h2>
          {defendersWithCounters.length === 0 ? (
            <p className="panel p-6 text-sm text-parchment-faint">
              No counters have been added yet.
              {isOfficer
                ? " Search a defender above, then use Add counter to list the champions that beat it."
                : " Officers can add them; search any defender above to check."}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {defendersWithCounters.map((c) => {
                const count = countersByDefender.get(c.id)?.length ?? 0;
                return (
                  <ChampionCard
                    key={c.id}
                    name={c.name}
                    imageUrl={c.imageUrl}
                    size="sm"
                    onClick={() => selectDefender(c.id)}
                    accent={classColor(c.id)}
                    badge={<span className="rounded-md bg-black/80 border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-brass-bright stat">{count}</span>}
                  />
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <>
          <p className="text-sm text-parchment-faint">
            {allCounters.length === 0
              ? `No counters listed for ${defender.name} yet.`
              : onlyOwned
              ? `Showing ${shownCounters.length} of ${allCounters.length} counters for ${defender.name} that you own.`
              : `Showing ${allCounters.length} counter${allCounters.length === 1 ? "" : "s"} for ${defender.name}.`}
          </p>

          <DefenderPanel
            champion={defender}
            profile={profilesById.get(defender.id) ?? null}
            counterCount={allCounters.length}
            isOfficer={isOfficer}
            onEdit={() => { setError(null); setEditingProfile(true); }}
          />

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-display text-xl tracking-wide text-parchment">Counter picks</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-parchment-dim">
                  <input
                    type="checkbox"
                    className="accent-brass"
                    checked={onlyOwned}
                    onChange={(e) => setOnlyOwned(e.target.checked)}
                  />
                  Only champions I own
                </label>
                {isOfficer && (
                  <button className="btn-primary" onClick={() => { setError(null); setAdding(true); }}>
                    <Plus size={15} /> Add counter
                  </button>
                )}
              </div>
            </div>

            {shownCounters.length === 0 ? (
              <p className="panel p-6 text-sm text-parchment-faint">
                {allCounters.length > 0
                  ? "You don't own any of the listed counters."
                  : isOfficer
                  ? "Use Add counter to list the champions that beat this defender."
                  : "Officers haven't listed counters for this defender yet."}
              </p>
            ) : (
              // Keyed by defender so the cards cascade in again for each new defender.
              <div key={defenderId} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {shownCounters.map((counter, index) => {
                  const champion = championsById.get(counter.counterId)!;
                  const group = allCounters.filter((c) => c.strength === counter.strength);
                  const groupIndex = group.findIndex((c) => c.id === counter.id);
                  return (
                    <CounterPickCard
                      key={counter.id}
                      pick={allCounters.indexOf(counter) + 1}
                      index={index}
                      counter={counter}
                      champion={champion}
                      profile={profilesById.get(champion.id) ?? null}
                      owned={ownedById.get(champion.id) ?? null}
                      isOfficer={isOfficer}
                      canMoveUp={!onlyOwned && groupIndex > 0}
                      canMoveDown={!onlyOwned && groupIndex < group.length - 1}
                      onOpen={() => selectDefender(champion.id)}
                      onMove={(direction) => move(counter, direction)}
                      onEdit={() => { setError(null); setEditing(counter); }}
                      onRemove={() => remove(counter)}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {goodAgainst.length > 0 && (
            <section>
              <h2 className="font-display text-xl tracking-wide text-parchment mb-1">{defender.name} is a counter for</h2>
              <p className="text-xs text-parchment-faint mb-3">Defenders that list {defender.name} as a counter pick.</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {goodAgainst.map((c) => (
                  <ChampionCard key={c.id} name={c.name} imageUrl={c.imageUrl} size="sm" accent={classColor(c.id)} onClick={() => selectDefender(c.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {adding && defender && (
        <AddCounterModal
          error={error}
          defender={defender}
          champions={data.champions.filter(
            (c) => c.id !== defender.id && !allCounters.some((counter) => counter.counterId === c.id)
          )}
          onClose={() => setAdding(false)}
          onSave={async (form) => {
            const ok = await send("/api/counters", {
              method: "POST",
              body: JSON.stringify({ defenderId: defender.id, ...form })
            });
            if (ok) setAdding(false);
            return ok;
          }}
        />
      )}

      {editing && (
        <EditCounterModal
          error={error}
          counter={editing}
          champion={championsById.get(editing.counterId)!}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            const ok = await send(`/api/counters/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}

      {editingProfile && defender && (
        <ProfileModal
          error={error}
          champion={defender}
          profile={profilesById.get(defender.id) ?? null}
          onClose={() => setEditingProfile(false)}
          onSave={async (form) => {
            const ok = await send(`/api/counters/profiles/${defender.id}`, { method: "PUT", body: JSON.stringify(form) });
            if (ok) setEditingProfile(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function ClassTag({ championClass }: { championClass: ChampionClass | null }) {
  if (!championClass) return null;
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: CLASS_COLORS[championClass] }}>
      {championClass}
    </span>
  );
}

function StrengthTag({ strength }: { strength: CounterStrength }) {
  return strength === "hard" ? (
    <span className="rounded-sm border border-crimson/60 bg-crimson/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-crimson-bright">
      Hard counter
    </span>
  ) : (
    <span className="rounded-sm border border-teal/60 bg-teal/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-bright">
      Soft counter
    </span>
  );
}

function DefenderPanel({
  champion,
  profile,
  counterCount,
  isOfficer,
  onEdit
}: {
  champion: CounterChampion;
  profile: CounterProfile | null;
  counterCount: number;
  isOfficer: boolean;
  onEdit: () => void;
}) {
  return (
    <section className="panel p-4">
      <div className="flex items-center gap-2 mb-4">
        <ShieldHalf size={18} className="text-brass" aria-hidden />
        <div>
          <div className="text-[10px] uppercase tracking-wide text-parchment-faint">Defender</div>
          <div className="font-display text-lg tracking-wide text-parchment leading-tight">{champion.name}</div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="w-36 shrink-0">
          <ChampionCard name={champion.name} imageUrl={champion.imageUrl} showName={false} eager />
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-brass">Defender info</span>
            <span className="text-xs text-parchment-faint">
              {counterCount} counter{counterCount === 1 ? "" : "s"}
            </span>
          </div>
          {profile ? (
            <dl className="space-y-2">
              <InfoRow label="Class">
                {profile.championClass ? <ClassTag championClass={profile.championClass} /> : "Not set"}
              </InfoRow>
              <InfoRow label="Key abilities">{profile.keyAbilities.join(", ") || "Not set"}</InfoRow>
              <InfoRow label="Immunities">{profile.immunities.join(", ") || "None listed"}</InfoRow>
            </dl>
          ) : (
            <p className="text-parchment-faint">
              No defender info yet.{isOfficer ? " Add its class, key abilities and immunities." : ""}
            </p>
          )}
          {isOfficer && (
            <button className="btn-ghost mt-4" onClick={onEdit}>
              <Pencil size={14} /> {profile ? "Edit info" : "Add info"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline text-parchment-faint">{label}: </dt>
      <dd className="inline text-parchment">{children}</dd>
    </div>
  );
}

// Set to false to stop counter cards cascading in and the #1 pick shimmering.
const COUNTER_FX = true;

function CounterPickCard({
  pick,
  index,
  counter,
  champion,
  profile,
  owned,
  isOfficer,
  canMoveUp,
  canMoveDown,
  onOpen,
  onMove,
  onEdit,
  onRemove
}: {
  pick: number;
  /** Position in the shown list, for the cascade delay. */
  index: number;
  counter: Counter;
  champion: CounterChampion;
  profile: CounterProfile | null;
  owned: OwnedChampion | null;
  isOfficer: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <article
      className={`panel flex flex-col p-4 ${COUNTER_FX ? `fx-cascade ${pick === 1 ? "fx-shimmer" : ""}` : ""}`}
      style={COUNTER_FX ? { animationDelay: `${Math.min(index, 12) * 70}ms` } : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Swords size={16} className="shrink-0 text-teal-bright" aria-hidden />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-parchment-faint">Counter pick {pick}</div>
            <div className="font-display text-base tracking-wide text-parchment leading-tight truncate">{champion.name}</div>
          </div>
        </div>
        {isOfficer && (
          <div className="flex shrink-0 items-center gap-0.5 text-parchment-faint">
            <IconButton label="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <ChevronUp size={15} />
            </IconButton>
            <IconButton label="Move down" disabled={!canMoveDown} onClick={() => onMove(1)}>
              <ChevronDown size={15} />
            </IconButton>
            <IconButton label="Edit" onClick={onEdit}>
              <Pencil size={14} />
            </IconButton>
            <IconButton label="Remove" onClick={onRemove} danger>
              <Trash2 size={14} />
            </IconButton>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          <ChampionCard
            name={champion.name}
            imageUrl={champion.imageUrl}
            size="sm"
            showName={false}
            onClick={onOpen}
            stats={owned ?? undefined}
            accent={profile?.championClass ? CLASS_COLORS[profile.championClass] : null}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StrengthTag strength={counter.strength} />
            <ClassTag championClass={profile?.championClass ?? null} />
          </div>
          {owned ? (
            <div className="text-xs text-brass-bright">In your roster</div>
          ) : (
            <div className="text-xs text-parchment-faint">Not in your roster</div>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-ink-line pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-brass mb-1">Why it works</div>
        <p className="text-sm text-parchment-dim whitespace-pre-line">{counter.note || "No note yet."}</p>
      </div>
    </article>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-sm p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? "hover:text-crimson-bright" : "hover:text-brass-bright"
      }`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  error,
  onClose,
  children
}: {
  title: string;
  error: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel w-full max-w-md max-h-[90dvh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-xl tracking-wide text-parchment">{title}</h3>
          <button onClick={onClose} className="p-1 text-parchment-faint hover:text-parchment" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
        {error && <p className="mt-3 text-sm text-crimson-bright">{error}</p>}
      </div>
    </div>
  );
}

function CounterFields({
  strength,
  note,
  onStrength,
  onNote
}: {
  strength: CounterStrength;
  note: string;
  onStrength: (value: CounterStrength) => void;
  onNote: (value: string) => void;
}) {
  return (
    <>
      <div>
        <label className="field-label">Strength</label>
        <select className="field-input" value={strength} onChange={(e) => onStrength(e.target.value as CounterStrength)}>
          <option value="hard">Hard counter: shuts the defender down</option>
          <option value="soft">Soft counter: makes the fight easier</option>
        </select>
      </div>
      <div>
        <label className="field-label">Why it works</label>
        <textarea
          className="field-input min-h-[6rem]"
          maxLength={500}
          placeholder="Which of the defender's abilities this champion answers, and how."
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>
    </>
  );
}

function AddCounterModal({
  defender,
  champions,
  error,
  onClose,
  onSave
}: {
  defender: CounterChampion;
  champions: CounterChampion[];
  error: string | null;
  onClose: () => void;
  onSave: (form: { counterId: string; strength: CounterStrength; note: string }) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CounterChampion | null>(null);
  const [strength, setStrength] = useState<CounterStrength>("soft");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? champions.filter((c) => c.name.toLowerCase().includes(q)) : champions;
  }, [champions, query]);

  async function save() {
    if (!picked) return;
    setSaving(true);
    await onSave({ counterId: picked.id, strength, note });
    setSaving(false);
  }

  return (
    <Modal error={error} title={`Add a counter for ${defender.name}`} onClose={onClose}>
      <div className="space-y-4">
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-sm bg-ink-raised px-3 py-2">
            <span className="text-sm text-parchment">{picked.name}</span>
            <button className="text-xs text-brass hover:text-brass-bright" onClick={() => setPicked(null)}>
              Change
            </button>
          </div>
        ) : (
          <div>
            <label className="field-label">Counter champion</label>
            <input
              className="field-input mb-2"
              placeholder={`Search ${champions.length} champions…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
              {filtered.map((c) => (
                <ChampionCard key={c.id} name={c.name} imageUrl={c.imageUrl} size="sm" onClick={() => setPicked(c)} />
              ))}
              {filtered.length === 0 && <p className="col-span-4 py-4 text-center text-sm text-parchment-faint">No matches.</p>}
            </div>
          </div>
        )}
        <CounterFields strength={strength} note={note} onStrength={setStrength} onNote={setNote} />
        <button className="btn-primary w-full" disabled={!picked || saving} onClick={save}>
          {saving ? "Adding…" : "Add counter"}
        </button>
      </div>
    </Modal>
  );
}

function EditCounterModal({
  counter,
  champion,
  error,
  onClose,
  onSave
}: {
  counter: Counter;
  champion: CounterChampion;
  error: string | null;
  onClose: () => void;
  onSave: (form: { strength: CounterStrength; note: string }) => Promise<boolean>;
}) {
  const [strength, setStrength] = useState<CounterStrength>(counter.strength);
  const [note, setNote] = useState(counter.note);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave({ strength, note });
    setSaving(false);
  }

  return (
    <Modal error={error} title={`Edit ${champion.name}`} onClose={onClose}>
      <div className="space-y-4">
        <CounterFields strength={strength} note={note} onStrength={setStrength} onNote={setNote} />
        <button className="btn-primary w-full" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/** "a, b,, c " -> ["a", "b", "c"] */
function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ProfileModal({
  champion,
  profile,
  error,
  onClose,
  onSave
}: {
  champion: CounterChampion;
  profile: CounterProfile | null;
  error: string | null;
  onClose: () => void;
  onSave: (form: { championClass: ChampionClass | null; keyAbilities: string[]; immunities: string[] }) => Promise<boolean>;
}) {
  const [championClass, setChampionClass] = useState<ChampionClass | "">(profile?.championClass ?? "");
  const [keyAbilities, setKeyAbilities] = useState((profile?.keyAbilities ?? []).join(", "));
  const [immunities, setImmunities] = useState((profile?.immunities ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave({
      championClass: championClass || null,
      keyAbilities: parseList(keyAbilities),
      immunities: parseList(immunities)
    });
    setSaving(false);
  }

  return (
    <Modal error={error} title={`${champion.name} defender info`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="field-label">Class</label>
          <select
            className="field-input"
            value={championClass}
            onChange={(e) => setChampionClass(e.target.value as ChampionClass | "")}
          >
            <option value="">Not set</option>
            {CHAMPION_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Key abilities</label>
          <input
            className="field-input"
            placeholder="Comma separated, e.g. Evade, Regeneration"
            value={keyAbilities}
            onChange={(e) => setKeyAbilities(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Immunities</label>
          <input
            className="field-input"
            placeholder="Comma separated, e.g. Poison, Bleed"
            value={immunities}
            onChange={(e) => setImmunities(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
