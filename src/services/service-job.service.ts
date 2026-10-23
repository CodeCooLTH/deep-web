/**
 * service-job.service.ts — "ปิดงาน" / "เปิดงานอีกครั้ง" ของร้านบริการ (feature 00073)
 *
 * ขั้น 3 ของ flow 4 ขั้น: ร้านกดครั้งเดียว = ผล (ให้บริการแล้ว/ไม่มาตามนัด) + เงินที่เหลือ + วันปิดงาน
 * SSOT: docs/20 - Features/00073 - Service Four-Step Flow/{PRD,BRD,SRS,SDS,API}.md
 *
 * 🛑 ร้านบริการเท่านั้น — ตัวกั้นคือ `assertShopCanUseAppointments` (canUseAppointments = SERVICE_QUEUE)
 * 🛑 ทุกอย่างอยู่ในทรานแซกชันเดียว: ผล + เงิน + วันปิด + ประวัติ สำเร็จทั้งหมดหรือไม่เกิดเลย
 * 🛑 ไม่แตะ Order.status (BR-RSV-33) — "สำเร็จ" มาจากลูกค้ายืนยันเท่านั้น (หน้าร้านสาธารณะ)
 * 🛑 สิทธิ์ (O4/O5/O6) ตรวจที่ route — ที่นี่รับธงที่ route ตรวจแล้วเข้ามา
 */
import { prisma } from '@/lib/prisma'
import { APPOINTMENT_STATUS, AppointmentNotStartedError } from '@/lib/appointments'
import type { OrderPaymentMethod } from '@/lib/order-payment'
import { canCloseServiceJob, canReopenServiceJob } from '@/lib/service-status'
import type { Prisma } from '@prisma/client'
import {
  BUYER_CONFIRM_PAYMENT_NOTE,
  NO_SHOW_REFUND_REASON,
  ServiceJobAlreadyClosedError,
  ServiceJobNoShowWithoutAppointmentError,
  ServiceJobNotClosableError,
  ServiceJobNotFoundError,
  ServiceJobNotReopenableError,
  ServiceJobNotStartableError,
  type ServiceCloseOutcome,
  type ServiceNoShowDeposit,
} from '@/lib/service-job'
import { runAfterResponse } from '@/lib/run-after-response'
import { assertShopCanUseAppointments } from '@/services/appointment.service'
import { dispatchAutoNotify, reserveAutoNotifyIntent } from '@/services/auto-notify.service'
import { recordOrderEvent } from '@/services/order-event.service'
import { MONEY_SELECT, OrderPaymentError, toMoney } from '@/services/order-payment.service'

/** สถานะ Order ที่ปิดงานได้ — ต้องตรงกับ `canCloseServiceJob` (ใช้ใน where กันแข่งกัน) */
const CLOSABLE_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED']

export type CloseServiceJobArgs = {
  shopId: string
  orderToken: string
  actorUserId: string
  outcome: ServiceCloseOutcome
  /** เงินที่รับตอนปิด (ให้บริการแล้วเท่านั้น) — route ส่งได้เฉพาะผู้มีสิทธิ์ O5 */
  payment?: {
    amount: number
    method: OrderPaymentMethod
    slipFileId?: string | null
    note?: string | null
  } | null
  /** ไม่มาตามนัด: เก็บ (ค่าตั้งต้น) / คืนมัดจำ — คืนต้องมีสิทธิ์ O6 (route ตรวจ) */
  deposit?: ServiceNoShowDeposit
  now?: Date
}

