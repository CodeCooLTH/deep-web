/**
 * parcel-close.service — ร้านปิด/เลิกปิดพัสดุขาไปที่มีปัญหา (feature 00085 · TFR-002/003/011)
 *
 * 🛑 ไม่แตะ Order.status / cancelInitiator / OrderReturn / Trust Score — ผลปิดอยู่ที่คอลัมน์
 * problemClose* ของ OrderShipment เท่านั้น (ตัวตัดสินกอง/ยอดขายอ่านคอลัมน์นี้ต่อ)
 */
import { prisma } from '@/lib/prisma'
import { DELIVERED_CARRIER_STATUSES } from '@/lib/iship/status'
import { resolveOutboundShippingCost, type OutboundShippingCost } from '@/lib/shipping-cost'
import { toShipmentViewJson, type ShipmentViewJson } from '@/lib/iship/context'
import { SHIPMENT_SELECT, toShipmentView } from '@/services/iship.service'
import { recordOrderEvent } from '@/services/order-event.service'
import {
  canCloseParcelProblem,
  decideLossPhase,
  isCodForParcelClose,
  needsRefundAnswer,
  parcelCloseExcludesRevenue,
  type ParcelCloseBasis,
  type ParcelCloseBlockCode,
  type ParcelCloseOutcome,
  type ParcelCloseReason,
} from '@/lib/parcel-close'

export const PARCEL_CLOSE_ERROR_CODES = [
  'REFUND_ANSWER_REQUIRED',
  'NOT_FOUND',
  'ALREADY_CLOSED',
  'NOT_IN_PROBLEM',
  'NOT_FORWARD',
  'NOT_ACTIVE',
  'ORDER_FINISHED',
  'NOT_SHIPPED_MODE',
  'SERVICE_SHOP_UNSUPPORTED',
  'OUTCOME_CHANGED',
  'NOT_CLOSED',
] as const
export type ParcelCloseErrorCode = (typeof PARCEL_CLOSE_ERROR_CODES)[number]

export class ParcelCloseError extends Error {
  constructor(
    readonly code: ParcelCloseErrorCode,
    readonly userMessage: string,
    /** OUTCOME_CHANGED เท่านั้น — ผลตัดสินใหม่ให้ UI วาดกล่องผลใหม่ */
    readonly preview?: ParcelClosePreview,
  ) {
    super(`ParcelCloseError(${code})`)
    this.name = 'ParcelCloseError'
  }
}

const BLOCK_MESSAGE: Record<ParcelCloseBlockCode, string> = {
  NOT_FORWARD: 'พัสดุขากลับปิดด้วยวิธีนี้ไม่ได้',
  NOT_ACTIVE: 'พัสดุใบนี้ไม่ได้ใช้งานอยู่',
  ALREADY_CLOSED: 'พัสดุนี้ถูกปิดไปแล้ว',
  NOT_IN_PROBLEM: 'พัสดุนี้ไม่ได้อยู่ในกลุ่มมีปัญหาแล้ว',
  ORDER_FINISHED: 'คำสั่งซื้อนี้จบไปแล้ว',
  NOT_SHIPPED_MODE: 'คำสั่งซื้อนี้ไม่ได้จัดส่งด้วยพัสดุ',
  SERVICE_SHOP_UNSUPPORTED: 'ร้านประเภทนี้ไม่รองรับการปิดพัสดุ',
}

export interface ParcelClosePreview {
  eligible: boolean
  blockedBy: ParcelCloseBlockCode | null
  outcome: ParcelCloseOutcome
  basis: ParcelCloseBasis
  deliveredAt: string | null
  /** จำนวน ShipmentEvent สถานะ "ถึงผู้รับ" — หลักฐานข้อสองของ decideLossPhase */
  eventCount: number
  paymentIsCod: boolean
  needsRefundAnswer: boolean
  effect: { countsAsSale: boolean | null; outboundShippingCostKept: true }
  shippingCost: OutboundShippingCost
}

const FINISHED = ['CANCELLED', 'RETURNED', 'DRAFTED']

