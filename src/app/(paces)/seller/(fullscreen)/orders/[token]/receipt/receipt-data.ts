/**
 * ประกอบข้อมูลกระดาษใบเสร็จจาก `ReceiptView` — ตัวเดียวทั้งหน้าพิมพ์ฝั่งร้านและหน้าใบเสร็จฝั่งลูกค้า
 * (feature 00065 · 00073 FR-013) ใบเดียวกัน ตัวเลข/คำต้องตรงกันทุกตัวอักษร (HR16)
 *
 * ย้ายออกมาจาก page.tsx ของหน้าพิมพ์ฝั่งร้านโดยไม่เปลี่ยนตรรกะ
 */
import { formatDateTH } from '@/lib/format-date'
import { toFileUrl } from '@/lib/file-url'
import { thaiBahtText } from '@/lib/thai-baht-text'
import { formatReceiptAmount, receiptPaymentMarks, resolveReceiptHeader } from '@/lib/receipt'
import { ORDER_VOCAB } from '@/lib/seller-menu'
import type { ReceiptView } from '@/services/receipt.service'
import { buildBreakdown } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-detail-shared'

import type { ReceiptSheetData } from './ReceiptSheet'

/**
 * ป้ายของใบเสร็จตามใบจริงของร้าน — ตัวเลขมาจาก `buildBreakdown` ตัวเดียวกับหน้าออเดอร์ (HR16)
 * เปลี่ยนแค่คำเรียกของแถวแรก/แถวสุดท้าย
 */
const RECEIPT_LABEL: Record<string, string> = {
  subtotal: 'รวมเป็นเงิน',
  total: 'จำนวนเงินรวมทั้งสิ้น',
}
/** VAT บนเอกสารไทยใช้คำเต็ม — อัตราอ่านจากออเดอร์ ไม่ hardcode 7 */
const vatLabel = (pct: number) => `ภาษีมูลค่าเพิ่ม${pct > 0 ? ` ${pct}%` : ''}`

/**
 * feature 00073 — เติมช่อง วันที่/จำนวนเงิน จากรายการรับเงินแบบ "โอน" ที่ยังไม่ถูกยกเลิก
 * วันที่ = วันรับเงินโอนล่าสุด · จำนวน = ผลรวมเงินโอน · ไม่มีการโอน = null (ช่องเขียนมือเหมือนเดิม)
 */
function transferFill(payments: ReceiptView['payments']): { dateLabel: string; amount: string } | null {
  const transfers = payments.filter((p) => !p.voidedAt && p.method === 'TRANSFER')
  if (transfers.length === 0) return null
  const last = transfers.reduce((a, b) => (new Date(b.receivedAt) > new Date(a.receivedAt) ? b : a))
  const sum = transfers.reduce((s, p) => s + Number(p.amount ?? 0), 0)
  return { dateLabel: formatDateTH(last.receivedAt), amount: formatReceiptAmount(sum) }
}

export function buildReceiptSheet(view: ReceiptView) {
  const num = (v: unknown) => Number(v ?? 0)
  const items = view.items.map((it) => ({
    name: it.name,
    description: it.description,
    qty: it.qty,
    unitPrice: formatReceiptAmount(num(it.price)),
    lineTotal: formatReceiptAmount(num(it.price) * it.qty),
  }))
  const total = num(view.totalAmount)
  const vatPct = parseFloat((num(view.vatRate) * 100).toFixed(2))
  const rows = buildBreakdown({
    subtotal: view.items.reduce((s, it) => s + num(it.price) * it.qty, 0),
    discount: num(view.discount),
    vatAmount: num(view.vatAmount),
    vatPct,
    total,
    // ใบเสร็จออกได้เฉพาะร้านบริการ (receipt.service throw NOT_SERVICE_SHOP) — ใช้คำของร้านบริการ
    subtotalLabel: ORDER_VOCAB.SERVICE_QUEUE.subtotalLabel,
  })
  // เงินที่บันทึกรับจริง (ไม่นับที่ยกเลิก) — ฝั่งร้านออกใบได้ก่อนรับเงิน จึงต้องเตือนร้านบนจอ (ไม่พิมพ์)
  const received = view.payments.filter((p) => !p.voidedAt).reduce((s, p) => s + num(p.amount), 0)
  const outstanding = Math.max(0, total - received)
  const header = resolveReceiptHeader(view.shop, view.shop.receiptProfile)

  const data: ReceiptSheetData = {
    receiptNo: view.receipt.receiptNo,
    issuedDateLabel: formatDateTH(view.receipt.issuedAt),
    sellerName: view.createdBy?.displayName ?? '',
    header: { ...header, logoUrl: toFileUrl(view.shop.logo) },
    stampUrl: toFileUrl(view.shop.receiptProfile?.stamp),
    customer: { name: view.buyerName ?? '', contact: view.buyerContact },
    items,
    breakdown: rows
      .filter((r) => r.key !== 'total')
      .map((r) => ({ key: r.key, label: r.key === 'vat' ? vatLabel(vatPct) : (RECEIPT_LABEL[r.key] ?? r.label), value: `${r.prefix ?? ''}${formatReceiptAmount(r.value)}` })),
    totalLabel: RECEIPT_LABEL.total,
    totalValue: formatReceiptAmount(total),
    totalWords: thaiBahtText(total),
    marks: receiptPaymentMarks({ paymentMethod: view.paymentMethod, payments: view.payments }),
    cancelled: view.status === 'CANCELLED',
    transfer: transferFill(view.payments),
  }
  return { data, outstanding, header }
}
