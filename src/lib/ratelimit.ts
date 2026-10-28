const hits = new Map<string, number[]>();
/** Sliding window limiter, per instance. Good enough for a demo on serverless. */
export function rateLimit(key: string, limit = 12, windowMs = 60_000, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
