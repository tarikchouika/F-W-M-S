// HRMP — محدد المعدل في الذاكرة (SPEC §6: «Rate limiting على تسجيل الدخول وتسجيل الحضور»)
// نافذة منزلقة لكل مفتاح (مستخدم+غرض) — محدد لكل نسخة خادم (خادم واحد محلي أو منطقة واحدة سحابية)

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

/** هل يُسمح بالطلب؟ يحدّث العدّاد — المفتاح مثلًا: attendance:<userId> */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // تنظيف دوري خفيف يمنع تضخّم الذاكرة (كل دقيقة)
  if (now - lastSweep > 60_000) {
    for (const [k, arr] of buckets) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length === 0) buckets.delete(k);
      else buckets.set(k, kept);
    }
    lastSweep = now;
  }

  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfterMs = Math.max(0, arr[0] + windowMs - now);
    buckets.set(key, arr);
    return { allowed: false, retryAfterMs };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { allowed: true, retryAfterMs: 0 };
}
