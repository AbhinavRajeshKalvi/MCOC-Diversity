"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The BG 1/2/3 switcher. The gold highlight slides from the old tab to the new
 * one instead of jumping.
 */
export default function SlidingTabs({
  tabs,
  active,
  onSelect
}: {
  tabs: { key: string | number; label: React.ReactNode }[];
  active: number;
  onSelect: (index: number) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // No slide on first paint, only when the tab changes.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    function measure() {
      const el = buttons.current[active];
      if (el) setIndicator({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, tabs.length]);

  return (
    <div className="relative flex w-full sm:inline-flex sm:w-auto flex-wrap gap-1 mb-6 p-1 rounded-xl border border-ink-line/80 bg-ink-panel/80 shadow-panel">
      {indicator && (
        <span
          aria-hidden
          className="absolute rounded-lg bg-gradient-to-b from-brass-bright to-brass shadow-[0_4px_14px_-4px_rgba(246,200,97,0.6)]"
          style={{
            left: 0,
            top: 0,
            width: indicator.width,
            height: indicator.height,
            transform: `translate(${indicator.left}px, ${indicator.top}px)`,
            transition: animate ? "transform 340ms cubic-bezier(.34,1.3,.64,1), width 340ms ease" : undefined
          }}
        />
      )}
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          onClick={() => {
            setAnimate(true);
            onSelect(i);
          }}
          className={`relative z-10 flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg font-display text-base font-semibold uppercase tracking-wider whitespace-nowrap transition-colors duration-300 ${
            i === active
              ? `text-ink ${indicator ? "" : "bg-gradient-to-b from-brass-bright to-brass"}`
              : "text-parchment-dim hover:text-parchment hover:bg-white/[0.05]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
