import { useId } from "react";

// The War Room logo: a brass shield with crossed swords on a dark tile. The
// app icons in public/icons are drawn from the same shapes by
// scripts/generate-icons.mjs, so keep the two in step.

const SHIELD = "M256 70 L410 124 V248 C410 352 344 420 256 452 C168 420 102 352 102 248 V124 Z";

function Sword({ angle }: { angle: number }) {
  return (
    <g transform={`rotate(${angle})`}>
      <path d="M-17 -158 L0 -188 L17 -158 L17 66 L-17 66 Z" />
      <rect x="-54" y="64" width="108" height="22" rx="8" />
      <rect x="-12" y="86" width="24" height="48" rx="5" />
      <circle cx="0" cy="146" r="18" />
    </g>
  );
}

export default function BrandMark({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 512 512" className={`brand-mark-svg shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#232733" />
          <stop offset="1" stopColor="#0D0F14" />
        </linearGradient>
        <radialGradient id={`${id}glow`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" stopColor="#F6C861" stopOpacity="0.28" />
          <stop offset="1" stopColor="#F6C861" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}shield`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#F6C861" />
          <stop offset="0.55" stopColor="#E0A93B" />
          <stop offset="1" stopColor="#C2364E" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${id}bg)`} />
      <rect width="512" height="512" rx="112" fill={`url(#${id}glow)`} />
      <g transform="translate(256 256) scale(0.9) translate(-256 -256)">
        <path d={SHIELD} fill={`url(#${id}shield)`} />
        <path
          d={SHIELD}
          fill="none"
          stroke="#0D0F14"
          strokeOpacity={0.35}
          strokeWidth={10}
          transform="translate(256 262) scale(0.86) translate(-256 -262)"
        />
        <g fill="#0D0F14" transform="translate(256 268) scale(0.84)">
          <Sword angle={-42} />
          <Sword angle={42} />
        </g>
      </g>
    </svg>
  );
}
