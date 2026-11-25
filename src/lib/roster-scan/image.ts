import sharp from "sharp";

export type RgbImage = { width: number; height: number; data: Buffer }; // 3 channels

export async function loadRgb(input: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(input).rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export type Box = { x: number; y: number; w: number; h: number };

export function clampBox(img: RgbImage, b: Box): Box {
  const x = Math.max(0, Math.round(b.x));
  const y = Math.max(0, Math.round(b.y));
  const w = Math.max(1, Math.min(img.width - x, Math.round(b.w)));
  const h = Math.max(1, Math.min(img.height - y, Math.round(b.h)));
  return { x, y, w, h };
}

export function crop(img: RgbImage, box: Box): RgbImage {
  const b = clampBox(img, box);
  const out = Buffer.alloc(b.w * b.h * 3);
  for (let r = 0; r < b.h; r++) {
    const src = ((b.y + r) * img.width + b.x) * 3;
    img.data.copy(out, r * b.w * 3, src, src + b.w * 3);
  }
  return { width: b.w, height: b.h, data: out };
}

export function toSharp(img: RgbImage) {
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } });
}

export async function toPng(img: RgbImage): Promise<Buffer> {
  return toSharp(img).png().toBuffer();
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}
