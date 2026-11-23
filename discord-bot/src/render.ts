import path from "path";
import { GlobalFonts, createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { Db } from "mongodb";
import { getChampionArt } from "../../src/lib/champion-art";
import { normalizeAscension } from "../../src/lib/ascension";
import type { ObjectId } from "./store";

// Draws a member's roster as one picture: a grid of champion cards, grouped
// by star level, each with the portrait, class flag, stars, rank, ascension,
// sig level and PI. Looks like the app's champion cards.

const fontDir = (pkg: string) => path.join(path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)), "files");
GlobalFonts.registerFromPath(path.join(fontDir("barlow-condensed"), "barlow-condensed-latin-700-normal.woff2"), "WR Display");
GlobalFonts.registerFromPath(path.join(fontDir("barlow-condensed"), "barlow-condensed-latin-500-normal.woff2"), "WR Body");
GlobalFonts.registerFromPath(path.join(fontDir("jetbrains-mono"), "jetbrains-mono-latin-700-normal.woff2"), "WR Mono");

const C = {
  ink: "#0D0F14",
  panel: "#161920",
  raised: "#20232C",
  line: "#2F333F",
  parchment: "#EEF0F7",
  dim: "#A3A9C2",
  faint: "#6E7591",
  brass: "#E0A93B",
  brassBright: "#F6C861"
};
const CLASS_COLORS: Record<string, string> = {
  Cosmic: "#38BDF8",
  Tech: "#60A5FA",
  Mutant: "#FACC15",
  Skill: "#F87171",
  Science: "#4ADE80",
  Mystic: "#C084FC"
};

export type RosterCard = {
  name: string;
  imageUrl: string | null;
  championClass: string | null;
  stars: number | null;
  rank: number | null;
  ascended: number | null;
  sig: number | null;
  rating: number | null;
  awakened: boolean | null;
};

/** Everything needed to draw a member's roster, strongest first. */
export async function loadRosterCards(db: Db, userId: ObjectId): Promise<RosterCard[]> {
  const rows = await db
    .collection("rosterEntries")
    .aggregate([
      { $match: { userId } },
      { $lookup: { from: "champions", localField: "championId", foreignField: "_id", as: "champion" } },
      { $unwind: "$champion" },
      { $lookup: { from: "counterProfiles", localField: "championId", foreignField: "championId", as: "profile" } }
    ])
    .toArray();
  return rows
    .map((row) => ({
      name: String(row.champion.name),
      imageUrl: row.champion.imageUrl ?? null,
      championClass: row.profile?.[0]?.championClass ?? null,
      stars: row.stars ?? null,
      rank: row.rank ?? null,
      ascended: normalizeAscension(row.ascended),
      sig: row.sigLevel ?? null,
      rating: typeof row.rating === "number" ? row.rating : null,
      awakened: row.awakened ?? null
    }))
    .sort(
      (a, b) =>
        (b.stars ?? 0) - (a.stars ?? 0) ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.rank ?? 0) - (a.rank ?? 0) ||
        a.name.localeCompare(b.name)
    );
}

// ---------------------------------------------------------------- portraits

const imageCache = new Map<string, Promise<Image | null>>();
const MAX_CACHED = 600;

async function fetchImage(url: string): Promise<Image | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "WarRoomBot/1.0" } });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

function portrait(url: string | null): Promise<Image | null> {
  if (!url) return Promise.resolve(null);
  let cached = imageCache.get(url);
  if (!cached) {
    cached = fetchImage(url).then((image) => {
      if (!image) imageCache.delete(url); // try again next time
      return image;
    });
    imageCache.set(url, cached);
    if (imageCache.size > MAX_CACHED) imageCache.delete(imageCache.keys().next().value!);
  }
  return cached;
}

