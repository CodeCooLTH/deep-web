// feature 00023 Chat Auto-Reply — rule cache บน globalThis, TTL 60 วิ
// pattern เดียวกับ src/lib/api-rate-limit.ts (route handler อาจเป็นคนละ module
// instance ในบาง runtime -> ต้องใช้ globalThis เพื่อ share cache ในโพรเซสเดียวกัน)
//
// [ข้อห้าม] ห้าม cache `AutoReplyConfig` ผ่านไฟล์นี้ (TD-004) — `isEnabled` ต้องอ่านสดทุก
// ครั้ง ไม่งั้นร้านปิดสวิตช์แล้วระบบยังตอบต่ออีกสูงสุด 60 วินาที ขัด AC-015-02 ตรง ๆ
// ไฟล์นี้ cache ได้เฉพาะ "ชุดกฎ" (keyword + phrase + rule ของ shop) ที่ S-04 matcher ใช้
// อ่านบ่อยเท่านั้น ส่วน config ให้ auto-reply-config.service (S-03) อ่านจาก DB ตรงเสมอ
//
// [ข้อห้าม] ห้าม import Prisma ในไฟล์นี้ — รับ/คืนข้อมูลเป็น generic <T> เท่านั้น
// ผู้เรียก (S-03 rule service / S-04 matcher) เป็นคนกำหนด shape ของข้อมูลที่ cache เอง
//
// known-gap: Vercel serverless = per-instance cache ไม่ใช่ global จริงข้ามเครื่อง
// (เหมือน api-rate-limit.ts) — invalidateShop ล้างได้แค่ instance ที่ถูกเรียก
// instance อื่นจะยังเห็นค่าเก่าจนกว่า TTL จะหมดเอง (สูงสุด 60 วิ) — Redis = Phase 2

/** อายุ cache สูงสุดก่อนถือว่า stale ต้องอ่าน DB ใหม่ */
export const RULE_SET_CACHE_TTL_MS = 60_000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const g = globalThis as unknown as {
  autoReplyRuleSetCache?: Map<string, CacheEntry<unknown>>
}
const store = g.autoReplyRuleSetCache ?? (g.autoReplyRuleSetCache = new Map<string, CacheEntry<unknown>>())

/**
 * อ่านชุดกฎที่ cache ไว้ของร้าน — คืน `undefined` ถ้าไม่มี/หมดอายุแล้ว
 * (ผู้เรียกต้อง query DB แล้วเรียก `setRuleSetCache` ต่อเพื่ออุ่น cache ใหม่)
 */
export function getRuleSetCache<T>(shopId: string): T | undefined {
  const entry = store.get(shopId)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    store.delete(shopId)
    return undefined
  }
  return entry.data as T
}

/** เขียนชุดกฎของร้านลง cache ด้วย TTL 60 วินาที (นับใหม่ทุกครั้งที่เขียน) */
export function setRuleSetCache<T>(shopId: string, data: T): void {
  store.set(shopId, { data, expiresAt: Date.now() + RULE_SET_CACHE_TTL_MS })
}

/**
 * ล้าง cache ของร้านทันที — ต้องเรียกทุกครั้งที่ S-03 เขียน (สร้าง/แก้/ลบ)
 * AutoReplyKeyword / AutoReplyPhrase / AutoReplyRule ของร้านนั้น ห้ามรอ TTL หมดเอง
 * (ไม่งั้นร้านแก้กฎแล้วลูกค้ายังได้คำตอบเก่าอีกสูงสุด 60 วิ)
 */
export function invalidateShop(shopId: string): void {
  store.delete(shopId)
}
