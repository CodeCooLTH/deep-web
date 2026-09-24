/**
 * ใบเสร็จรับเงินของร้านบริการ (feature 00065) — กฎที่ตัดสินพฤติกรรม รวมไว้เป็นฟังก์ชันบริสุทธิ์
 * ให้เทสจับได้ (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 */
import * as v from 'valibot'
import { isCODPayment, isCashPayment } from './order-display'

export const RECEIPT_PREFIX = 'CA'
export const TAX_ID_RE = /^[0-9]{13}$/

/** `CA` + YYYYMM (ค.ศ. เวลาไทย จาก `receiptPeriodTH`) + ลำดับ 4 หลัก เช่น `CA2026090043` */
export function formatReceiptNo(period: string, seq: number): string {
  return `${RECEIPT_PREFIX}${period}${String(seq).padStart(4, '0')}`
}

/**
 * ออกใบเสร็จ "ใบใหม่" ได้ไหม (BR-RCP-06/07/08)
 * ใบที่ออกไปแล้วไม่ผ่านฟังก์ชันนี้ — เปิดได้เสมอแม้ภายหลังจะยกเลิก (BR-RCP-09)
 */
export function canIssueReceipt(order: { vertical: string; status: string }): boolean {
  return order.vertical === 'SERVICE_QUEUE' && order.status !== 'CANCELLED' && order.status !== 'DRAFTED'
}

/** ปุ่มในหน้าออเดอร์: ออกใหม่ได้ หรือเคยออกแล้ว (เปิดดูซ้ำ) */
export function showReceiptButton(order: { vertical: string; status: string; hasReceipt: boolean }): boolean {
  return order.hasReceipt || canIssueReceipt(order)
}

const TRANSFER_RE = /TRANSFER|PROMPTPAY|โอน|พร้อมเพย์/i

/**
 * ช่องติ๊กวิธีชำระเงินบนใบเสร็จ (BR-RCP-13)
 *
 * 🛑 ห้ามใช้ `paymentMethodLabel()` — ตัวนั้นตีค่าที่ไม่รู้จัก/null เป็น "โอน" (เพื่อให้โชว์บัญชีรับเงิน)
 * แต่บนเอกสารทางการ ติ๊กโดยไม่มีหลักฐาน = บันทึกเท็จ ⇒ ไม่รู้ต้องเว้นว่าง (AC-RCP-28)
 */
export function receiptPaymentMarks(input: {
  paymentMethod: string | null
  payments: { method: string; voidedAt: Date | string | null }[]
}): { cash: boolean; transfer: boolean } {
  const live = input.payments.filter((p) => !p.voidedAt)
  const pm = input.paymentMethod
  return {
    cash: isCashPayment(pm) || live.some((p) => p.method === 'CASH'),
    transfer: (!isCODPayment(pm) && TRANSFER_RE.test(pm ?? '')) || live.some((p) => p.method === 'TRANSFER'),
  }
}

const optText = (max: number) =>
  v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(max),
        v.transform((s) => (s === '' ? null : s)),
      ),
    ),
    null,
  )

export const UpdateReceiptProfileSchema = v.object({
  legalName: optText(200),
  address: optText(500),
  phone: optText(30),
  taxId: v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.transform((s) => s.replace(/[\s-]/g, '')),
        v.check((s) => s === '' || TAX_ID_RE.test(s), 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก'),
        v.transform((s) => (s === '' ? null : s)),
      ),
    ),
    null,
  ),
  stamp: optText(300),
})

export type UpdateReceiptProfileInput = v.InferOutput<typeof UpdateReceiptProfileSchema>

/**
 * ยอดเงินบนใบเสร็จ — ทศนิยม 2 ตำแหน่งเสมอ ไม่มี `฿` (คำว่า "บาท" อยู่ในเอกสาร)
 *
 * ไม่ใช้ `formatBaht` (ซ่อน .00 เมื่อเป็นจำนวนเต็ม) และ `formatNumberNoSymbol` (หัวไฟล์ห้ามใช้นอก
 * การ์ดยอดขาย) — เอกสารทางการต้องเป็น `3,500.00` ตามใบจริงของร้าน
 */
export function formatReceiptAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * หัวใบเสร็จ: ข้อมูลที่ร้านตั้งเองชนะ ถ้าช่องไหนว่างถอยไปใช้ข้อมูลร้าน (AC-RCP-06)
 * `isFallback` = ยังไม่เคยตั้งข้อมูลออกใบเสร็จเลย → หน้าพิมพ์ขึ้นแถบเตือน (AC-RCP-07)
 * เลขภาษี/เบอร์ไม่มีของร้านให้ถอย ⇒ null = ซ่อนทั้งแถว (AC-RCP-08)
 */
export function resolveReceiptHeader(
  shop: { shopName: string; address: string | null },
  profile: { legalName: string | null; address: string | null; taxId: string | null; phone: string | null } | null,
) {
  return {
    name: profile?.legalName || shop.shopName,
    address: profile?.address || shop.address || null,
    taxId: profile?.taxId || null,
    phone: profile?.phone || null,
    isFallback: profile === null,
  }
}
