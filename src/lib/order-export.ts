/**
 * order-export.ts — ตัวสร้างแถว/คอลัมน์ของไฟล์ส่งออกออเดอร์ (feature 00086) · pure ห้าม import prisma
 *
 * แถวชุดเดียวป้อนทั้ง CSV และ xlsx (BRD FR-EXP-09) — สองรูปแบบจึงไม่มีทางมีคอลัมน์ไม่ตรงกัน
 * ตัวเลขเงินทุกตัวมาจากตัวคำนวณเดิมของระบบ (HR16) ห้ามบวกลบเองในไฟล์นี้นอกจากที่ระบุ:
 * - กำไรขั้นต้น = computeOrderProfit ตัวเดียวกับการ์ดกำไรหน้ารายละเอียดออเดอร์ (เงื่อนไขเดียวกันทุกข้อ)
 * - ค่าส่งขาไป = resolveOutboundShippingCost ตัวเดียวกับ /sales และรายงานกำไร
 * - กำไรหลังหักค่าส่ง = กำไรขั้นต้น − ค่าส่งขาไป = SALES_PROFIT_FORMULA ของหน้า /sales คิดรายใบ
 *
 * ผู้ส่งออกได้ = เจ้าของร้าน (P3) เท่านั้น ตามมติ user 2026-10-29 ⇒ ไฟล์มีทุกคอลัมน์ ไม่มีชุดตามบทบาท
 */
import { computeOrderProfit } from './order-profit'
import { costNetOfReturns, resolveReturnShippingCost, type ReturnAdjustment, type ReturnCostInput } from './order-return'
import { resolveOutboundShippingCost } from './shipping-cost'
import { countsAsRevenueFor, isServiceNoShow } from './order-revenue'
import { usesServiceFinanceRules } from './finance-rules'
import { computeOrderMoney, type PaymentRow } from './order-payment'
import { deriveShippingStage, SHIPPING_STAGE_LABEL } from './order-stage'
import { ORDER_STATUS_META, paymentMethodLabel } from './order-display'
import { resolveOrderBuyerNameForShop } from './buyer-name'
import { sellerContactDisplay } from './seller-contact-display'
import { formatDateTime, formatDateStampBE } from './format-date'
import { round2 } from './round2'
import type { ParcelCloseOutcome } from './parcel-close'

export { EXPORT_MAX_ROWS, type ExportFormat, type ExportScope } from './order-export-limits'
import type { ExportFormat, ExportScope } from './order-export-limits'
export type ExportColumnKind = 'text' | 'money' | 'int'
export type ExportColumn = { key: string; header: string; kind: ExportColumnKind }
export type ExportCell = string | number | null
export type ExportRow = Record<string, ExportCell>

/** ข้อมูลดิบต่อใบ (ตัวเลขเป็น number แล้ว) — service ประกอบจาก prisma */
export type ExportOrder = {
  id: string
  orderNo: string | null
  shortCode: string | null
  createdAt: Date
  status: string
  type: string
  salesChannel: string | null
  buyerName: string | null
  buyerAccountName: string | null
  buyerContact: string | null
  items: { name: string; qty: number; price: number; cost: number | null }[]
  discount: number | null
  vatAmount: number | null
  totalAmount: number
  depositAmount: number | null
  paymentMethod: string | null
  codReceivedAt: Date | null
  paymentConfirmedAt: Date | null
  // ร้านขายของ
  fulfillmentMode: string
  shippingAddress: unknown
  shipment: {
    courierName: string | null
    trackingNo: string | null
    carrierStatus: string | null
    status: string
    isDryRun: boolean
    direction: string
    problemAt: Date | null
    problemCloseOutcome: ParcelCloseOutcome | null
    problemCloseExcludesRevenue: boolean | null
    deliveredAt: Date | null
    codAmount: number
    carrierPrice: number | null
    estimatedPrice: number | null
    codFee: number | null
  } | null
  manualTracking: { provider: string; trackingNo: string; outboundShippingCost: number | null } | null
  returnShipping: ReturnCostInput[]
  // ร้านบริการ
  serviceStart: Date | null
  serviceEnd: Date | null
  serviceClosedAt: Date | null
  appointmentStatus: string | null
  serviceResourceName: string | null
  payments: PaymentRow[]
  // ร้านที่พัก
  checkIn: Date | null
  checkOut: Date | null
  roomName: string | null
}