/** Loads portraits a few at a time. */
async function loadPortraits(urls: (string | null)[]): Promise<(Image | null)[]> {
  const out: (Image | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      while (next < urls.length) {
        const index = next++;
        out[index] = await portrait(urls[index]);
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------- drawing

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A five-point star, drawn as a shape so it never depends on a font. */
function star(ctx: SKRSContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function drawCover(ctx: SKRSContext2D, image: Image, x: number, y: number, w: number, h: number) {
  // object-fit: cover, anchored to the top (faces are near the top).
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.width - sw) / 2;
  ctx.drawImage(image, sx, 0, sw, sh, x, y, w, h);
}

const CARD_W = 132;
const ART_H = 176;
const CAPTION_H = 40;
const GAP = 12;
const PAD = 28;

function drawCard(ctx: SKRSContext2D, card: RosterCard, image: Image | null, x: number, y: number) {
  // Art
  ctx.save();
  roundRect(ctx, x, y, CARD_W, ART_H, 10);
  ctx.clip();
  if (image) {
    ctx.fillStyle = C.raised;
    ctx.fillRect(x, y, CARD_W, ART_H);
    drawCover(ctx, image, x, y, CARD_W, ART_H);
  } else {
    const art = getChampionArt(card.name);
    const gradient = ctx.createLinearGradient(x, y, x + CARD_W * 0.6, y + ART_H);
    gradient.addColorStop(0, art.from);
    gradient.addColorStop(1, art.to);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, CARD_W, ART_H);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = '44px "WR Display"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(art.initials, x + CARD_W / 2, y + ART_H / 2 - 10);
  }

  // Class flag in the top-left corner.
  const classColor = card.championClass ? CLASS_COLORS[card.championClass] : null;
  if (classColor) {
    ctx.fillStyle = classColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 30, y);
    ctx.lineTo(x, y + 30);
    ctx.closePath();
    ctx.fill();
  }

  // Stat bar along the bottom of the art.
  const barH = 26;
  const bar = ctx.createLinearGradient(x, y + ART_H - barH - 14, x, y + ART_H);
  bar.addColorStop(0, "rgba(0,0,0,0)");
  bar.addColorStop(0.35, "rgba(0,0,0,0.8)");
  bar.addColorStop(1, "rgba(0,0,0,0.95)");
  ctx.fillStyle = bar;
  ctx.fillRect(x, y + ART_H - barH - 14, CARD_W, barH + 14);
  ctx.restore();

  const parts = [
    card.rank != null ? `R${card.rank}` : null,
    card.ascended ? `A${card.ascended}` : null,
    card.sig != null ? `S${card.sig}` : null
  ].filter(Boolean) as string[];
  const statColor = card.awakened ? C.brassBright : "#FFFFFF";
  ctx.font = '13px "WR Mono"';
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const starText = card.stars != null ? String(card.stars) : "";
  const rest = parts.length ? ` ${parts.join(" ")}` : "";
  const starW = card.stars != null ? 12 : 0;
  const total = starW + ctx.measureText(starText + rest).width;
  let cx = x + (CARD_W - total) / 2;
  const cy = y + ART_H - barH / 2 - 1;
  if (card.stars != null) {
    ctx.fillStyle = C.brassBright;
    star(ctx, cx + 5, cy, 5.5);
    cx += starW;
  }
  ctx.fillStyle = statColor;
  ctx.fillText(starText + rest, cx, cy + 1);

  // Thin frame
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, CARD_W - 1, ART_H - 1, 10);
  ctx.stroke();

  // Name and PI under the card.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.parchment;
  ctx.font = '16px "WR Display"';
  ctx.fillText(fitText(ctx, card.name, CARD_W - 4), x + CARD_W / 2, y + ART_H + 17);
  ctx.fillStyle = card.rating ? C.brass : C.faint;
  ctx.font = '12px "WR Mono"';
  ctx.fillText(card.rating ? `PI ${card.rating.toLocaleString("en-US")}` : "PI —", x + CARD_W / 2, y + ART_H + 33);
}

/**
 * The roster picture as a JPEG. Columns grow with the roster so very big
 * rosters stay a sensible shape.
 */
export async function renderRoster(
  cards: RosterCard[],
  info: { displayName: string; battlegroup: number | null; allianceName: string }
): Promise<Buffer> {
  const columns = cards.length > 160 ? 12 : cards.length > 60 ? 10 : 8;
  const groups: { label: string; cards: RosterCard[] }[] = [];
  for (const card of cards) {
    const label = card.stars ? `${card.stars}-STAR` : "OTHER";
    const group = groups[groups.length - 1];
    if (group?.label === label) group.cards.push(card);
    else groups.push({ label, cards: [card] });
  }

  const HEADER_H = 96;
  const GROUP_H = 40;
  const ROW_H = ART_H + CAPTION_H + GAP;
  const width = PAD * 2 + columns * CARD_W + (columns - 1) * GAP;
  const height =
    HEADER_H +
    groups.reduce((sum, g) => sum + GROUP_H + Math.ceil(g.cards.length / columns) * ROW_H, 0) +
    PAD +
    (cards.length === 0 ? 80 : 0);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, C.panel);
  bg.addColorStop(1, C.ink);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = C.brass;
  ctx.fillRect(0, 0, width, 4);

  // Header
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = C.parchment;
  ctx.font = '40px "WR Display"';
  ctx.fillText(info.displayName.toUpperCase(), PAD, 54);
  const nameW = ctx.measureText(info.displayName.toUpperCase()).width;
  ctx.fillStyle = C.dim;
  ctx.font = '20px "WR Body"';
  const sub = [info.allianceName, info.battlegroup ? `BG ${info.battlegroup}` : null].filter(Boolean).join(" · ");
  ctx.fillText(sub, PAD + nameW + 16, 54);
  const totalPi = cards.reduce((sum, c) => sum + (c.rating ?? 0), 0);
  ctx.fillStyle = C.faint;
  ctx.font = '15px "WR Mono"';
  ctx.fillText(
    `${cards.length} champions${totalPi ? ` · total PI ${totalPi.toLocaleString("en-US")}` : ""}`,
    PAD,
    80
  );
  ctx.textAlign = "right";
  ctx.fillStyle = C.brass;
  ctx.font = '18px "WR Display"';
  ctx.fillText("WAR ROOM", width - PAD, 54);

  if (cards.length === 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = C.dim;
    ctx.font = '22px "WR Body"';
    ctx.fillText("No champions on this roster yet.", PAD, HEADER_H + 40);
    return canvas.encode("jpeg", 88);
  }

  const images = await loadPortraits(cards.map((c) => c.imageUrl));
  let y = HEADER_H;
  let index = 0;
  for (const group of groups) {
    ctx.textAlign = "left";
    ctx.fillStyle = C.brass;
    ctx.font = '22px "WR Display"';
    ctx.fillText(group.label, PAD, y + 26);
    const labelW = ctx.measureText(group.label).width;
    ctx.fillStyle = C.faint;
    ctx.font = '14px "WR Mono"';
    ctx.fillText(String(group.cards.length), PAD + labelW + 10, y + 26);
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD + labelW + 40, y + 20, width - PAD * 2 - labelW - 40, 1);
    y += GROUP_H;
    group.cards.forEach((card, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      drawCard(ctx, card, images[index + i], PAD + col * (CARD_W + GAP), y + row * ROW_H);
    });
    index += group.cards.length;
    y += Math.ceil(group.cards.length / columns) * ROW_H;
  }
  return canvas.encode("jpeg", 88);
}