export async function closeServiceJob(args: CloseServiceJobArgs) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)

  if (args.payment && (!Number.isFinite(args.payment.amount) || args.payment.amount <= 0)) {
    throw new OrderPaymentError('AMOUNT_INVALID')
  }

  let ledgerId: string | null = null
  const result = await prisma.$transaction(async (tx) => {
    ledgerId = null // รีเซ็ตทุกรอบ — ไม่ให้ค่าจากรอบที่ rollback รั่วออกไป
    const order = await tx.order.findFirst({
      where: { publicToken: args.orderToken, shopId: args.shopId },
      select: { id: true, shopId: true, status: true, serviceStart: true, serviceClosedAt: true, conversationId: true, isDryRun: true },
    })
    if (!order) throw new ServiceJobNotFoundError()
    if (order.serviceClosedAt != null) throw new ServiceJobAlreadyClosedError()
    if (!canCloseServiceJob(order)) throw new ServiceJobNotClosableError()

    const hasAppointment = order.serviceStart != null
    if (args.outcome === 'NO_SHOW' && !hasAppointment) throw new ServiceJobNoShowWithoutAppointmentError()
    // ลงผลนัดได้ตั้งแต่ถึงเวลาเริ่มนัด (BR-RSV-34) — walk-in ไม่มีเวลานัดให้รอ
    if (hasAppointment && now.getTime() < order.serviceStart!.getTime()) throw new AppointmentNotStartedError()

    // updateMany + เงื่อนไขซ้ำใน where = กันสองคนกดพร้อมกัน / ลูกค้ายกเลิกแทรกระหว่างอ่าน
    const updated = await tx.order.updateMany({
      where: { id: order.id, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES } },
      data: {
        serviceClosedAt: now,
        ...(hasAppointment
          ? { appointmentStatus: args.outcome === 'NO_SHOW' ? APPOINTMENT_STATUS.NO_SHOW : APPOINTMENT_STATUS.COMPLETED }
          : {}),
      },
    })
    if (updated.count === 0) throw new ServiceJobAlreadyClosedError()

    // เงินที่รับตอนปิด — เฉพาะ "ให้บริการแล้ว" (ไม่มาตามนัดไม่มีค่าบริการให้เก็บ)
    let receivedNow = 0
    if (args.outcome === 'SERVED' && args.payment) {
      await tx.orderPayment.create({
        data: {
          orderId: order.id,
          shopId: order.shopId,
          kind: 'BALANCE',
          amount: args.payment.amount,
          method: args.payment.method,
          slipFileId: args.payment.slipFileId ?? null,
          note: args.payment.note?.trim() || null,
          receivedByUserId: args.actorUserId,
          receivedAt: now,
        },
      })
      receivedNow = args.payment.amount
    }

    // มัดจำตอนไม่มาตามนัด (มติ D1) — คืน = void ทุกรายการที่ยังใช้อยู่ (ประวัติเงินไม่ถูกลบ)
    let depositMeta: 'KEPT' | 'REFUNDED' | undefined
    if (args.outcome === 'NO_SHOW') {
      const live = await tx.orderPayment.count({ where: { orderId: order.id, voidedAt: null } })
      if (live > 0) {
        if (args.deposit === 'REFUND') {
          await tx.orderPayment.updateMany({
            where: { orderId: order.id, voidedAt: null },
            data: { voidedAt: now, voidedByUserId: args.actorUserId, voidedReason: NO_SHOW_REFUND_REASON },
          })
          depositMeta = 'REFUNDED'
        } else {
          depositMeta = 'KEPT'
        }
      }
    }

    await recordOrderEvent(tx, {
      orderId: order.id,
      type: 'SERVICE_CLOSED',
      actorUserId: args.actorUserId,
      meta: {
        outcome: args.outcome,
        ...(receivedNow > 0 ? { amount: receivedNow } : {}),
        ...(depositMeta ? { deposit: depositMeta } : {}),
      },
      occurredAt: now,
    })

    // แจ้งลูกค้าอัตโนมัติ (00078) — เฉพาะ "ให้บริการแล้ว"; ไม่มาตามนัดไม่ส่ง · reserve ไม่ throw (SAVEPOINT)
    if (args.outcome === 'SERVED') {
      ledgerId = await reserveAutoNotifyIntent(tx, {
        shopId: order.shopId, orderId: order.id, conversationId: order.conversationId,
        kind: 'SERVICE_CLOSED', isDryRun: order.isDryRun, keyedInAt: now,
      })
    }

    const after = await tx.order.findUnique({
      where: { id: order.id },
      select: { ...MONEY_SELECT, serviceClosedAt: true, appointmentStatus: true },
    })
    if (!after) throw new ServiceJobNotFoundError()
    return {
      serviceClosedAt: after.serviceClosedAt,
      appointmentStatus: after.appointmentStatus,
      money: toMoney(after),
    }
  })
  const id = ledgerId as string | null
  if (id) runAfterResponse(() => dispatchAutoNotify(id))
  return result
}

/**
 * เริ่มงาน (00078 FR-CS-26) — ตั้ง `serviceStartedAt` ครั้งเดียว · idempotent (กดซ้ำคืนค่าเดิม ไม่ส่งซ้ำ)
 * 🛑 ไม่แตะ Order.status / appointmentStatus / เงิน — เป็นแค่ "เวลา" ไม่ใช่สถานะ
 */