const t = (key: string, header: string): ExportColumn => ({ key, header, kind: 'text' })
const m = (key: string, header: string): ExportColumn => ({ key, header, kind: 'money' })

/** คอลัมน์ตามประเภทกิจการ — ร้านที่ไม่ใช่ขายของไม่มีที่อยู่/พัสดุ (BR-EXP-10 · เหตุผลเดียวกับ 00036) */
export function exportColumns(vertical: string): ExportColumn[] {
  const isOnline = vertical === 'ONLINE_SALES'
  const isService = usesServiceFinanceRules(vertical)
  const isLodging = vertical === 'LODGING'
  return [
    t('orderNo', 'เลขที่ออเดอร์'),
    t('createdAt', 'วันที่สร้าง'),
    t('status', 'สถานะ'),
    t('type', 'ประเภทออเดอร์'),
    t('salesChannel', 'ช่องทางขาย'),
    t('buyerName', 'ชื่อลูกค้า'),
    t('buyerPhone', 'เบอร์โทร'),
    t('items', 'รายการสินค้า'),
    { key: 'qty', header: 'จำนวนชิ้นรวม', kind: 'int' },
    ...(isOnline
      ? [
          t('address', 'ที่อยู่จัดส่ง'), t('province', 'จังหวัด'), t('postcode', 'รหัสไปรษณีย์'),
          t('fulfillment', 'วิธีส่งมอบ'), t('courier', 'ขนส่ง'), t('trackingNo', 'เลขพัสดุ'),
          t('parcelStage', 'สถานะพัสดุ'), t('deliveredAt', 'วันที่ส่งสำเร็จ'),
        ]
      : []),
    ...(isService
      ? [t('serviceStart', 'เวลานัดเริ่ม'), t('serviceEnd', 'เวลานัดสิ้นสุด'), t('resource', 'ช่าง/ทรัพยากร'), t('serviceClosedAt', 'ปิดงานเมื่อ')]
      : []),
    ...(isLodging ? [t('checkIn', 'วันเข้าพัก'), t('checkOut', 'วันออก'), t('room', 'ห้อง')] : []),
    m('subtotal', 'ยอดสินค้า'),
    m('discount', 'ส่วนลด'),
    m('vat', 'VAT'),
    m('total', 'ยอดรวม'),
    t('paymentMethod', 'วิธีชำระ'),
    t('paidAt', 'วันที่ได้รับเงิน'),
    ...(isOnline ? [m('codAmount', 'ยอดเก็บปลายทาง (COD)')] : []),
    ...(isService ? [m('deposit', 'มัดจำ'), m('received', 'ยอดรับแล้ว'), m('outstanding', 'ค้างชำระ')] : []),
    m('refund', 'ยอดคืนเงินลูกค้า'),
    m('cogs', 'ต้นทุนสินค้า'),
    ...(isOnline
      ? [
          m('shipping', 'ค่าส่ง (ขนส่งคิด)'), m('codFee', 'ค่าธรรมเนียม COD'), m('shippingTotal', 'รวมค่าส่งขาไป'),
          t('shippingSource', 'ที่มาค่าส่ง'), m('returnShipping', 'ค่าส่งคืนสินค้า'),
        ]
      : []),
    m('grossProfit', 'กำไรขั้นต้น'),
    ...(isOnline ? [m('profitAfterShipping', 'กำไรหลังหักค่าส่ง')] : []),
    t('missingCost', 'ต้นทุนไม่ครบ'),
  ]
}

const date = (d: Date | null) => (d ? formatDateTime(d) : null)

function addressParts(raw: unknown): { line: string | null; province: string | null; postcode: string | null } {
  if (!raw || typeof raw !== 'object') return { line: null, province: null, postcode: null }
  const a = raw as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  const province = s(a.province)
  const postcode = s(a.postcode)
  const line = [s(a.line1), s(a.subdistrict), s(a.district), province, postcode].filter(Boolean).join(' ') || null
  return { line, province, postcode }
}

