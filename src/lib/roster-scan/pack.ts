// Transfer-only compact feature encoding: unmasked cells, 6-bit signed.
import { MASK, FW, FH, FEATURE_LEN } from "./portrait";
const N = FW * FH;
const IDX: number[] = []; for (let c = 0; c < 3; c++) for (let i = 0; i < N; i++) if (MASK[i]) IDX.push(c * N + i);
export function unpack6(s: string): Float32Array {
  const bytes = Buffer.from(s, "base64");
  const f = new Float32Array(FEATURE_LEN);
  let acc = 0, n = 0, k = 0;
  for (const by of bytes) { acc = ((acc << 8) | by) & 0xffff; n += 8; while (n >= 6 && k < IDX.length) { n -= 6; f[IDX[k++]] = ((acc >> n) & 63) - 32; } }
  let norm = 0; for (let i = 0; i < f.length; i++) norm += f[i] * f[i]; norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}
