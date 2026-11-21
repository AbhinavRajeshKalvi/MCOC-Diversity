// Draws the War Room app icon and writes every size the web app needs into
// public/icons. Run with `node scripts/generate-icons.mjs` after changing the
// artwork; the PNGs it writes are committed.
//
// The mark is a brass shield with two crossed swords, on the app's dark ink
// background. src/components/BrandMark.tsx draws the same shapes in the UI.

import sharp from "sharp";
import { mkdir } from "fs/promises";

const OUT = new URL("../public/icons/", import.meta.url);

// The shield and swords in a 512 x 512 box, centred on (256, 262).
const SHIELD = "M256 70 L410 124 V248 C410 352 344 420 256 452 C168 420 102 352 102 248 V124 Z";
const SWORD =
  // Blade (tip up), crossguard, grip and pommel, centred on the origin.
  `<path d="M-17 -158 L0 -188 L17 -158 L17 66 L-17 66 Z"/>` +
  `<rect x="-54" y="64" width="108" height="22" rx="8"/>` +
  `<rect x="-12" y="86" width="24" height="48" rx="5"/>` +
  `<circle cx="0" cy="146" r="18"/>`;

function swords(fill, scale = 0.84) {
  return `<g fill="${fill}" transform="translate(256 268) scale(${scale})">
    <g transform="rotate(-42)">${SWORD}</g>
    <g transform="rotate(42)">${SWORD}</g>
  </g>`;
}

const DEFS = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#232733"/><stop offset="1" stop-color="#0D0F14"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.45" r="0.55">
    <stop offset="0" stop-color="#F6C861" stop-opacity="0.28"/><stop offset="1" stop-color="#F6C861" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="shield" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#F6C861"/><stop offset="0.55" stop-color="#E0A93B"/><stop offset="1" stop-color="#C2364E"/>
  </linearGradient>
</defs>`;

/** The shield and swords, scaled about the centre. */
function mark(scale) {
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="${SHIELD}" fill="url(#shield)"/>
    <path d="${SHIELD}" fill="none" stroke="#0D0F14" stroke-opacity="0.35" stroke-width="10" transform="translate(256 262) scale(0.86) translate(-256 -262)"/>
    ${swords("#0D0F14")}
  </g>`;
}

/** Full-bleed square: for maskable icons and the iOS home screen, which crop their own corners. */
function square(scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
    <rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#glow)"/>${mark(scale)}</svg>`;
}

/** Rounded tile with transparent corners: browser tabs and launchers that show the icon as is. */
function rounded() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
    <rect width="512" height="512" rx="112" fill="url(#bg)"/><rect width="512" height="512" rx="112" fill="url(#glow)"/>${mark(0.9)}</svg>`;
}

/** White silhouette on transparent, for Android's small status-bar notification badge. */
function badge() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><mask id="m"><rect width="512" height="512" fill="white"/>${swords("black")}</mask></defs>
    <path d="${SHIELD}" fill="white" mask="url(#m)"/></svg>`;
}

/** iPhone launch image: the logo tile centred on the app's dark background. */
function launchImage(width, height) {
  const tile = Math.round(Math.min(width, height) * 0.26);
  const x = Math.round((width - tile) / 2);
  const y = Math.round(height * 0.4 - tile / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="g" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#F6C861" stop-opacity="0.16"/><stop offset="1" stop-color="#F6C861" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#0D0F14"/><rect width="${width}" height="${height}" fill="url(#g)"/>
    <svg x="${x}" y="${y}" width="${tile}" height="${tile}" viewBox="0 0 512 512">${DEFS}
      <rect width="512" height="512" rx="112" fill="url(#bg)"/><rect width="512" height="512" rx="112" fill="url(#glow)"/>${mark(0.9)}</svg>
  </svg>`;
}

// Portrait iPhone screens: CSS width x height at the device pixel ratio.
export const LAUNCH_SIZES = [
  [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3],
  [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [360, 780, 3]
];

async function write(svg, size, name) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(name, OUT).pathname);
}

await mkdir(OUT, { recursive: true });
await mkdir(new URL("../public/splash/", import.meta.url), { recursive: true });
await Promise.all([
  ...LAUNCH_SIZES.map(([w, h, ratio]) =>
    sharp(Buffer.from(launchImage(w * ratio, h * ratio)))
      .png({ compressionLevel: 9, palette: true })
      .toFile(new URL(`../public/splash/launch-${w * ratio}x${h * ratio}.png`, import.meta.url).pathname)
  ),
  write(rounded(), 32, "favicon-32.png"),
  write(rounded(), 192, "icon-192.png"),
  write(rounded(), 512, "icon-512.png"),
  // Maskable icons keep the mark inside the centre 80% safe zone.
  write(square(0.68), 192, "maskable-192.png"),
  write(square(0.68), 512, "maskable-512.png"),
  write(square(0.86), 180, "apple-touch-icon.png"),
  write(badge(), 96, "badge-96.png")
]);
console.log("Icons written to public/icons.");
