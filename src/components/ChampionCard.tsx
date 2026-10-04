"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { getChampionArt } from "@/lib/champion-art";

export type ChampionCardStats = {
  stars?: number | null;
  rank?: number | null;
  /** Ascension level: 0 = not ascended, 1-3 = level. */
  ascended?: number | null;
  sigLevel?: number | null;
  awakened?: boolean | null;
};

/** "★7 R4 A1 S160" — parts with no value are left out, and A only when ascended. */
export function formatStatBar(stats: ChampionCardStats): string {
  const parts: string[] = [];
  if (stats.stars != null) parts.push(`★${stats.stars}`);
  if (stats.rank != null) parts.push(`R${stats.rank}`);
  if (stats.ascended != null && stats.ascended > 0) parts.push(`A${stats.ascended}`);
  if (stats.sigLevel != null) parts.push(`S${stats.sigLevel}`);
  return parts.join(" ");
}

// The stat bar scales with the card's own width (container query units),
// clamped so it stays legible on tiny cards.
const STAT_BAR_STYLE: CSSProperties = { fontSize: "clamp(8px, 10.5cqw, 12px)" };

// Hosts Next.js may resize and cache (must match images.remotePatterns in
// next.config.mjs). Anything else, including data: URLs, uses a plain lazy image.
const OPTIMIZED_IMAGE_HOSTS = new Set(["mcocscout.com"]);

function canOptimize(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && OPTIMIZED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Cards are ~100-130px wide on phones and at most ~200px elsewhere.
const POSTER_SIZES = "(max-width: 640px) 34vw, 200px";
const BANNER_SIZES = "(max-width: 640px) 100vw, 384px";

export default function ChampionCard({
  name,
  imageUrl,
  onClick,
  selected = false,
  taken = false,
  size = "md",
  aspect = "poster",
  details,
  stats,
  showName = true,
  badge,
  eager = false,
  accent
}: {
  name: string;
  imageUrl?: string | null;
  onClick?: () => void;
  selected?: boolean;
  /** Red ring: the champion is already a defender for someone else. `selected` (gold) wins if both are set. */
  taken?: boolean;
  size?: "sm" | "md";
  /** "poster" = portrait grid tile (2:3). "banner" = wide header crop (3:1). */
  aspect?: "poster" | "banner";
  /** Small text shown under the card, below the name (e.g. owner, PI, action hint). */
  details?: React.ReactNode;
  /** Compact stat bar along the bottom of the art: stars, rank, ascension, signature. */
  stats?: ChampionCardStats;
  /** Show the champion name under a poster card. Banners never show it. */
  showName?: boolean;
  /** Small content pinned to the top-right corner (e.g. a checkmark or count). */
  badge?: React.ReactNode;
  /** Accepted for callers but no longer drawn on the card; the stat bar shows ascension and awakening. */
  awakened?: boolean | null;
  /** Ascension level: 0 = not ascended, 1-3 = level, null = unknown. */
  ascended?: number | null;
  /** Load the image right away instead of lazily (needed for print copies that are never scrolled into view). */
  eager?: boolean;
  /** Class color, drawn as a small corner flag in the top-left of the art. */
  accent?: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const art = getChampionArt(name);
  const showImage = imageUrl && !imgError;
  const isBanner = aspect === "banner";

  const aspectClass = isBanner ? "aspect-[3/1]" : "aspect-[2/3]";
  const statBar = stats ? formatStatBar(stats) : "";
  const hasCaption = !isBanner && (showName || details);

  // Use a div for the card root so callers can safely place interactive controls
  // (for example a remove button) in the badge without creating invalid
  // <button><button> HTML, which causes React hydration errors.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? name : undefined}
      className={`group block w-full min-w-0 text-left transition-transform duration-200 ${
        onClick ? "cursor-pointer hover:-translate-y-1" : ""
      }`}
    >
      <div
        className={`relative w-full ${aspectClass} rounded-lg overflow-hidden bg-ink-raised transition-shadow duration-200 ${
          onClick && !selected && !taken ? "group-hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.9),0_0_18px_-6px_rgba(246,200,97,0.45)]" : ""
        } ${
          selected
            ? "ring-2 ring-brass-bright ring-offset-2 ring-offset-ink shadow-[0_0_18px_-2px_rgba(246,200,97,0.7)]"
            : taken
            ? "ring-2 ring-red-500 ring-offset-2 ring-offset-ink shadow-[0_0_18px_-2px_rgba(239,68,68,0.65)]"
            : "shadow-[0_6px_18px_-8px_rgba(0,0,0,0.8)]"
        }`}
        style={{ containerType: "inline-size" }}
      >
        {showImage && canOptimize(imageUrl!) ? (
          <Image
            src={imageUrl!}
            alt={name}
            fill
            sizes={isBanner ? BANNER_SIZES : POSTER_SIZES}
            loading={eager ? "eager" : "lazy"}
            onError={() => setImgError(true)}
            className={`object-cover object-top transition-transform duration-300 ${onClick ? "group-hover:scale-110" : ""}`}
          />
        ) : showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt={name}
            width={200}
            height={isBanner ? 67 : 300}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setImgError(true)}
            className={`absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 ${
              onClick ? "group-hover:scale-110" : ""
            }`}
          />
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${
              onClick ? "group-hover:scale-110" : ""
            }`}
            style={{ background: `linear-gradient(155deg, ${art.from}, ${art.to})` }}
          >
            <span
              className={`font-display text-white/85 ${size === "sm" ? "text-2xl" : "text-4xl"}`}
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
            >
              {art.initials}
            </span>
          </div>
        )}

        {isBanner && <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 to-black/0" />}

        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" aria-hidden />

        {accent && (
          <div
            className="pointer-events-none absolute left-0 top-0 z-20 w-[24%] max-w-9 aspect-square"
            style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent} 45%, transparent 46%)`, filter: `drop-shadow(0 0 6px ${accent})` }}
            aria-hidden
          />
        )}

        {badge && <div className="absolute top-1.5 right-1.5 z-10">{badge}</div>}

        {statBar && (
          <div
            className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/80 to-black/40 border-t border-white/10 px-1 py-[3%] text-center stat font-semibold leading-none whitespace-nowrap overflow-hidden text-ellipsis ${
              stats?.awakened ? "text-brass-bright" : "text-white"
            }`}
            style={STAT_BAR_STYLE}
            title={stats?.awakened ? `${statBar} · Awakened` : statBar}
          >
            {statBar}
          </div>
        )}

        {isBanner && (
          <div className="absolute inset-x-0 bottom-0 p-2">
            <div className="text-white font-medium leading-tight text-xs truncate">{name}</div>
          </div>
        )}
      </div>

      {hasCaption && (
        <div className="mt-1 min-w-0 px-0.5 leading-tight">
          {showName && (
            <div className={`text-parchment font-semibold truncate ${size === "sm" ? "text-[11px]" : "text-xs"}`} title={name}>
              {name}
            </div>
          )}
          {details}
        </div>
      )}
    </div>
  );
}
