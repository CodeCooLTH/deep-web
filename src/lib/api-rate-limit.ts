// General per-IP rate-limit (NFR-2.3) — in-memory globalThis singleton
// pattern เดียวกับ src/lib/sms-consume-rl.ts (route handler เป็นคนละ module instance →
// ต้อง globalThis เพื่อ share ใน process เดียว)
// Known-gap: บน Vercel serverless = best-effort per-instance ไม่ใช่ hard global (Redis = Phase 2)

const g = globalThis as unknown as { apiRlTimestamps?: Map<string, number[]> }
const store = g.apiRlTimestamps ?? (g.apiRlTimestamps = new Map<string, number[]>())

/**
 * sliding-window per key. นับทุก attempt (ไม่ใช่เฉพาะ fail)
 * @returns true = ยังไม่เกิน quota, false = เกิน → caller ตอบ 429
 */
export function checkApiRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const recent = (store.get(key) ?? []).filter((t) => t > cutoff)
  if (recent.length >= max) {
    store.set(key, recent) // trim stale แต่ไม่เพิ่ม slot
    return false
  }
  recent.push(now)
  store.set(key, recent)
  return true
}

/** ดึง client IP จาก header ของ Vercel (x-real-ip ก่อน, fallback x-forwarded-for leftmost) */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}
