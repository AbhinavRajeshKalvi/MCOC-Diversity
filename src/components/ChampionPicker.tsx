"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import ChampionCard from "./ChampionCard";
import StarRating from "./StarRating";

type Champion = { id: string; name: string; imageUrl: string | null };

export default function ChampionPicker({
  champions,
  onAdd
}: {
  champions: Champion[];
  onAdd: (form: { championId: string; stars: number; awakened: boolean; ascended: number; rating: number; rank: number | null; sigLevel: number | null }) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Champion | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? champions.filter((c) => c.name.toLowerCase().includes(q)) : champions;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, query]);

  return (
    <div>
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment-faint pointer-events-none"
        />
        <input
          className="field-input pl-9"
          placeholder={`Search ${champions.length} champions…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-parchment-faint py-8 text-center">
          {champions.length === 0 ? "You already own every champion in the list." : "No matches."}
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[28rem] overflow-y-auto pr-1">
          {filtered.map((c) => (
            <ChampionCard key={c.id} name={c.name} imageUrl={c.imageUrl} size="sm" onClick={() => setActive(c)} />
          ))}
        </div>
      )}

      {active && (
        <AddChampionModal champion={active} onClose={() => setActive(null)} onAdd={onAdd} />
      )}
    </div>
  );
}

function AddChampionModal({
  champion,
  onClose,
  onAdd
}: {
  champion: Champion;
  onClose: () => void;
  onAdd: (form: { championId: string; stars: number; awakened: boolean; ascended: number; rating: number; rank: number | null; sigLevel: number | null }) => Promise<void>;
}) {
  const [stars, setStars] = useState(6);
  const [awakened, setAwakened] = useState(false);
  const [ascended, setAscended] = useState(0);
  const [rating, setRating] = useState("");
  const [rank, setRank] = useState("");
  const [sigLevel, setSigLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const pi = Number(rating);
    if (rating.trim() === "" || !Number.isInteger(pi) || pi < 1) {
      setError("Enter the champion's PI.");
      return;
    }
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
    setSubmitting(true);
    setError(null);
    try {
      await onAdd({ championId: champion.id, stars, awakened, ascended, rating: pi, rank: rankValue, sigLevel: sigValue });
      onClose();
    } catch {
      setError("Couldn't add that champion. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <ChampionCard name={champion.name} imageUrl={champion.imageUrl} aspect="banner" />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-ink/70 text-parchment hover:bg-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <h3 className="font-display text-xl tracking-wide text-parchment">{champion.name}</h3>

          <div>
            <label className="field-label">Stars</label>
            <StarRating value={stars} onChange={setStars} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Awakened</label>
              <select
                className="field-input"
                value={awakened ? "yes" : "no"}
                onChange={(e) => setAwakened(e.target.value === "yes")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="field-label">Ascended</label>
              <select
                className="field-input"
                value={ascended}
                onChange={(e) => setAscended(Number(e.target.value))}
              >
                <option value="0">No</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="field-label">Power index (PI)</label>
              <input
                type="number"
                min={1}
                className="field-input stat"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
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

          <button onClick={submit} disabled={submitting} className="btn-primary w-full">
            {submitting ? "Adding…" : "Add to roster"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Parses an optional whole-number field; "" means not set, NaN means invalid. */
export function parseOptionalInt(value: string, min: number, max: number): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN;
}
