// A small in-memory limiter for sign-in, sign-up and password-reset requests.
// It is per server instance, which is enough to slow down password guessing
// on a single Render service.

const hits = new Map<string, number[]>();

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** True when `key` has made fewer than `limit` requests in the last `windowMs`; records this one. */
export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (times.every((time) => now - time >= windowMs)) hits.delete(k);
  }
  return true;
}
