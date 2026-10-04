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
 *
 * 🛑 **ร้านบริการเท่านั้น** (มติ user 2026-10-04 หลัง #103 ขึ้นทุกประเภทร้าน): ร้านขายของ/บ้านพัก
 *    กลับเป็นพฤติกรรมเดิมทุกอย่าง (ชื่อบัญชีมาก่อน · ไม่มีบรรทัดรอง · การ์ดผู้ซื้อโชว์ `@username`)
 *    ตัวตัดสินเดียวคือ `usesTypedBuyerName()` — ห้ามเขียน `vertical === 'SERVICE_QUEUE'` สดที่จุดใช้งาน
 */
import { resolveShopVertical } from '@/lib/lodging'

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

/** ร้านนี้ใช้กติกา "ชื่อที่ร้านกรอกเป็นชื่อหลัก" ไหม — ร้านบริการเท่านั้น · ค่าแปลก/ว่าง = กติกาเดิม */
export function usesTypedBuyerName(vertical: string | null | undefined): boolean {
  return resolveShopVertical(vertical) === 'SERVICE_QUEUE'
}

/**
 * ชื่อลูกค้าตามประเภทร้าน — ร้านบริการได้กติกาใหม่ ร้านอื่นได้ **ของเดิมก่อน #103 ทุกตัวอักษร**
 * (ของเดิม = `displayName ?? buyerName` ไม่มีบรรทัดรอง)
 */
export function resolveOrderBuyerNameForShop(
  vertical: string | null | undefined,
  input: { typedName: string | null | undefined; accountName: string | null | undefined },
): OrderBuyerName {
  if (usesTypedBuyerName(vertical)) return resolveOrderBuyerName(input)
  return { name: input.accountName ?? input.typedName ?? null, accountName: null }
}

/**
 * ชื่อบนการ์ด "ผู้ซื้อ" หน้ารายละเอียดออเดอร์ — ชื่อหลัก + บรรทัดรอง (คำพร้อมแสดง)
 *
 * - ร้านบริการ (`typedNameFirst`): ชื่อที่ร้านกรอก / `บัญชี: <ชื่อบัญชี>` — เลิกโชว์ `@username`
 *   เพราะเป็นรหัสที่ระบบตั้งให้ (`fb1234…`) ร้านอ่านแล้วไม่รู้ว่าใคร
 * - ร้านอื่น: **ของเดิมก่อน #103 ทุกตัวอักษร** — ชื่อบัญชี/username มาก่อน · บรรทัดรอง `@username`
 */
export function resolveBuyerCardNames(input: {
  typedNameFirst: boolean
  typedName: string | null | undefined
  accountName: string | null | undefined
  username: string | null | undefined
  hasContact: boolean
}): { displayName: string | null; subLabel: string; hasBuyerInfo: boolean } {
  if (!input.typedNameFirst) {
    const registeredName = input.accountName || input.username || null
    const displayName = registeredName || input.typedName || null
    const subLabel = input.username
      ? `@${input.username}`
      : registeredName
        ? 'ผู้ซื้อที่ลงทะเบียนแล้ว'
        : 'ชื่อที่ร้านบันทึก'
    return { displayName, subLabel, hasBuyerInfo: Boolean(input.hasContact || displayName) }
  }
  const { name, accountName } = resolveOrderBuyerName({ typedName: input.typedName, accountName: input.accountName })
  // ใบเก่าที่ร้านไม่ได้กรอกชื่อ และบัญชีมีแต่ชื่อที่ระบบตั้งให้ — ถอยไป username ตามพฤติกรรมเดิม
  const displayName = name || input.username || null
  const subLabel = accountName
    ? `บัญชี: ${accountName}`
    : input.username
      ? 'ผู้ซื้อที่ลงทะเบียนแล้ว'
      : 'ชื่อที่ร้านบันทึก'
  return { displayName, subLabel, hasBuyerInfo: Boolean(input.hasContact || displayName) }
}
