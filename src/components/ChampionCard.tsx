"use client";

import { useState } from "react";
import { ArrowUp, Star } from "lucide-react";
import { getChampionArt } from "@/lib/champion-art";
import { ascensionLabel } from "@/lib/ascension";

export default function ChampionCard({
  name,
  imageUrl,
  onClick,
  selected = false,
  size = "md",
  aspect = "poster",
  overlay,
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
  /** Content pinned to the bottom of the card, over a gradient scrim (e.g. stats). */
  overlay?: React.ReactNode;
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

  const aspectClass = aspect === "banner" ? "aspect-[3/1]" : "aspect-[2/3]";

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
      className={`group relative block w-full ${aspectClass} rounded-lg overflow-hidden text-left
        transition-all duration-200 ${
          onClick ? "cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40" : ""
        } ${selected ? "ring-2 ring-brass ring-offset-2 ring-offset-ink" : ""}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt={name}
          onError={() => setImgError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 ${
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

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 to-black/0" />

      {ascended !== undefined && (
        <div
          className={`absolute top-1.5 left-1.5 z-10 flex h-6 min-w-6 items-center justify-center gap-px rounded-full border backdrop-blur-sm ${
            ascended != null && ascended > 0
              ? "border-violet-300/80 bg-violet-950/80 text-violet-200 px-1"
              : ascended === 0
                ? "border-white/20 bg-black/50 text-white/35 w-6"
                : "border-white/20 bg-black/50 text-white/45 w-6"
          }`}
          title={ascensionLabel(ascended)}
          aria-label={ascensionLabel(ascended)}
        >
          <ArrowUp size={13} strokeWidth={2.5} />
          {ascended != null && ascended > 0 && <span className="stat text-[11px] font-semibold leading-none">{ascended}</span>}
        </div>
      )}

      {awakened !== undefined && (
        <div
          className={`absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur-sm ${
            awakened === true
              ? "border-brass-bright/80 bg-black/65 text-brass-bright"
              : awakened === false
                ? "border-white/20 bg-black/50 text-white/35"
                : "border-white/20 bg-black/50 text-white/45"
          }`}
          title={awakened === true ? "Awakened" : awakened === false ? "Not awakened" : "Awakening unknown"}
          aria-label={awakened === true ? "Awakened" : awakened === false ? "Not awakened" : "Awakening unknown"}
        >
          <Star size={13} strokeWidth={2.5} fill={awakened === true ? "currentColor" : "none"} />
        </div>
      )}

      {badge && <div className="absolute top-1.5 right-1.5 z-10">{badge}</div>}

      <div className="absolute inset-x-0 bottom-0 p-2">
        <div className={`text-white font-medium leading-tight ${size === "sm" ? "text-[11px]" : "text-xs"}`}>
          {name}
        </div>
        {overlay}
      </div>
    </div>
  );
}
