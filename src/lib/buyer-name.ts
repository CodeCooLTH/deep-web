/**
 * buyer-name.ts — ชื่อลูกค้าที่ฝั่งร้านเห็นบนออเดอร์ (SSOT · 2026-10-04)
 *
 * ออเดอร์มีชื่อลูกค้าได้ 2 แหล่ง:
 *   1. `Order.buyerName` — ชื่อที่ร้านกรอกตอนสร้าง (ฟอร์มบังคับกรอก) ร้านมักใส่ข้อมูลที่ตัวเองใช้จำ
 *      ไว้ด้วย เช่น ทะเบียนรถ `4กฐ9100 คุณบุญคอง`
 *   2. `User.displayName` — ชื่อบัญชีของลูกค้าที่ล็อกอินยืนยันออเดอร์ (มาจาก Facebook/LINE/Apple
 *      ตอนสมัคร หรือเป็นชื่อที่ระบบตั้งให้)
 *
 * 🛑 เดิมหน้ารายการ/หน้ารายละเอียดเอาข้อ 2 ทับข้อ 1 ⇒ พอลูกค้าล็อกอิน ชื่อที่ร้านกรอกหายจากจอ
 *    และค้นหาด้วยทะเบียนไม่เจอ (ร้านแจ้ง 2026-10-04) — มติ user: **ชื่อที่ร้านกรอกเป็นชื่อหลักเสมอ**
 *    ชื่อบัญชีเป็นบรรทัดรอง
 *
 * ทุกจอที่โชว์ชื่อลูกค้าของออเดอร์ฝั่งร้านต้องผ่านฟังก์ชันนี้ ห้ามเขียน `displayName ?? buyerName` เอง (HR16)
 */

/**
 * ชื่อบัญชีที่ระบบตั้งให้เอง ไม่ใช่ชื่อคน — โชว์แล้วไม่มีประโยชน์
 *   - `"User"`      → OAuth ที่ผู้ให้บริการไม่ส่งชื่อมา (`src/lib/auth.ts` ตอนสร้างบัญชี)
 *   - `"User_1234"` → สมัครด้วยเบอร์โทร (`src/services/user.service.ts` = `User_` + เบอร์ 4 ตัวท้าย)
 */
const PLACEHOLDER_ACCOUNT_NAME_RE = /^User(_\d{4})?$/

function collapse(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export function isPlaceholderAccountName(name: string | null | undefined): boolean {
  return PLACEHOLDER_ACCOUNT_NAME_RE.test(collapse(name))
}

export type OrderBuyerName = {
  /** ชื่อหลัก — ชื่อที่ร้านกรอก · ไม่มีค่อยใช้ชื่อบัญชี · ไม่มีทั้งคู่ = null (ผู้เรียกเลือกคำแทนเอง) */
  name: string | null
  /**
   * ชื่อบัญชีสำหรับบรรทัดรอง — null เมื่อ:
   * ไม่มีบัญชี · เป็นชื่อที่ระบบตั้งให้ · ซ้ำกับชื่อหลัก · ชื่อหลักมาจากบัญชีอยู่แล้ว
   */
  accountName: string | null
}

export function resolveOrderBuyerName(input: {
  /** `Order.buyerName` */
  typedName: string | null | undefined
  /** `User.displayName` ของผู้ซื้อที่ผูกกับออเดอร์ (null = ยังไม่มีบัญชี) */
  accountName: string | null | undefined
}): OrderBuyerName {
  const typed = collapse(input.typedName)
  const raw = collapse(input.accountName)
  const account = raw && !isPlaceholderAccountName(raw) ? raw : ''

  if (!typed) return { name: account || null, accountName: null }
  const sameAsTyped = account.toLowerCase() === typed.toLowerCase()
  return { name: typed, accountName: account && !sameAsTyped ? account : null }
}