const ROW_SELECT = {
  ...SHIPMENT_SELECT,
  shopId: true,
  direction: true,
  deliveredAt: true,
  carrierPrice: true,
  estimatedPrice: true,
  codFee: true,
  order: {
    select: {
      status: true,
      fulfillmentMode: true,
      paymentMethod: true,
      shop: { select: { vertical: true } },
      shipmentTracking: { select: { outboundShippingCost: true } },
    },
  },
} as const

/** ดึงจากแถว แล้วเทียบร้าน — ร้านไม่ตรง = NOT_FOUND ไม่บอกว่ามีอยู่ (ไม่ใช้ร้าน active ของ session) */
async function loadRow(shopId: string, shipmentId: string) {
  const row = await prisma.orderShipment.findUnique({ where: { id: shipmentId }, select: ROW_SELECT })
  if (!row || row.shopId !== shopId) throw new ParcelCloseError('NOT_FOUND', 'ไม่พบพัสดุนี้')
  return row
}
type Row = Awaited<ReturnType<typeof loadRow>>

const canClose = (r: Row) =>
  canCloseParcelProblem({
    shipment: r,
    order: { status: r.order.status, fulfillmentMode: r.order.fulfillmentMode, vertical: r.order.shop.vertical },
  })

async function buildPreview(r: Row): Promise<ParcelClosePreview> {
  const can = canClose(r)
  const eventCount = await prisma.shipmentEvent.count({
    where: { shipmentId: r.id, status: { in: [...DELIVERED_CARRIER_STATUSES] } },
  })
  const { outcome, basis } = decideLossPhase({
    deliveredAt: r.deliveredAt,
    hasDeliveredEvent: eventCount > 0,
    orderStatus: r.order.status,
  })
  const isCod = isCodForParcelClose(r.order.paymentMethod)
  const needs = needsRefundAnswer(outcome, isCod)
  return {
    eligible: can.ok,
    blockedBy: can.ok ? null : can.code,
    outcome,
    basis,
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    eventCount,
    paymentIsCod: isCod,
    needsRefundAnswer: needs,
    effect: { countsAsSale: needs ? null : false, outboundShippingCostKept: true },
    // ใบที่ปิดแบบไม่นับยอดขายไม่รวม codFee (ไม่มีการเก็บเงิน) — dropCodFee ตามสัญญา 00085
    shippingCost: resolveOutboundShippingCost({
      forward: r,
      manual: r.order.shipmentTracking?.outboundShippingCost,
      dropCodFee: true,
    }),
  }
}

export async function previewParcelClose(shopId: string, shipmentId: string): Promise<ParcelClosePreview> {
  return buildPreview(await loadRow(shopId, shipmentId))
}

/** ShipmentViewJson ล่าสุด + ชื่อผู้ปิด — ให้ UI รีเฟรชแผงจากคำตอบเดียว */
async function shipmentViewOf(shipmentId: string): Promise<ShipmentViewJson> {
  const s = await prisma.orderShipment.findUniqueOrThrow({ where: { id: shipmentId }, select: SHIPMENT_SELECT })
  const u = s.problemClosedByUserId
    ? await prisma.user.findUnique({ where: { id: s.problemClosedByUserId }, select: { displayName: true, username: true } })
    : null
  return toShipmentViewJson({ ...toShipmentView(s), problemClosedByName: u?.displayName || u?.username || null })
}

const CLEARED = {
  problemClosedAt: null,
  problemClosedByUserId: null,
  problemCloseReason: null,
  problemCloseNote: null,
  problemCloseOutcome: null,
  problemCloseBasis: null,
  problemCloseRefunded: null,
  problemCloseExcludesRevenue: null,
} as const

