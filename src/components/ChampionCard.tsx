"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowUp, Star } from "lucide-react";
import { getChampionArt } from "@/lib/champion-art";
import { ascensionLabel } from "@/lib/ascension";

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

// Badges and the stat bar scale with the card's own width (container query
// units), clamped so they stay legible on tiny cards and never crowd them.
const BADGE_STYLE: CSSProperties = {
  width: "clamp(14px, 17cqw, 24px)",
  height: "clamp(14px, 17cqw, 24px)",
  top: "clamp(3px, 4cqw, 6px)"
};
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
  size = "md",
  aspect = "poster",
  details,
  stats,
  showName = true,
  badge,
  awakened,
  ascended
}: {
  name: string;
  imageUrl?: string | null;
  onClick?: () => void;
  selected?: boolean;
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
  /** MCOC roster state indicators: ascended is top-left, awakened is top-right. */
  awakened?: boolean | null;
  /** Ascension level: 0 = not ascended, 1-3 = level, null = unknown. */
  ascended?: number | null;
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
        className={`relative w-full ${aspectClass} rounded-lg overflow-hidden transition-shadow duration-200 ${
          onClick ? "group-hover:shadow-xl group-hover:shadow-black/40" : ""
        } ${selected ? "ring-2 ring-brass ring-offset-2 ring-offset-ink" : ""}`}
        style={{ containerType: "inline-size" }}
      >
        {showImage && canOptimize(imageUrl!) ? (
          <Image
            src={imageUrl!}
            alt={name}
            fill
            sizes={isBanner ? BANNER_SIZES : POSTER_SIZES}
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
            loading="lazy"
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

        {ascended !== undefined && (
          <div
            className={`absolute z-10 flex items-center justify-center rounded-full border ${
              ascended != null && ascended > 0
                ? "border-violet-300/80 bg-violet-950/90 text-violet-200"
                : ascended === 0
                  ? "border-white/20 bg-black/70 text-white/35"
                  : "border-white/20 bg-black/70 text-white/45"
            }`}
            style={{ ...BADGE_STYLE, left: BADGE_STYLE.top }}
            title={ascensionLabel(ascended)}
            aria-label={ascensionLabel(ascended)}
          >
            <ArrowUp className="h-[60%] w-[60%]" strokeWidth={2.5} />
          </div>
        )}

        {awakened !== undefined && (
          <div
            className={`absolute z-10 flex items-center justify-center rounded-full border ${
              awakened === true
                ? "border-brass-bright/80 bg-black/80 text-brass-bright"
                : awakened === false
                  ? "border-white/20 bg-black/70 text-white/35"
                  : "border-white/20 bg-black/70 text-white/45"
            }`}
            style={{ ...BADGE_STYLE, right: BADGE_STYLE.top }}
            title={awakened === true ? "Awakened" : awakened === false ? "Not awakened" : "Awakening unknown"}
            aria-label={awakened === true ? "Awakened" : awakened === false ? "Not awakened" : "Awakening unknown"}
          >
            <Star className="h-[60%] w-[60%]" strokeWidth={2.5} fill={awakened === true ? "currentColor" : "none"} />
          </div>
        )}

        {badge && <div className="absolute top-1.5 right-1.5 z-10">{badge}</div>}

        {statBar && (
          <div
            className={`absolute inset-x-0 bottom-0 z-10 bg-black/75 px-1 py-[3%] text-center stat font-semibold leading-none whitespace-nowrap overflow-hidden text-ellipsis ${
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
            <div className={`text-parchment font-medium truncate ${size === "sm" ? "text-[11px]" : "text-xs"}`} title={name}>
              {name}
            </div>
          )}
          {details}
        </div>
      )}
    </div>
  );
}
