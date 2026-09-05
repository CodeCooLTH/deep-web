// auto-order-draft-expiry — คำและโทนของ "ร่างนี้เหลือเวลาอีกเท่าไร" (00061 · หน้า C ข้อ 2)
//
// pure ทั้งไฟล์ — ตัวเลขที่ผู้ใช้เห็นบนป้ายเป็นสิ่งที่ต้องพิสูจน์ด้วยเทสได้โดยไม่ต้องแตะ DB
//
// 🛑 ป้ายนี้คือกลไก "แจ้งเตือนล่วงหน้า" ทั้งหมดที่ v1 มี — ไม่มี push ไม่มีอีเมล ⇒ ถ้าคำผิด
// หรือโทนไม่เปลี่ยนตอนใกล้หมด ผู้ขายจะไม่มีทางรู้เลยว่ากำลังจะเสียงานไป

export type DraftExpiryTone = 'muted' | 'warning' | 'danger'

export type DraftExpiryLabel = {
  text: string
  tone: DraftExpiryTone
  /** ข้อความเต็มสำหรับ screen reader — ป้ายสั้นบนจอไม่บอกว่าตัวเลขคืออะไร */
  ariaLabel: string
}

/** เปลี่ยนเป็นโทนเตือนเมื่อเหลือ ≤24 ชม. (มติ user — หน้า C ข้อ 2) */
export const DRAFT_EXPIRY_WARN_MS = 24 * 60 * 60 * 1000

/**
 * @param expiresAt เวลาหมดอายุของร่าง — `null` = แถวที่ไม่ใช่ร่าง (ผู้เรียกต้องไม่แสดงป้ายเลย)
 * @returns `null` เมื่อไม่มีอะไรต้องบอก
 */
export function describeDraftExpiry(
  expiresAt: Date | string | null | undefined,
  nowMs: number,
): DraftExpiryLabel | null {
  if (!expiresAt) return null
  const ms = (expiresAt instanceof Date ? expiresAt : new Date(expiresAt)).getTime()
  if (Number.isNaN(ms)) return null

  const remaining = ms - nowMs

  // 🛑 หมดอายุแล้วแต่ยังเห็นอยู่ = ตัวกวาดยังมาไม่ถึง (cron ทุก 2 นาที) — ต้องพูดตรง ๆ ว่า
  // "หมดอายุแล้ว" ไม่ใช่ "เหลือ 0 วัน" ซึ่งอ่านเหมือนยังทันอยู่
  if (remaining <= 0) {
    return { text: 'หมดอายุแล้ว', tone: 'danger', ariaLabel: 'ร่างนี้หมดอายุแล้ว รอระบบเก็บกวาด' }
  }

  const hours = Math.ceil(remaining / (60 * 60 * 1000))
  if (remaining <= DRAFT_EXPIRY_WARN_MS) {
    // ระดับชั่วโมงเมื่อใกล้หมด — "เหลือ 1 วัน" ตอนเหลือจริง 3 ชั่วโมงคือการบอกให้ชะล่าใจ
    return {
      text: `หมดอายุใน ${hours} ชม.`,
      tone: 'warning',
      ariaLabel: `ร่างนี้จะหมดอายุในอีก ${hours} ชั่วโมง`,
    }
  }

  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000))
  return {
    text: `หมดอายุใน ${days} วัน`,
    tone: 'muted',
    ariaLabel: `ร่างนี้จะหมดอายุในอีก ${days} วัน`,
  }
}

/**
 * เรียงร่าง "ใกล้หมดอายุก่อน"
 *
 * 🛑 เหตุผลที่ต้องเรียงต่างจากหน้าอื่น: ชิป "ร่าง" มีอยู่เพื่อ **งานที่กำลังจะหาย** ไม่ใช่
 * "ของใหม่ล่าสุด" — เรียงตาม `createdAt DESC` ตามค่าเริ่มต้นของหน้าจะดันใบที่เหลือเวลาน้อย
 * ที่สุดไปอยู่ล่างสุดพอดี ซึ่งกลับหัวกับเหตุผลที่ชิปนี้มีอยู่
 *
 * `expiresAt` เป็น timestamp คงที่ ⇒ **ลำดับไม่ขยับเองตามเวลา** (ไม่ใช่ค่าที่คำนวณจาก now)
 * แถวที่ไม่มี `expiresAt` (ไม่ใช่ร่าง) ไปท้ายสุดเสมอ
 */
export function compareByDraftExpiry(
  a: { expiresAt?: string | Date | null },
  b: { expiresAt?: string | Date | null },
): number {
  const av = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY
  const bv = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY
  return av - bv
}
