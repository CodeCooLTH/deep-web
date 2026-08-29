/**
 * shop-payout — SSOT ของ "บัญชีรับเงินของร้าน" (feature 00062, TFR-009/TFR-010)
 *
 * ครอบ 4 อย่าง: รายชื่อธนาคารไทย (`THAI_BANKS`), normalize/mask เลขบัญชี, ตรวจรูปแบบ
 * PromptPay ID, และตัว snapshot ที่ freeze ค่า ณ เวลาสร้างออเดอร์ลงคอลัมน์ `Order.payoutSnapshot`
 * (`DATABASE.md` §3.1 — snapshot บัญชีไม่ freeze ยอดเงิน ยอดเงินอ่านจาก `Order.totalAmount` สด
 * เสมอผ่าน `src/lib/promptpay-qr.ts`)
 *
 * 🛑 **ห้ามใส่ key ที่ค่าเป็น `null`/`undefined` ลงใน `PayoutSnapshot`** — ไม่มีข้อมูล = ไม่มี key
 * เลย ไม่ใช่ key ที่ค่าเป็น `null` (`DATABASE.md` §3.1: "ไม่ใส่ null ทับ" — หลักการเดียวกับ
 * `docs/conventions/external-payload-schema.md` เรื่อง "ค่าที่ไม่รู้ ≠ เขียน null ทับ")
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็น **ฟังก์ชันบริสุทธิ์** — ห้าม import prisma/React
 */

import * as v from 'valibot'

import { MOBILE_PHONE_RE } from '@/lib/phone'
import { NATIONAL_ID_RE } from '@/lib/promptpay-qr'
import { isCODPayment } from '@/lib/order-display'

// ─── รายชื่อธนาคารไทย ──────────────────────────────────────────────────────
// grep ทั้ง repo แล้วยืนยันว่าไม่มีไฟล์นี้อยู่ก่อน (`docs/20 - Features/00062 …/DATABASE.md`
// §3.2: "grep ทั้ง repo หา bankCode/thai-banks ไม่พบ ต้องสร้างใหม่") — SSOT ตัวเดียวของระบบ

export interface ThaiBank {
  /** ใช้เป็นค่าที่เก็บใน `Shop.payoutBankCode`/`Order.payoutSnapshot.bankCode` */
  code: string
  nameTh: string
}

