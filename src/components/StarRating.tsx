"use client";

import { Star } from "lucide-react";

export default function StarRating({
  value,
  onChange,
  max = 7
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            size={22}
            className={n <= value ? "fill-brass text-brass" : "fill-transparent text-ink-line"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