export async function startServiceJob(args: { shopId: string; orderToken: string; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)

  let ledgerId: string | null = null
  const result = await prisma.$transaction(async (tx) => {
    ledgerId = null
    const order = await tx.order.findFirst({
      where: { publicToken: args.orderToken, shopId: args.shopId },
      select: {
        id: true, shopId: true, status: true, serviceStart: true, serviceClosedAt: true,
        serviceStartedAt: true, conversationId: true, isDryRun: true,
      },
    })
    if (!order) throw new ServiceJobNotFoundError()
    if (order.serviceClosedAt != null) throw new ServiceJobAlreadyClosedError()
    if (order.serviceStartedAt != null) return { serviceStartedAt: order.serviceStartedAt, alreadyStarted: true }
    if (!CLOSABLE_STATUSES.includes(order.status)) throw new ServiceJobNotStartableError() // ยกเลิก/คืน/ร่าง
    if (order.serviceStart != null && now.getTime() < order.serviceStart.getTime()) throw new AppointmentNotStartedError()

    // WHERE serviceStartedAt IS NULL = เขียนครั้งเดียว แม้สองคนกดพร้อมกัน
    const updated = await tx.order.updateMany({
      where: { id: order.id, serviceStartedAt: null, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES } },
      data: { serviceStartedAt: now },
    })
    if (updated.count === 0) {
      const again = await tx.order.findUnique({ where: { id: order.id }, select: { serviceStartedAt: true } })
      if (again?.serviceStartedAt) return { serviceStartedAt: again.serviceStartedAt, alreadyStarted: true }
      throw new ServiceJobNotStartableError()
    }

    await recordOrderEvent(tx, { orderId: order.id, type: 'SERVICE_STARTED', actorUserId: args.actorUserId, occurredAt: now })
    ledgerId = await reserveAutoNotifyIntent(tx, {
      shopId: order.shopId, orderId: order.id, conversationId: order.conversationId,
      kind: 'SERVICE_STARTED', isDryRun: order.isDryRun, keyedInAt: now,
    })
    return { serviceStartedAt: now, alreadyStarted: false }
  })
  const id = ledgerId as string | null
  if (id) runAfterResponse(() => dispatchAutoNotify(id))
  return result
}

/**
 * เปิดงานอีกครั้ง (มติ D2) — ปิดผิดแก้ได้ ก่อนลูกค้ายืนยันเท่านั้น
 * ล้างวันปิดงาน (ยอดถอยออกจากวันนั้น) · สถานะนัดกลับเป็นก่อนลงผล · บันทึกประวัติ
 * 🛑 ไม่ย้อนการคืนมัดจำอัตโนมัติ — ถ้าเคยคืนแล้วจะเก็บใหม่ ร้านบันทึกรับเงินเอง (ประวัติเงินต้องตรงความจริง)
 */
export async function reopenServiceJob(args: { shopId: string; orderToken: string; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { publicToken: args.orderToken, shopId: args.shopId },
      select: { id: true, status: true, serviceStart: true, serviceClosedAt: true, buyerConfirmedAt: true },
    })
    if (!order) throw new ServiceJobNotFoundError()
    if (!canReopenServiceJob(order)) throw new ServiceJobNotReopenableError()

    const updated = await tx.order.updateMany({
      // ลูกค้ายืนยันแทรกระหว่างอ่าน = เปิดไม่ได้แล้ว
      where: { id: order.id, serviceClosedAt: { not: null }, status: { notIn: ['CONFIRMED', 'CANCELLED', 'RETURNED'] } },
      data: {
        serviceClosedAt: null,
        ...(order.serviceStart != null
          ? {
              appointmentStatus: order.buyerConfirmedAt
                ? APPOINTMENT_STATUS.CONFIRMED_BY_BUYER
                : APPOINTMENT_STATUS.SCHEDULED,
            }
          : {}),
      },
    })
    if (updated.count === 0) throw new ServiceJobNotReopenableError()

    await recordOrderEvent(tx, {
      orderId: order.id,
      type: 'SERVICE_REOPENED',
      actorUserId: args.actorUserId,
      occurredAt: now,
    })
    return { serviceClosedAt: null }
  })
}

