"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import RosterImport from "./RosterImport";
import ChampionCard from "./ChampionCard";
import ChampionPicker, { parseOptionalInt } from "./ChampionPicker";
import StarRating from "./StarRating";

type RosterEntry = {
  id: string;
  championId: string;
  championName: string;
  championImageUrl: string | null;
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  rating: number | null;
  awakened: boolean | null;
  ascended: number | null;
  source: string;
};

type Champion = { id: string; name: string; imageUrl: string | null };

export default function RosterManager({
  initialRoster,
  champions
}: {
  initialRoster: RosterEntry[];
  champions: Champion[];
}) {
  const [roster, setRoster] = useState<RosterEntry[]>(initialRoster);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const router = useRouter();

  const ownedIds = useMemo(() => new Set(roster.map((r) => r.championId)), [roster]);
  const available = useMemo(
    () => champions.filter((c) => !ownedIds.has(c.id)),
    [champions, ownedIds]
  );

  async function refresh() {
    const res = await fetch("/api/roster", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.roster)) {
      throw new Error(data.error ?? "Couldn't reload your roster.");
    }
    setRoster(data.roster);
  }

  async function handleImported() {
    await refresh();
    router.refresh();
  }

  async function addChampion(form: { championId: string; stars: number; awakened: boolean; ascended: number; rating: number; rank: number | null; sigLevel: number | null }) {
    setError(null);
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't add that champion.");
      throw new Error("add failed");
    }
    await refresh();
    router.refresh();
  }

  async function updateEntry(id: string, form: { stars: number; rating: number | null; awakened: boolean; ascended: number; rank: number | null; sigLevel: number | null }) {
    setError(null);
    const res = await fetch(`/api/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't save that change.");
      return;
    }
    await refresh();
    router.refresh();
  }

  async function removeEntry(id: string) {
    setError(null);
    const res = await fetch(`/api/roster/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't remove that champion.");
      return;
    }
    setRoster((r) => r.filter((e) => e.id !== id));
    router.refresh();
  }

  const sortedRoster = useMemo(
    () =>
      [...roster].sort((a, b) => {
        // Higher-rated champions first. Champions without a rating go to the bottom.
        if (a.rating == null && b.rating == null) return a.championName.localeCompare(b.championName);
        if (a.rating == null) return 1;
        if (b.rating == null) return -1;
        return b.rating - a.rating;
      }),
    [roster]
  );

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-xl tracking-wide text-parchment mb-3">Import or add a champion</h2>
        <div className="mb-8">
          <RosterImport champions={champions} onImported={handleImported} />
        </div>
        <button
          type="button"
          onClick={() => setManualOpen((open) => !open)}
          className="w-full flex items-center justify-between rounded-lg border border-ink-lighter bg-ink/40 px-4 py-3 text-left hover:bg-ink/60 transition-colors"
          aria-expanded={manualOpen}
          aria-controls="manual-champion-picker"
        >
          <span className="font-display text-lg tracking-wide text-parchment">Add manually</span>
          {manualOpen ? (
            <ChevronUp size={20} className="text-brass-bright" />
          ) : (
            <ChevronDown size={20} className="text-brass-bright" />
          )}
        </button>

        {manualOpen && (
          <div id="manual-champion-picker" className="mt-4">
            {error && <p className="text-sm text-crimson-bright mb-3">{error}</p>}
            <ChampionPicker champions={available} onAdd={addChampion} />
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl tracking-wide text-parchment mb-3">
          My roster <span className="text-parchment-faint text-base">({roster.length})</span>
        </h2>
        {roster.length === 0 ? (
          <div className="panel p-8 text-center text-parchment-faint">
            You haven't added any champions yet — pick one above to get started.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {sortedRoster.map((entry) => (
              <ChampionCard
                key={entry.id}
                name={entry.championName}
                imageUrl={entry.championImageUrl}
                size="sm"
                onClick={() => setEditing(entry)}
                awakened={entry.awakened}
                ascended={entry.ascended}
                stats={entry}
                details={
                  <div className="stat text-[10px] text-parchment-dim truncate">
                    {entry.rating != null ? `${entry.rating.toLocaleString()} PI` : "PI —"}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <EditChampionModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={updateEntry}
          onRemove={removeEntry}
        />
      )}
    </div>
  );
}

export function EditChampionModal({
  entry,
  onClose,
  onSave,
  onRemove
}: {
  entry: Omit<RosterEntry, "source">;
  onClose: () => void;
  onSave: (id: string, form: { stars: number; rating: number | null; awakened: boolean; ascended: number; rank: number | null; sigLevel: number | null }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [stars, setStars] = useState(entry.stars ?? 1);
  const [rating, setRating] = useState(entry.rating);
  const [awakened, setAwakened] = useState(entry.awakened ?? false);
  const [ascended, setAscended] = useState(entry.ascended ?? 0);
  const [rank, setRank] = useState(entry.rank != null ? String(entry.rank) : "");
  const [sigLevel, setSigLevel] = useState(entry.sigLevel != null ? String(entry.sigLevel) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function save() {
    const rankValue = parseOptionalInt(rank, 1, 6);
    if (Number.isNaN(rankValue)) {
      setError("Rank must be a whole number from 1 to 6.");
      return;
    }
    const sigValue = parseOptionalInt(sigLevel, 0, 200);
    if (Number.isNaN(sigValue)) {
      setError("Signature level must be a whole number from 0 to 200.");
      return;
    }
    setError(null);
    setSaving(true);
    await onSave(entry.id, { stars, rating, awakened, ascended, rank: rankValue, sigLevel: sigValue });
    setSaving(false);
    onClose();
  }

  async function remove() {
    setRemoving(true);
    await onRemove(entry.id);
    setRemoving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="panel w-full max-w-sm max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <ChampionCard
          name={entry.championName}
          imageUrl={entry.championImageUrl}
          aspect="banner"
          awakened={entry.awakened}
          ascended={entry.ascended}
        />
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl tracking-wide text-parchment">{entry.championName}</h3>
            <button
              onClick={remove}
              disabled={removing}
              className="text-crimson-bright hover:text-crimson p-1"
              aria-label="Remove from roster"
              title="Remove from roster"
            >
              <Trash2 size={18} />
            </button>
          </div>

          <div>
            <label className="field-label">Stars</label>
            <StarRating value={stars} onChange={setStars} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Power index (PI)</label>
              <input
                type="number"
                min={0}
                className="field-input stat"
                value={rating ?? ""}
                onChange={(e) => setRating(e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Awakened</label>
                <select className="field-input" value={awakened ? "yes" : "no"} onChange={(e) => setAwakened(e.target.value === "yes")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="field-label">Ascended</label>
                <select className="field-input" value={ascended} onChange={(e) => setAscended(Number(e.target.value))}>
                  <option value="0">No</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Rank</label>
              <input
                type="number"
                min={1}
                max={6}
                placeholder="1–6"
                className="field-input stat"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Signature level</label>
              <input
                type="number"
                min={0}
                max={200}
                placeholder="0–200"
                className="field-input stat"
                value={sigLevel}
                onChange={(e) => setSigLevel(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-crimson-bright">{error}</p>}

          <button onClick={save} disabled={saving} className="btn-primary w-full">
            <Pencil size={14} />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