/** ธนาคารไทยหลัก ๆ ที่รองรับโอนเงิน/พร้อมเพย์ — เรียงตามความนิยมคร่าว ๆ ไม่ใช่ตามตัวอักษร */
export const THAI_BANKS: readonly ThaiBank[] = [
  { code: 'KBANK', nameTh: 'ธนาคารกสิกรไทย' },
  { code: 'SCB', nameTh: 'ธนาคารไทยพาณิชย์' },
  { code: 'BBL', nameTh: 'ธนาคารกรุงเทพ' },
  { code: 'KTB', nameTh: 'ธนาคารกรุงไทย' },
  { code: 'BAY', nameTh: 'ธนาคารกรุงศรีอยุธยา' },
  { code: 'TTB', nameTh: 'ธนาคารทหารไทยธนชาต' },
  { code: 'GSB', nameTh: 'ธนาคารออมสิน' },
  { code: 'BAAC', nameTh: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร' },
  { code: 'CIMB', nameTh: 'ธนาคารซีไอเอ็มบี ไทย' },
  { code: 'UOB', nameTh: 'ธนาคารยูโอบี' },
  { code: 'LHBANK', nameTh: 'ธนาคารแลนด์ แอนด์ เฮ้าส์' },
  { code: 'KKP', nameTh: 'ธนาคารเกียรตินาคินภัทร' },
  { code: 'GHB', nameTh: 'ธนาคารอาคารสงเคราะห์' },
  { code: 'ICBC', nameTh: 'ธนาคารไอซีบีซี (ไทย)' },
  { code: 'TISCO', nameTh: 'ธนาคารทิสโก้' },
] as const

const THAI_BANK_CODES = THAI_BANKS.map((b) => b.code) as [string, ...string[]]

export function isValidBankCode(code: string): boolean {
  return THAI_BANKS.some((b) => b.code === code)
}

export function findThaiBank(code: string): ThaiBank | undefined {
  return THAI_BANKS.find((b) => b.code === code)
}

// ─── เลขบัญชี ──────────────────────────────────────────────────────────────

/**
 * ตัดช่องว่าง/ขีดออกจากเลขบัญชี — ต้องเรียกก่อน validate/hash เสมอ (SRS §5) มิฉะนั้นเลขบัญชี
 * ที่พิมพ์คั่นต่างกัน ("123-4-56789-0" vs "1234567890") จะกลายเป็นคนละค่าโดยไม่ตั้งใจ
 */
export function normalizePayoutAccountNo(raw: string): string {
  return (raw ?? '').replace(/[\s-]/g, '')
}

/** เลขบัญชีธนาคารไทยทั่วไปยาว 10-15 หลัก (ตัวเลขล้วน หลัง normalize) */
export const PAYOUT_ACCOUNT_NO_RE = /^[0-9]{10,15}$/

export function isValidPayoutAccountNo(raw: string): boolean {
  return PAYOUT_ACCOUNT_NO_RE.test(normalizePayoutAccountNo(raw))
}

/** มาสก์เลขบัญชีเหลือ 4 หลักท้าย — ใช้แสดงผลก่อน/หลัง reauth โดยไม่เปิดเผยเลขเต็ม */
export function maskAccountNo(raw: string): string {
  const digits = normalizePayoutAccountNo(raw)
  if (digits.length <= 4) return 'x'.repeat(Math.max(digits.length, 4))
  return 'x'.repeat(digits.length - 4) + digits.slice(-4)
}

// ─── PromptPay ID ──────────────────────────────────────────────────────────

/**
 * รูปแบบ PromptPay ID ที่ยอมรับ — มือถือ 10 หลัก (`MOBILE_PHONE_RE` ตัวเดียวกับทั้งระบบ
 * **ห้ามเขียน regex เบอร์มือถือใหม่ที่นี่** ตาม SRS §5) หรือเลขบัตร ปชช./ผู้เสียภาษี 13 หลัก
 * (`NATIONAL_ID_RE` จาก `promptpay-qr.ts` — dependency ตาม SDS §8 แถว U5)
 */
export function isValidPromptPayId(raw: string): boolean {
  return MOBILE_PHONE_RE.test(raw) || NATIONAL_ID_RE.test(raw)
}

// ─── payoutSnapshot ──────────────────────────────────────────────────────

export interface PayoutSnapshot {
  bankCode?: string
  accountNo?: string
  accountName?: string
  promptPayId?: string
}

/** ฟิลด์ `payout*` ปัจจุบันของร้าน (ตรงกับคอลัมน์บน `Shop` — `DATABASE.md` §3.2) */
export interface ShopPayoutFields {
  payoutBankCode: string | null
  payoutAccountNo: string | null
  payoutAccountName: string | null
  payoutPromptPayId: string | null
}

/**
 * Freeze ค่าบัญชีของร้าน ณ ตอนนี้ลงเป็น snapshot — ใช้ตอนสร้าง/แก้ไขออเดอร์ที่ `paymentMethod`
 * เป็น TRANSFER/PROMPTPAY (U11)
 *
 * ฟิลด์ที่ `Shop.payout*` เป็น `null` → **ไม่มี key นั้นใน object ที่คืนเลย** (ไม่ใช่ key ที่
 * ค่าเป็น `null`) — ร้านที่ไม่ได้ตั้งอะไรเลยสักฟิลด์ → คืน `null` ทั้งก้อน (ตรงกับ SRS TFR-009:
 * "ร้านยังไม่ตั้งบัญชีตอนสร้างออเดอร์ → payoutSnapshot = NULL ไม่ error")
 */
export function buildPayoutSnapshot(shop: ShopPayoutFields): PayoutSnapshot | null {
  const snap: PayoutSnapshot = {}

  if (shop.payoutBankCode != null) snap.bankCode = shop.payoutBankCode
  if (shop.payoutAccountNo != null) snap.accountNo = shop.payoutAccountNo
  if (shop.payoutAccountName != null) snap.accountName = shop.payoutAccountName
  if (shop.payoutPromptPayId != null) snap.promptPayId = shop.payoutPromptPayId

  return Object.keys(snap).length > 0 ? snap : null
}

// ─── Valibot schema: PATCH /api/shops/payout body (API.md §4.5) ────────────

/**
 * `reauth` — 2 ทาง ตาม API.md §4.5: `{method:'PASSWORD', password}` หรือ `{method:'OTP', code}`
 * บังคับเสมอ (ไม่ใช่ optional) — TFR-009: ทุกการแก้บัญชีรับเงินต้อง reauth
 */
export const PayoutReauthSchema = v.variant('method', [
  v.object({
    method: v.literal('PASSWORD'),
    password: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    method: v.literal('OTP'),
    code: v.pipe(v.string(), v.minLength(1)),
  }),
])

/**
 * ไม่ส่งฟิลด์ = ไม่เปลี่ยนค่าเดิม, ส่ง `null` = ลบค่า (`v.optional(v.nullable(...))` — pattern
 * เดียวกับฟิลด์อื่นในระบบ เช่น `stockQty`/`cost` ใน validations.ts)
 */
export const UpdateShopPayoutSchema = v.object({
  payoutBankCode: v.optional(v.nullable(v.picklist(THAI_BANK_CODES, 'รหัสธนาคารไม่ถูกต้อง'))),
  payoutAccountNo: v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.transform(normalizePayoutAccountNo),
        v.regex(PAYOUT_ACCOUNT_NO_RE, 'เลขบัญชีต้องเป็นตัวเลข 10-15 หลัก'),
      ),
    ),
  ),
  payoutAccountName: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
  ),
  payoutPromptPayId: v.optional(
    v.nullable(
      v.pipe(v.string(), v.check(isValidPromptPayId, 'PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตร ปชช. 13 หลัก')),
    ),
  ),
  reauth: PayoutReauthSchema,
})