const SHIPPING_SOURCE_TEXT = {
  ISHIP: 'ราคาจริงจากขนส่ง',
  ESTIMATE: 'ราคาประมาณ (ขนส่งยังไม่ชั่ง)',
  MANUAL: 'ร้านกรอกเอง',
  MISSING: 'ยังไม่กรอกค่าส่ง',
} as const

/** แถวของออเดอร์ใบเดียว — `returns` = ผลคืนบางส่วนที่รับของแล้ว (getReturnAdjustments) */
export function buildExportRow(o: ExportOrder, vertical: string, returns: ReturnAdjustment | undefined): ExportRow {
  const isOnline = vertical === 'ONLINE_SALES'
  const isService = usesServiceFinanceRules(vertical)
  const subtotal = round2(o.items.reduce((s, it) => s + it.price * it.qty, 0))
  const shipments = o.shipment ? [o.shipment] : []

  // เงื่อนไขกำไรชุดเดียวกับ orders/[token]/page.tsx (orderProfit) ทุกข้อ — ใบที่ไม่นับยอดขายไม่มีกำไรให้คิด
  const hasProfit =
    countsAsRevenueFor({ status: o.status, shipments, serviceClosedAt: o.serviceClosedAt }, vertical) &&
    !(isService && isServiceNoShow(o))
  const adj = isService ? returns : undefined // หักคืนบางส่วน: ร้านบริการเท่านั้น (finance-rules · มติ 2026-10-02)
  const profit = hasProfit ? computeOrderProfit({ totalAmount: o.totalAmount, items: o.items }, adj) : null
  const rawCogs = o.items.reduce((s, it) => (it.cost == null ? s : s + it.cost * it.qty), 0)

  const outbound =
    isOnline && (o.shipment || o.manualTracking)
      ? resolveOutboundShippingCost({
          forward: o.shipment,
          manual: o.manualTracking?.outboundShippingCost,
          dropCodFee: !!o.shipment?.problemCloseExcludesRevenue,
        })
      : null
  const returnShipping = o.returnShipping.reduce((s, r) => s + resolveReturnShippingCost(r).amount, 0)

  const service = isService
    ? computeOrderMoney({ totalAmount: o.totalAmount, depositAgreed: o.depositAmount, payments: o.payments })
    : null

  const addr = isOnline ? addressParts(o.shippingAddress) : null
  const stage = isOnline
    ? deriveShippingStage({
        status: o.status,
        carrierStatus: o.shipment?.carrierStatus ?? null,
        hasShipment: !!o.shipment,
        paymentMethod: o.paymentMethod,
        codReceivedAt: o.codReceivedAt,
        fulfillmentMode: o.fulfillmentMode,
        problemAt: o.shipment?.problemAt ?? null,
        parcelClose: o.shipment?.problemCloseOutcome ?? null,
        hasManualTracking: !!o.manualTracking,
      })
    : null

  return {
    orderNo: o.orderNo ?? o.shortCode,
    createdAt: date(o.createdAt),
    status: ORDER_STATUS_META[o.status]?.label ?? o.status,
    type: o.type,
    salesChannel: o.salesChannel,
    buyerName: resolveOrderBuyerNameForShop(vertical, { typedName: o.buyerName, accountName: o.buyerAccountName }).name,
    buyerPhone: sellerContactDisplay(o.buyerContact, '') || null,
    items: o.items.map((it) => `${it.name} × ${it.qty}`).join('; ') || null,
    qty: o.items.reduce((s, it) => s + it.qty, 0),
    address: addr?.line ?? null,
    province: addr?.province ?? null,
    postcode: addr?.postcode ?? null,
    fulfillment: isOnline ? (o.fulfillmentMode === 'PICKUP' ? 'นัดรับ' : 'จัดส่ง') : null,
    courier: o.shipment?.courierName ?? o.manualTracking?.provider ?? null,
    trackingNo: o.shipment?.trackingNo ?? o.manualTracking?.trackingNo ?? null,
    parcelStage: stage ? ((SHIPPING_STAGE_LABEL as Record<string, string>)[stage] ?? null) : null,
    deliveredAt: date(o.shipment?.deliveredAt ?? null),
    serviceStart: date(o.serviceStart),
    serviceEnd: date(o.serviceEnd),
    resource: o.serviceResourceName,
    serviceClosedAt: date(o.serviceClosedAt),
    checkIn: date(o.checkIn),
    checkOut: date(o.checkOut),
    room: o.roomName,
    subtotal,
    discount: o.discount,
    vat: o.vatAmount,
    total: o.totalAmount,
    paymentMethod: o.paymentMethod ? paymentMethodLabel(o.paymentMethod) : null,
    paidAt: date(o.codReceivedAt ?? o.paymentConfirmedAt),
    codAmount: o.shipment && o.shipment.codAmount > 0 ? o.shipment.codAmount : null,
    deposit: o.depositAmount,
    received: service ? service.totalReceived : null,
    outstanding: service ? service.outstanding : null,
    refund: returns && returns.refund > 0 ? round2(returns.refund) : null,
    cogs: hasProfit ? round2(costNetOfReturns(rawCogs, adj)) : null,
    shipping: o.shipment ? (o.shipment.carrierPrice ?? o.shipment.estimatedPrice) : (o.manualTracking?.outboundShippingCost ?? null),
    codFee: o.shipment?.codFee ?? null,
    shippingTotal: outbound ? round2(outbound.amount) : null,
    shippingSource: outbound
      ? outbound.pendingReason
        ? SHIPPING_SOURCE_TEXT[outbound.pendingReason]
        : SHIPPING_SOURCE_TEXT[outbound.source === 'MANUAL' ? 'MANUAL' : 'ISHIP']
      : null,
    returnShipping: returnShipping > 0 ? round2(returnShipping) : null,
    grossProfit: profit ? profit.amount : null,
    // 00085 ใบที่ร้านปิดพัสดุแบบไม่นับยอดขาย: /sales นับค่าส่งของใบนั้นเป็นต้นทุนยืนยัน ⇒ กำไรของใบ = −ค่าส่ง
    profitAfterShipping: profit
      ? round2(profit.amount - (outbound?.amount ?? 0))
      : o.shipment?.problemCloseExcludesRevenue && outbound
        ? round2(-outbound.amount)
        : null,
    missingCost: profit?.hasMissingCost ? 'ใช่' : null,
  }
}