/**
 * feature 00082 — ลูกค้ากด "ยืนยันรับบริการ" = ปิดงาน + ชำระครบ (ร้านบริการเท่านั้น · มติ user 2026-10-21/23)
 *
 * เรียกจาก `confirmOrder` **ในทรานแซกชันเดียวกับ** การตั้ง `status = CONFIRMED` (ผู้ชนะ updateMany เท่านั้น)
 * ⇒ ยืนยัน + ปิด + เงิน สำเร็จพร้อมกันหรือไม่เกิดเลย · ทางเข้าเว็บ/แอป/ส่งคะแนน ผ่าน `confirmOrder` ทั้งหมด
 *
 * 1. ร้านยังไม่ปิด ⇒ ปิดให้ (ผล = ให้บริการแล้ว · วันปิด = ตอนลูกค้ากด · มีนัด ⇒ COMPLETED)
 *    🛑 ไม่ตรวจเวลานัด (ร้านปิดก่อนเวลาไม่ได้ BR-RSV-34 แต่ลูกค้ายืนยันเองว่าได้รับบริการแล้ว)
 *    🛑 ไม่จองข้อความ "ร้านให้บริการแล้ว" (ลูกค้ากดเอง ไม่ต้องบอกซ้ำ)
 * 2. ยังค้างเงิน ⇒ บันทึกยอดค้างเป็นรายการรับเงิน 1 แถว (ทั้งใบที่เพิ่งปิด และใบที่ร้านปิดไว้แบบค้าง — D-5)
 *    `method = OTHER` ⇒ ใบเสร็จไม่ติ๊กเงินสด/โอน (BR-RCP-13: ไม่รู้ = เว้นว่าง) · `receivedByUserId` = ลูกค้าที่กด
 *    🛑 ข้อยกเว้นกฎ 00050 "ระบบห้ามบันทึกรับเงินเอง" ที่ user ตัดสินแล้ว (PRD 00082 §5) — ร้านแก้ด้วย void ตามเดิม
 *
 * 🛑 ผู้เรียกต้องกั้น `usesServiceFinanceRules(vertical)` มาก่อน — ฟังก์ชันนี้ไม่ตัดสินประเภทร้าน
 */
export async function settleServiceJobOnBuyerConfirm(
  tx: Prisma.TransactionClient,
  args: { orderId: string; buyerUserId: string; now: Date },
): Promise<{ closed: boolean; paid: number }> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: args.orderId },
    select: { serviceStart: true, serviceClosedAt: true, appointmentStatus: true },
  })
  // ไม่มาตามนัดถูกกันที่ confirmOrder แล้ว — กันซ้ำไว้: ใบที่ไม่ได้ให้บริการต้องไม่ถูกบันทึกว่าจ่ายครบ
  if (order.appointmentStatus === APPOINTMENT_STATUS.NO_SHOW) return { closed: false, paid: 0 }

  let closed = false
  if (order.serviceClosedAt == null) {
    // เงื่อนไขซ้ำใน where = ร้านกดปิดแทรกเข้ามาพร้อมกัน ⇒ ฝั่งเราไม่ปิดทับ (เหลือแค่เติมเงิน)
    const r = await tx.order.updateMany({
      where: { id: args.orderId, serviceClosedAt: null },
      data: {
        serviceClosedAt: args.now,
        ...(order.serviceStart != null ? { appointmentStatus: APPOINTMENT_STATUS.COMPLETED } : {}),
      },
    })
    closed = r.count === 1
  }

  // อ่านเงินหลังปิด — ร้านอาจเพิ่งบันทึกรับเงินตอนปิด (แข่งกัน) ⇒ ยอดค้างต้องคิดจากแถวล่าสุด
  const row = await tx.order.findUniqueOrThrow({ where: { id: args.orderId }, select: MONEY_SELECT })
  const paid = toMoney(row).outstanding
  if (paid > 0) {
    await tx.orderPayment.create({
      data: {
        orderId: args.orderId,
        shopId: row.shopId,
        kind: 'BALANCE',
        amount: paid,
        method: 'OTHER',
        note: BUYER_CONFIRM_PAYMENT_NOTE,
        receivedByUserId: args.buyerUserId,
        receivedAt: args.now,
      },
    })
  }

  if (closed) {
    await recordOrderEvent(tx, {
      orderId: args.orderId,
      type: 'SERVICE_CLOSED',
      actorUserId: args.buyerUserId,
      meta: { outcome: 'SERVED', closedBy: 'BUYER', ...(paid > 0 ? { amount: paid } : {}) },
      occurredAt: args.now,
    })
  }
  return { closed, paid }
}