export async function closeParcelProblem(i: {
  shopId: string
  userId: string
  shipmentId: string
  reason: ParcelCloseReason
  note?: string
  refunded?: boolean
  expectedOutcome: ParcelCloseOutcome
}) {
  const row = await loadRow(i.shopId, i.shipmentId)
  const can = canClose(row)
  if (!can.ok) throw new ParcelCloseError(can.code, BLOCK_MESSAGE[can.code])

  const preview = await buildPreview(row)
  const { outcome, basis } = preview
  // client ส่งมาเป็นโทเค็นกัน race เท่านั้น — ไม่เคยใช้ตัดสินเงิน
  if (i.expectedOutcome !== outcome) {
    throw new ParcelCloseError('OUTCOME_CHANGED', 'ผลที่ระบบตัดสินเปลี่ยนไป ตรวจผลแล้วกดยืนยันอีกครั้ง', preview)
  }
  if (preview.needsRefundAnswer && i.refunded === undefined) {
    throw new ParcelCloseError('REFUND_ANSWER_REQUIRED', 'ต้องระบุว่าคืนเงินลูกค้าแล้วหรือยัง')
  }
  const refunded = preview.needsRefundAnswer ? (i.refunded ?? null) : null
  const excludes = parcelCloseExcludesRevenue(outcome, preview.paymentIsCod, refunded)
  const note = i.reason === 'OTHER' ? (i.note ?? null) : null

  const won = await prisma.$transaction(async (tx) => {
    const r = await tx.orderShipment.updateMany({
      where: {
        id: row.id,
        status: 'CREATED',
        isDryRun: false,
        direction: 'FORWARD',
        problemClosedAt: null,
        carrierStatus: row.carrierStatus,
        problemAt: row.problemAt,
        // ล็อกสถานะที่อ่านมาตอนตัดสินผล (decideLossPhase ใช้ ORDER_CONFIRMED) — เปลี่ยนระหว่างทาง = แพ้ race
        order: { status: row.order.status },
      },
      data: {
        problemClosedAt: new Date(),
        problemClosedByUserId: i.userId,
        problemCloseReason: i.reason,
        problemCloseNote: note,
        problemCloseOutcome: outcome,
        problemCloseBasis: basis,
        problemCloseRefunded: refunded,
        problemCloseExcludesRevenue: excludes,
      },
    })
    if (r.count === 0) return false
    await recordOrderEvent(tx, {
      orderId: row.orderId,
      type: 'PARCEL_PROBLEM_CLOSED',
      actorUserId: i.userId,
      meta: { outcome, closeReason: i.reason, ...(note ? { closeNote: note } : {}), basis, refunded },
    })
    return true
  })

  if (!won) {
    // แพ้ conditional update — อ่านใหม่แล้วจัดประเภทให้ UI รู้ว่าต้องโหลดแผงใหม่ด้วยเหตุอะไร
    const now = await loadRow(i.shopId, i.shipmentId)
    const c = canClose(now)
    const code = c.ok ? 'NOT_IN_PROBLEM' : c.code
    throw new ParcelCloseError(code, BLOCK_MESSAGE[code])
  }
  return { closed: true as const, outcome, basis, excludesRevenue: excludes, shipment: await shipmentViewOf(row.id) }
}

export async function reopenParcelProblem(i: { shopId: string; userId: string; shipmentId: string }) {
  const row = await loadRow(i.shopId, i.shipmentId)
  if (FINISHED.includes(row.order.status)) throw new ParcelCloseError('ORDER_FINISHED', BLOCK_MESSAGE.ORDER_FINISHED)
  if (!row.problemClosedAt) throw new ParcelCloseError('NOT_CLOSED', 'พัสดุนี้ยังไม่ได้ปิด')

  const won = await prisma.$transaction(async (tx) => {
    const r = await tx.orderShipment.updateMany({
      where: {
        id: row.id,
        problemClosedAt: { not: null },
        status: 'CREATED',
        direction: 'FORWARD',
        order: { status: { notIn: FINISHED } },
      },
      data: CLEARED,
    })
    if (r.count === 0) return false
    await recordOrderEvent(tx, {
      orderId: row.orderId,
      type: 'PARCEL_PROBLEM_REOPENED',
      actorUserId: i.userId,
      meta: { outcome: row.problemCloseOutcome ?? undefined, closeReason: row.problemCloseReason ?? undefined },
    })
    return true
  })
  if (!won) {
    const now = await loadRow(i.shopId, i.shipmentId)
    if (FINISHED.includes(now.order.status)) throw new ParcelCloseError('ORDER_FINISHED', BLOCK_MESSAGE.ORDER_FINISHED)
    throw new ParcelCloseError('NOT_CLOSED', 'พัสดุนี้ยังไม่ได้ปิด')
  }
  return { reopened: true as const, shipment: await shipmentViewOf(row.id) }
}