/**
 * กันสูตรในโปรแกรมตาราง (BRD FR-EXP-10 · OWASP CSV injection) — ช่องข้อความที่ขึ้นต้นด้วย
 * = + - @ Tab CR ถูกนำหน้าด้วย ' · ใช้กับ CSV เท่านั้น: xlsx เขียนเป็นเซลล์ชนิดข้อความซึ่ง Excel ไม่ประมวลผลอยู่แล้ว
 */
export function guardFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

/** ตาราง → สตริง CSV (UTF-8 BOM + CRLF) — escape ตาม RFC4180 ท่าเดียวกับ lib/csv.ts */
export function toCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const esc = (f: string) => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)
  const cell = (c: ExportColumn, v: ExportCell): string => {
    if (v == null) return ''
    if (c.kind === 'money') return Number(v).toFixed(2)
    if (c.kind === 'int') return String(v)
    return esc(guardFormula(String(v)))
  }
  const lines = [columns.map((c) => esc(c.header)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => cell(c, r[c.key] ?? null)).join(','))
  return '﻿' + lines.join('\r\n')
}

/** ชื่อไฟล์ — ปี พ.ศ. ติดกันเรียงตามวันได้ (บทเรียน export สต็อก: ห้ามใช้ formatDate ตัด "-") */
export function exportFilename(shopSlug: string, scope: ExportScope, format: ExportFormat, now: Date): string {
  const safe = shopSlug.replace(/[^a-zA-Z0-9-]/g, '') || 'shop'
  return `deep-orders-${safe}${scope === 'filtered' ? '-filtered' : ''}-${formatDateStampBE(now)}.${format}`
}
