"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { WAR_MODES, WAR_MODE_LABELS, type WarMode } from "@/lib/war-mode";

/**
 * The alliance-wide Regular / Big Things switch shown on the Battlegroups and
 * Attack pages. Officers can flip it; everyone else sees which mode is on.
 */
export default function WarModeSwitch({ mode, isOfficer }: { mode: WarMode; isOfficer: boolean }) {
  const router = useRouter();
  // Moves the pill straight away; the page catches up when the refresh lands.
  const [shown, setShown] = useState(mode);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = saving || refreshing;

  async function choose(next: WarMode) {
    if (!isOfficer || busy || next === shown) return;
    const confirmed = window.confirm(
      next === "bigThings"
        ? "Switch the whole alliance to Big Things mode?\n\nEveryone places 1 defender and the Attack page shows the 10-node map. Your regular plans are kept and come back when you switch back."
        : "Switch the whole alliance back to regular war mode?\n\nYour Big Things plans are kept and come back when you switch again."
    );
    if (!confirmed) return;

    setError(null);
    setSaving(true);
    setShown(next);
    try {
      const res = await fetch("/api/war-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShown(mode);
        setError(data.error ?? "Couldn't change the war mode.");
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setShown(mode);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const index = WAR_MODES.indexOf(shown);

  return (
    <div className="w-full sm:w-auto">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-parchment-faint">
        War mode
        {busy && <Loader2 size={12} className="animate-spin text-brass-bright" aria-hidden />}
      </div>
      <div
        role="radiogroup"
        aria-label="War mode"
        className="relative grid grid-cols-2 w-full sm:w-64 p-1 rounded-xl border border-ink-line/80 bg-ink-panel/80 shadow-panel"
        title={isOfficer ? undefined : "Officers can change the war mode."}
      >
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-1 rounded-lg bg-gradient-to-b from-brass-bright to-brass shadow-[0_4px_14px_-4px_rgba(246,200,97,0.6)] transition-transform duration-300 ease-[cubic-bezier(.34,1.3,.64,1)]"
          style={{ width: "calc(50% - 4px)", transform: `translateX(${index * 100}%)` }}
        />
        {WAR_MODES.map((option) => {
          const active = option === shown;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!isOfficer || busy}
              onClick={() => choose(option)}
              className={`relative z-10 px-3 py-1.5 rounded-lg font-display text-sm font-semibold uppercase tracking-wider whitespace-nowrap transition-colors duration-300 disabled:cursor-default ${
                active ? "text-ink" : `text-parchment-dim ${isOfficer ? "hover:text-parchment" : ""}`
              }`}
            >
              {WAR_MODE_LABELS[option]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-crimson-bright">{error}</p>}
    </div>
  );
}