export type UpdateShopPayoutInput = v.InferOutput<typeof UpdateShopPayoutSchema>

/**
 * needsPayoutAccount — "ออเดอร์ใบนี้ต้องแสดงบัญชีรับเงินให้ผู้ซื้อไหม" (feature 00062)
 *
 * ใช้ตัดสิน 2 อย่างที่ต้องตรงกันเสมอ: จะเขียน `Order.payoutSnapshot` ตอนสร้างออเดอร์ไหม
 * และจะแสดงบล็อกบัญชี/QR บนหน้า `/o/[token]` ไหม
 *
 * 🛑 **ต้องเป็นนิยามเดียว** (Hard Rule 16) — เดิมเขียนเป็น literal
 * `pm === 'TRANSFER' || pm === 'PROMPTPAY'` ซ้ำ 2 ที่ใน `order.service.ts` (createOrder และ
 * updateOrder) ซึ่งเป็นรูปแบบที่ไฟล์นั้นเคยพลาดมาแล้วหลายรอบ: แก้ที่เดียวแล้วอีกที่ค้าง
 *
 * เกณฑ์: **ผู้ซื้อต้องโอนเงินเองไหม** — ไม่ใช่ COD (ขนส่งเก็บให้) และไม่ใช่เงินสด (จ่ายต่อหน้า)
 * เขียนเป็น deny-list ของ 2 กรณีที่ *ไม่* ต้องโอน แทน allow-list ของค่าที่ต้องโอน เพราะ
 * `paymentMethod` เป็น free text ที่ร้านพิมพ์เองได้ (ยังไม่พบบน prod ณ 2026-08-29 — มีแต่
 * COD/CASH/TRANSFER — แต่ระบบเปิดช่องไว้) ⇒ ค่าที่ไม่รู้จักควรได้บัญชีไปแสดงดีกว่าไม่ได้:
 * แสดงเกินไป ผู้ซื้ออ่านผ่าน · ไม่แสดง ผู้ซื้อไม่รู้ว่าจะโอนที่ไหนแล้วต้องไปถามในแชท
 * ซึ่งเป็นปัญหาที่ฟีเจอร์นี้ตั้งใจแก้ตั้งแต่แรก
 */
export function needsPayoutAccount(paymentMethod: string | null | undefined): boolean {
  if (isCODPayment(paymentMethod)) return false
  return !/CASH|เงินสด/i.test(paymentMethod ?? '')
}
