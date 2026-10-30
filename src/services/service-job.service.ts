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
import { computeStaffLoad, loadDayBounds, type LoadWindow, type StaffLoad } from '@/lib/assignee-load'
import { withoutDrafted } from '@/lib/order-visibility'
import { APPOINTMENT_STATUS, AppointmentNotStartedError, canUseAppointments } from '@/lib/appointments'
import type { OrderPaymentMethod } from '@/lib/order-payment'
import { canCloseServiceJob, canReopenServiceJob } from '@/lib/service-status'
import type { Prisma } from '@prisma/client'
import {
  AssigneeNotTechnicianError,
  BUYER_CONFIRM_PAYMENT_NOTE,
  NO_SHOW_REFUND_REASON,
  ServiceJobAlreadyAssignedError,
  ServiceJobAlreadyClosedError,
  ServiceJobClaimTechnicianOnlyError,
  ServiceJobNoShowAfterStartError,
  ServiceJobNoShowWithoutAppointmentError,
  ServiceJobNotAssigneeError,
  ServiceJobNotClosableError,
  ServiceJobNotFinishedError,
  ServiceJobNotFoundError,
  ServiceJobNotReopenableError,
  ServiceJobNotStartableError,
  ServiceJobNotStartedError,
  ServiceJobPhotoMissingError,
  ServiceJobUnassignedError,
  assertServiceJobPhotoInput,
  type ServiceCloseOutcome,
  type ServiceJobAction,
  type ServiceJobPhotoMode,
  type ServiceNoShowDeposit,
} from '@/lib/service-job'
import {
  canClaimServiceJob,
  effectiveRoles,
  isTechnicianOnly,
  serviceJobActorBlock,
  type ShopRole,
} from '@/lib/shop-permissions'
import { getFileMeta } from '@/lib/storage'
import { runAfterResponse } from '@/lib/run-after-response'
import { assertShopCanUseAppointments } from '@/services/appointment.service'
import { dispatchAutoNotify, reserveAutoNotifyIntent } from '@/services/auto-notify.service'
import { recordOrderEvent } from '@/services/order-event.service'
import { MONEY_SELECT, OrderPaymentError, toMoney } from '@/services/order-payment.service'
import { notifyServiceJob } from '@/services/service-job-notify.service'

/** สถานะ Order ที่ปิดงานได้ — ต้องตรงกับ `canCloseServiceJob` (ใช้ใน where กันแข่งกัน) */
const CLOSABLE_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED']

export type CloseServiceJobArgs = {
  shopId: string
  orderToken: string
  actorUserId: string
  /**
   * 00086 — บทบาทที่มีผลของผู้กด (ctx.roles) · บังคับส่ง (ไม่มีค่าตั้งต้นที่เปิด)
   * ช่างล้วน: ปิดได้เฉพาะงานของตัวเอง **และทำเสร็จแล้ว** (SDS TD-004 · FR-011) · บทบาทอื่นปิดก่อนทำเสร็จได้ (FR-010)
   */
  actorRoles: readonly ShopRole[]
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

  const technicianOnly = isTechnicianOnly(args.actorRoles)
  // ช่างล้วน: งานของตัวเอง + ทำเสร็จแล้ว — ตรวจกับแถวที่อ่านใน tx และซ้ำใน WHERE (มอบใหม่แทรก = ไม่ปิด)
  const assertTechnicianMayClose = (o: ActorJob & { serviceFinishedAt: Date | null }) => {
    if (!technicianOnly) return
    assertActorOwnsJob(args.actorRoles, o, args.actorUserId, 'CLOSE')
    if (o.serviceFinishedAt == null) throw new ServiceJobNotFinishedError()
  }

  let ledgerId: string | null = null
  let closedOrderId: string | null = null
  const result = await prisma.$transaction(async (tx) => {
    ledgerId = null // รีเซ็ตทุกรอบ — ไม่ให้ค่าจากรอบที่ rollback รั่วออกไป
    closedOrderId = null
    const order = await tx.order.findFirst({
      where: { publicToken: args.orderToken, shopId: args.shopId },
      select: {
        id: true, shopId: true, status: true, serviceStart: true, serviceClosedAt: true, conversationId: true, isDryRun: true,
        assignedUserId: true, serviceStartedAt: true, serviceFinishedAt: true, assignedUser: { select: { displayName: true } },
      },
    })
    if (!order) throw new ServiceJobNotFoundError()
    if (order.serviceClosedAt != null) throw new ServiceJobAlreadyClosedError()
    if (!canCloseServiceJob(order)) throw new ServiceJobNotClosableError()
    assertTechnicianMayClose(order)

    const hasAppointment = order.serviceStart != null
    if (args.outcome === 'NO_SHOW' && !hasAppointment) throw new ServiceJobNoShowWithoutAppointmentError()
    // 00086 P3 — เริ่มงานแล้ว = ลูกค้ามาแล้ว ⇒ ไม่มาตามนัดขัดกันเอง (ทั้ง /close และ /appointment/outcome ผ่านที่นี่)
    if (args.outcome === 'NO_SHOW' && order.serviceStartedAt != null) throw new ServiceJobNoShowAfterStartError()
    // ลงผลนัดได้ตั้งแต่ถึงเวลาเริ่มนัด (BR-RSV-34) — walk-in ไม่มีเวลานัดให้รอ
    if (hasAppointment && now.getTime() < order.serviceStart!.getTime()) throw new AppointmentNotStartedError()

    // updateMany + เงื่อนไขซ้ำใน where = กันสองคนกดพร้อมกัน / ลูกค้ายกเลิกแทรกระหว่างอ่าน
    const updated = await tx.order.updateMany({
      where: {
        id: order.id, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES },
        ...(technicianOnly ? { assignedUserId: args.actorUserId, serviceFinishedAt: { not: null } } : {}),
        // เริ่มงานแทรกระหว่างอ่านกับเขียน = ไม่บันทึกไม่มาตามนัด (ตรวจซ้ำใน WHERE แบบด่านอื่น)
        ...(args.outcome === 'NO_SHOW' ? { serviceStartedAt: null } : {}),
      },
      data: {
        serviceClosedAt: now,
        ...(hasAppointment
          ? { appointmentStatus: args.outcome === 'NO_SHOW' ? APPOINTMENT_STATUS.NO_SHOW : APPOINTMENT_STATUS.COMPLETED }
          : {}),
      },
    })
    if (updated.count === 0) {
      if (technicianOnly || args.outcome === 'NO_SHOW') {
        const again = await tx.order.findUnique({
          where: { id: order.id },
          select: {
            serviceClosedAt: true, assignedUserId: true, serviceStartedAt: true, serviceFinishedAt: true,
            assignedUser: { select: { displayName: true } },
          },
        })
        if (again && again.serviceClosedAt == null) {
          assertTechnicianMayClose(again)
          if (args.outcome === 'NO_SHOW' && again.serviceStartedAt != null) throw new ServiceJobNoShowAfterStartError()
        }
      }
      throw new ServiceJobAlreadyClosedError()
    }

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
    closedOrderId = order.id
    return {
      serviceClosedAt: after.serviceClosedAt,
      appointmentStatus: after.appointmentStatus,
      money: toMoney(after),
    }
  })
  const id = ledgerId as string | null
  if (id) runAfterResponse(() => dispatchAutoNotify(id))
  // 00086 FR-014 — แจ้งเจ้าของ/ผู้ดูแล (ตัดคนกด) · ลูกค้ายืนยัน (00082) ไม่ผ่านทางนี้ = ไม่แจ้งซ้ำกับ activity
  const oid = closedOrderId as string | null
  if (oid) runAfterResponse(() => notifyServiceJob({ shopId: args.shopId, orderId: oid, actorUserId: args.actorUserId, event: 'CLOSED' }))
  return result
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// feature 00086 P3 — งานของช่าง: ผู้รับผิดชอบ · เริ่ม/ทำเสร็จพร้อมรูป · ด่าน "ช่างล้วนเฉพาะงานของตัวเอง"
// SSOT: docs/20 - Features/00086 - Service Staff Workflow/{BRD §8.1–8.4, SDS §3.7–3.17, API §4.5–4.11}
//
// 🛑 ด่านทุกตัวตัดสิน "ซ้ำในทรานแซกชัน" และใส่เงื่อนไขเดียวกันใน WHERE ของ updateMany — ค่าที่อ่านก่อนเปิด tx
//    ใช้แค่ตอบเร็ว/ตรวจไฟล์ใน storage (ช้า · ไม่ควรถือ tx ค้าง) ไม่ใช่ตัวตัดสินสุดท้าย
// 🛑 actorRoles บังคับส่ง (ไม่มีค่าตั้งต้นที่เปิด · permission-gate-follows-the-row) — route ส่ง ctx.roles
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

type Tx = Prisma.TransactionClient
type Db = Tx | typeof prisma

const JOB_SELECT = {
  id: true, shopId: true, status: true, serviceStart: true, serviceClosedAt: true,
  serviceStartedAt: true, serviceFinishedAt: true, conversationId: true, isDryRun: true,
  assignedUserId: true,
  assignedUser: { select: { displayName: true } },
  shop: { select: { serviceJobPhotoMode: true, serviceJobPhotosBuyerVisible: true } },
} as const

function loadJob(db: Db, shopId: string, orderToken: string) {
  return db.order.findFirst({ where: { publicToken: orderToken, shopId }, select: JOB_SELECT })
}

type ActorJob = { assignedUserId: string | null; assignedUser: { displayName: string } | null }

/** ช่างล้วน: ต้องเป็นงานของตัวเอง (BRD §8.2) · บทบาทอื่นผ่านเสมอ — นิยามอยู่ที่ serviceJobActorBlock ที่เดียว */
function assertActorOwnsJob(roles: readonly ShopRole[], job: ActorJob, actorUserId: string, action: ServiceJobAction) {
  const block = serviceJobActorBlock(roles, job, actorUserId)
  if (block === 'UNASSIGNED') throw new ServiceJobUnassignedError()
  if (block === 'NOT_ASSIGNEE') throw new ServiceJobNotAssigneeError(job.assignedUser?.displayName ?? null, action)
}

/** ช่างล้วน → เงื่อนไขซ้ำใน WHERE ของ updateMany (มอบงานใหม่แทรกระหว่างอ่านกับเขียน = ไม่เขียน) */
function actorWhere(roles: readonly ShopRole[], actorUserId: string) {
  return isTechnicianOnly(roles) ? { assignedUserId: actorUserId } : {}
}

type StepInput = { photoFileIds?: readonly string[]; note?: string | null }
type Step = { fileIds: string[]; note: string | null }

/** fileId ซ้ำนับครั้งเดียว · note ว่าง/ช่องว่างล้วน = ไม่มีบันทึก */
function normalizeStep(input: StepInput): Step {
  return { fileIds: [...new Set(input.photoFileIds ?? [])], note: input.note?.trim() || null }
}

/** meta ของ SERVICE_STARTED / SERVICE_FINISHED — ไม่มีรูป/บันทึก = ไม่มี meta (ประวัติแบบเดิมเป๊ะ) · ตัวบันทึกห้ามลง meta (TD-006) */
function stepMeta(step: Step) {
  if (step.fileIds.length === 0 && !step.note) return undefined
  return {
    ...(step.fileIds.length > 0 ? { photoCount: step.fileIds.length } : {}),
    ...(step.note ? { hasNote: true } : {}),
  }
}

/**
 * ทุก fileId ต้องมีไฟล์จริงใน storage — ตรวจก่อนเปิด tx (แบบ inspection-result.service) · รูปไม่ครบ = สถานะไม่เปลี่ยน (BRD §6.3)
 *
 * ⚠️ ความเสี่ยงที่ยอมรับ (MINOR-5 · 2026-10-29): ตรวจได้แค่ว่า "ไฟล์มีอยู่" ไม่ได้ตรวจว่า "ใครอัปโหลด"
 * เพราะระบบไม่มีบันทึกเจ้าของไฟล์ purpose IMAGE เลย — ticket ผูก userId แค่ 15 นาทีแล้วทิ้ง · storage meta มีแค่ขนาด/นามสกุล
 * (getFileMeta) · MediaAsset ผูกเฉพาะ CHAT · ไม่สร้างตารางใหม่เพื่อเรื่องนี้
 * ผลที่เหลือ: สมาชิกร้าน (ผ่าน O-cap + ด่านงานของตัวเอง) แนบ fileId ที่รู้อยู่แล้วของไฟล์อื่นได้ — fileId เป็น uuid เดาไม่ได้
 * และรูปในบันทึกแสดงผ่าน /api/files ซึ่งมีด่านของตัวเอง ⇒ ไม่เปิดไฟล์ที่ผู้กดไม่เคยเห็นให้ใครเพิ่ม
 */
async function assertPhotosExist(fileIds: readonly string[]) {
  const metas = await Promise.all(fileIds.map((id) => getFileMeta(id)))
  if (metas.some((m) => m === null)) throw new ServiceJobPhotoMissingError()
}

async function writeStepRecord(tx: Tx, order: { id: string; shopId: string }, phase: 'BEFORE' | 'AFTER', step: Step, actorUserId: string) {
  if (step.fileIds.length === 0 && !step.note) return
  await tx.serviceJobRecord.create({
    data: { orderId: order.id, shopId: order.shopId, phase, note: step.note, fileIds: step.fileIds, createdByUserId: actorUserId },
  })
}

export type ServiceJobStepArgs = {
  shopId: string
  orderToken: string
  actorUserId: string
  /** บทบาทที่มีผลของผู้กด (ctx.roles จาก requireShopCapability) */
  actorRoles: readonly ShopRole[]
  /** fileId จาก uploadToStorage({ purpose: 'IMAGE' }) — ห้ามส่งตัวไฟล์ผ่าน route (upload-body-size-limit) */
  photoFileIds?: readonly string[]
  note?: string | null
  now?: Date
}

/**
 * เริ่มงาน (00078 FR-CS-26 + 00086 FR-009) — ตั้ง `serviceStartedAt` ครั้งเดียว · idempotent (กดซ้ำคืนค่าเดิม ไม่ส่งซ้ำ)
 * 00086: ช่างล้วนเริ่มได้เฉพาะงานของตัวเอง · รูป "ก่อนทำ" ตามการตั้งค่าร้าน · บันทึก ServiceJobRecord BEFORE ใน tx เดียวกัน
 * 🛑 เริ่มแล้ว → คืน alreadyStarted **ก่อน** ตรวจรูป (กดซ้ำ/รีเทรย์หลังเน็ตหลุด ต้องไม่ได้ 400)
 * 🛑 ไม่แตะ Order.status / appointmentStatus / เงิน — เป็นแค่ "เวลา" ไม่ใช่สถานะ
 */
export async function startServiceJob(args: ServiceJobStepArgs) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)
  const step = normalizeStep(args)

  const pre = await loadJob(prisma, args.shopId, args.orderToken)
  if (!pre) throw new ServiceJobNotFoundError()
  if (pre.serviceClosedAt != null) throw new ServiceJobAlreadyClosedError()
  if (pre.serviceStartedAt != null) return { serviceStartedAt: pre.serviceStartedAt, alreadyStarted: true }
  assertActorOwnsJob(args.actorRoles, pre, args.actorUserId, 'START')
  if (!CLOSABLE_STATUSES.includes(pre.status)) throw new ServiceJobNotStartableError() // ยกเลิก/คืน/ร่าง
  if (pre.serviceStart != null && now.getTime() < pre.serviceStart.getTime()) throw new AppointmentNotStartedError()
  assertServiceJobPhotoInput(pre.shop.serviceJobPhotoMode, step.fileIds)
  await assertPhotosExist(step.fileIds)

  let ledgerId: string | null = null
  let orderId: string | null = null
  const result = await prisma.$transaction(async (tx) => {
    ledgerId = null
    orderId = null
    const order = await loadJob(tx, args.shopId, args.orderToken)
    if (!order) throw new ServiceJobNotFoundError()
    if (order.serviceClosedAt != null) throw new ServiceJobAlreadyClosedError()
    if (order.serviceStartedAt != null) return { serviceStartedAt: order.serviceStartedAt, alreadyStarted: true }
    assertActorOwnsJob(args.actorRoles, order, args.actorUserId, 'START')
    if (!CLOSABLE_STATUSES.includes(order.status)) throw new ServiceJobNotStartableError()
    if (order.serviceStart != null && now.getTime() < order.serviceStart.getTime()) throw new AppointmentNotStartedError()
    // ร้านเปลี่ยนโหมดรูประหว่างตรวจไฟล์ — ตัดสินซ้ำกับค่าล่าสุด
    assertServiceJobPhotoInput(order.shop.serviceJobPhotoMode, step.fileIds)

    // WHERE serviceStartedAt IS NULL = เขียนครั้งเดียว แม้สองคนกดพร้อมกัน
    const updated = await tx.order.updateMany({
      where: {
        id: order.id, serviceStartedAt: null, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES },
        ...actorWhere(args.actorRoles, args.actorUserId),
      },
      data: { serviceStartedAt: now },
    })
    if (updated.count === 0) {
      const again = await tx.order.findUnique({
        where: { id: order.id },
        select: { serviceStartedAt: true, assignedUserId: true, assignedUser: { select: { displayName: true } } },
      })
      if (again?.serviceStartedAt) return { serviceStartedAt: again.serviceStartedAt, alreadyStarted: true }
      if (again) assertActorOwnsJob(args.actorRoles, again, args.actorUserId, 'START') // ถูกเปลี่ยนผู้รับผิดชอบแทรก
      throw new ServiceJobNotStartableError()
    }

    await writeStepRecord(tx, order, 'BEFORE', step, args.actorUserId)
    await recordOrderEvent(tx, {
      orderId: order.id, type: 'SERVICE_STARTED', actorUserId: args.actorUserId, occurredAt: now, meta: stepMeta(step),
    })
    ledgerId = await reserveAutoNotifyIntent(tx, {
      shopId: order.shopId, orderId: order.id, conversationId: order.conversationId,
      kind: 'SERVICE_STARTED', isDryRun: order.isDryRun, keyedInAt: now,
    })
    orderId = order.id
    return { serviceStartedAt: now, alreadyStarted: false }
  })
  const id = ledgerId as string | null
  if (id) runAfterResponse(() => dispatchAutoNotify(id))
  const oid = orderId as string | null
  if (oid) runAfterResponse(() => notifyServiceJob({ shopId: args.shopId, orderId: oid, actorUserId: args.actorUserId, event: 'STARTED' }))
  return result
}

/**
 * ทำเสร็จแล้ว (00086 FR-010 · S-9) — ตั้ง `serviceFinishedAt` ครั้งเดียว + รูป "หลังทำ" + บันทึก
 * 🛑 ไม่แตะเงิน/สถานะใบ/serviceClosedAt (OOS-9) — ยอดขาย/กำไร (00073/00078) นับตอนปิดงานเท่านั้น
 * แจ้งลูกค้า SERVICE_FINISHED เฉพาะร้านที่เปิด "ลูกค้าเห็นรูป" (ไม่มีสวิตช์แยก · PRD §10.2)
 */
export async function finishServiceJob(args: ServiceJobStepArgs) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)
  const step = normalizeStep(args)

  const check = (o: NonNullable<Awaited<ReturnType<typeof loadJob>>>) => {
    if (o.serviceClosedAt != null) throw new ServiceJobAlreadyClosedError()
    if (o.serviceFinishedAt != null) return { serviceFinishedAt: o.serviceFinishedAt, alreadyFinished: true }
    assertActorOwnsJob(args.actorRoles, o, args.actorUserId, 'FINISH')
    if (o.serviceStartedAt == null) throw new ServiceJobNotStartedError()
    if (!CLOSABLE_STATUSES.includes(o.status)) throw new ServiceJobNotStartableError()
    assertServiceJobPhotoInput(o.shop.serviceJobPhotoMode, step.fileIds)
    return null
  }

  const pre = await loadJob(prisma, args.shopId, args.orderToken)
  if (!pre) throw new ServiceJobNotFoundError()
  const early = check(pre)
  if (early) return early
  await assertPhotosExist(step.fileIds)

  let ledgerId: string | null = null
  let orderId: string | null = null
  const result = await prisma.$transaction(async (tx) => {
    ledgerId = null
    orderId = null
    const order = await loadJob(tx, args.shopId, args.orderToken)
    if (!order) throw new ServiceJobNotFoundError()
    const done = check(order)
    if (done) return done

    const updated = await tx.order.updateMany({
      where: {
        id: order.id, serviceFinishedAt: null, serviceStartedAt: { not: null }, serviceClosedAt: null,
        status: { in: CLOSABLE_STATUSES }, ...actorWhere(args.actorRoles, args.actorUserId),
      },
      data: { serviceFinishedAt: now },
    })
    if (updated.count === 0) {
      const again = await loadJob(tx, args.shopId, args.orderToken)
      if (!again) throw new ServiceJobNotFoundError()
      const r = check(again)
      if (r) return r
      throw new ServiceJobNotStartableError()
    }

    await writeStepRecord(tx, order, 'AFTER', step, args.actorUserId)
    await recordOrderEvent(tx, {
      orderId: order.id, type: 'SERVICE_FINISHED', actorUserId: args.actorUserId, occurredAt: now, meta: stepMeta(step),
    })
    // ด่านเดียวกับ reserveInner (photosBuyerVisible) — ไม่เข้าเงื่อนไขก็ไม่ต้องเปิด savepoint/ล็อกห้อง
    if (order.shop.serviceJobPhotosBuyerVisible && order.shop.serviceJobPhotoMode !== 'NONE') {
      ledgerId = await reserveAutoNotifyIntent(tx, {
        shopId: order.shopId, orderId: order.id, conversationId: order.conversationId,
        kind: 'SERVICE_FINISHED', isDryRun: order.isDryRun, keyedInAt: now,
      })
    }
    orderId = order.id
    return { serviceFinishedAt: now, alreadyFinished: false }
  })
  const id = ledgerId as string | null
  if (id) runAfterResponse(() => dispatchAutoNotify(id))
  const oid = orderId as string | null
  if (oid) runAfterResponse(() => notifyServiceJob({ shopId: args.shopId, orderId: oid, actorUserId: args.actorUserId, event: 'FINISHED' }))
  return result
}

// ─── ผู้รับผิดชอบ (S-6 · FR-007/008) ─────────────────────────────────────────────────────────────

const ASSIGN_SELECT = {
  id: true, status: true, serviceClosedAt: true, assignedUserId: true,
  assignedUser: { select: { displayName: true } },
} as const

/** ใบที่ยังเปลี่ยนผู้รับผิดชอบได้ — ปิดแล้ว/ยกเลิก/คืน/ร่าง = SERVICE_JOB_ALREADY_CLOSED (API §4.7) */
function assertAssignable(o: { status: string; serviceClosedAt: Date | null }) {
  if (o.serviceClosedAt != null || !CLOSABLE_STATUSES.includes(o.status)) throw new ServiceJobAlreadyClosedError()
}

/**
 * ล็อกแถวสมาชิก (FOR SHARE) ก่อนอ่านบทบาท — กันแข่งกับ changeMemberRole/removeShopMember (MINOR-3)
 *
 * สองตัวนั้น UPDATE/DELETE แถวนี้ก่อนแล้วค่อยปลดงาน (unassignMemberOpenJobs) ใน tx เดียวกัน ⇒ ล็อกนี้บังคับลำดับ:
 *  - เขาเปลี่ยนก่อน → เรารอจน commit แล้วอ่านบทบาทใหม่ (READ COMMITTED: statement ถัดไปเห็นค่าล่าสุด) → ปฏิเสธ
 *  - เราล็อกก่อน → UPDATE/DELETE ของเขารอเรา commit แล้วขั้นปลดงานของเขาเห็นใบที่เราเพิ่งมอบ → ปลดให้
 * ไม่มีลำดับไหนเหลือ "งานค้างชื่อคนที่ไม่ใช่ช่างแล้ว" · ไม่มีแถว = ไม่ล็อกอะไร (ผู้เรียกปฏิเสธจากผลอ่านอยู่แล้ว)
 * 🛑 $queryRaw แบบ tagged template เท่านั้น (ค่าเป็นพารามิเตอร์) — ห้ามต่อสตริง
 */
async function lockMemberRow(tx: Tx, shopId: string, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM "ShopMember" WHERE "shopId" = ${shopId} AND "userId" = ${userId} FOR SHARE`
}

/**
 * ผู้ถูกมอบต้องเป็นสมาชิกร้านที่ "บทบาทที่มีผลจริง" ถือ TECHNICIAN (effectiveRoles — PERSONAL = เจ้าของเสมอ ⇒ ไม่ใช่ช่าง)
 * ใช้ร่วมกับ createOrder (มอบตอนสร้างงาน) และ claim (ผู้กดรับเอง) — กติกาเดียวทุกทาง · คืนชื่อไว้ snapshot ลงประวัติ
 * 🛑 ต้องเรียกใน tx เดียวกับการเขียน assignedUserId — ล็อกแถวสมาชิกจนจบ tx (lockMemberRow) แล้วตัดสินจากบทบาทใน DB
 *    ไม่ใช่จาก ctx ของคำขอ (บทบาทถูกเปลี่ยนระหว่างทางได้)
 */
export async function resolveTechnicianAssignee(tx: Tx, shopId: string, userId: string): Promise<{ displayName: string }> {
  await lockMemberRow(tx, shopId, userId)
  const shop = await tx.shop.findUnique({
    where: { id: shopId },
    select: {
      kind: true, vertical: true,
      members: { where: { userId }, select: { role: true, roles: true, user: { select: { displayName: true } } }, take: 1 },
    },
  })
  const m = shop?.members[0]
  if (!shop || !m || !effectiveRoles(shop, m.role, m.roles).includes('TECHNICIAN')) throw new AssigneeNotTechnicianError()
  return { displayName: m.user.displayName }
}

/** มอบงาน / เปลี่ยนคน (O2s · route ตรวจ) — ค่าเดิมเท่ากัน = no-op ไม่บันทึกประวัติ · มอบใหม่ได้แม้เริ่มงานแล้ว (ก่อนปิดเท่านั้น) */
export async function assignServiceJob(args: { shopId: string; orderToken: string; actorUserId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { publicToken: args.orderToken, shopId: args.shopId }, select: ASSIGN_SELECT })
    if (!order) throw new ServiceJobNotFoundError()
    assertAssignable(order)
    const assignee = await resolveTechnicianAssignee(tx, args.shopId, args.userId)

    // NIT-3: ตรึง "คนเดิมที่อ่านมา" ใน WHERE (null-safe: Prisma แปลง null เป็น IS NULL) — คนกดรับ/มอบแทรกระหว่างอ่านกับเขียน
    // = count 0 → อ่านใหม่แล้วลองอีกครั้งเดียวด้วยค่าล่าสุด ⇒ previousAssigneeNameSnapshot เป็นคนที่ถูกแทนจริง ไม่ใช่ค่าเก่า
    // (ท่าเดียวกับ claim: updateMany + เงื่อนไขซ้ำ แล้วอ่านซ้ำเมื่อแพ้) · แพ้ซ้ำอีก = ALREADY_CLOSED ตามเดิม (API §4.7 ไม่มีรหัสใหม่)
    let current = order
    for (let attempt = 0; attempt < 2; attempt++) {
      if (current.assignedUserId === args.userId) return { assignedUserId: args.userId, assigneeName: assignee.displayName }
      const updated = await tx.order.updateMany({
        where: { id: current.id, assignedUserId: current.assignedUserId, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES } },
        data: { assignedUserId: args.userId },
      })
      if (updated.count === 1) {
        await recordOrderEvent(tx, {
          orderId: current.id, type: 'SERVICE_ASSIGNED', actorUserId: args.actorUserId, occurredAt: now,
          meta: {
            assigneeNameSnapshot: assignee.displayName,
            ...(current.assignedUser ? { previousAssigneeNameSnapshot: current.assignedUser.displayName } : {}),
          },
        })
        return { assignedUserId: args.userId, assigneeName: assignee.displayName }
      }
      const again = await tx.order.findUnique({ where: { id: current.id }, select: ASSIGN_SELECT })
      if (!again) throw new ServiceJobNotFoundError()
      assertAssignable(again)
      current = again
    }
    throw new ServiceJobAlreadyClosedError()
  })
}

/** ยกเลิกผู้รับผิดชอบ (O2s) — ไม่มีอยู่แล้ว = no-op */
export async function unassignServiceJob(args: { shopId: string; orderToken: string; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { publicToken: args.orderToken, shopId: args.shopId }, select: ASSIGN_SELECT })
    if (!order) throw new ServiceJobNotFoundError()
    assertAssignable(order)
    if (order.assignedUserId == null) return { assignedUserId: null }
    const updated = await tx.order.updateMany({
      where: { id: order.id, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES } },
      data: { assignedUserId: null },
    })
    if (updated.count === 0) throw new ServiceJobAlreadyClosedError()
    await recordOrderEvent(tx, {
      orderId: order.id, type: 'SERVICE_UNASSIGNED', actorUserId: args.actorUserId, occurredAt: now,
      meta: { reason: 'MANUAL', ...(order.assignedUser ? { previousAssigneeNameSnapshot: order.assignedUser.displayName } : {}) },
    })
    return { assignedUserId: null }
  })
}

/**
 * รับงานนี้ (O4 + ถือ TECHNICIAN · API §4.8) — ตั้งตัวเองเป็นผู้รับผิดชอบ
 * 🛑 กันกดพร้อมกัน: updateMany WHERE assignedUserId IS NULL — ผู้แพ้ได้ count 0 → ALREADY_ASSIGNED พร้อมชื่อผู้ชนะ
 * กดซ้ำโดยคนเดิม = สำเร็จเงียบ (ไม่บันทึกซ้ำ ไม่แจ้งซ้ำ)
 */
export async function claimServiceJob(args: { shopId: string; orderToken: string; actorUserId: string; actorRoles: readonly ShopRole[]; now?: Date }) {
  const now = args.now ?? new Date()
  await assertShopCanUseAppointments(args.shopId)
  if (!canClaimServiceJob(args.actorRoles)) throw new ServiceJobClaimTechnicianOnlyError()

  let orderId: string | null = null
  const result = await prisma.$transaction(async (tx) => {
    orderId = null
    const order = await tx.order.findFirst({ where: { publicToken: args.orderToken, shopId: args.shopId }, select: ASSIGN_SELECT })
    if (!order) throw new ServiceJobNotFoundError()
    assertAssignable(order)
    // ctx.roles ข้างบนเป็นแค่ด่านตอบเร็ว — ตัดสินจริงจากแถวสมาชิกใน DB ที่ล็อกไว้ (บทบาทถูกถอดระหว่างทางได้ · MINOR-3)
    // รหัสเดิม (CLAIM_TECHNICIAN_ONLY) ไม่ใช่ ASSIGNEE_NOT_TECHNICIAN — ผู้กดคือผู้ถูกตรวจ
    let me: { displayName: string }
    try {
      me = await resolveTechnicianAssignee(tx, args.shopId, args.actorUserId)
    } catch (e) {
      if (e instanceof AssigneeNotTechnicianError) throw new ServiceJobClaimTechnicianOnlyError()
      throw e
    }

    const updated = await tx.order.updateMany({
      where: { id: order.id, assignedUserId: null, serviceClosedAt: null, status: { in: CLOSABLE_STATUSES } },
      data: { assignedUserId: args.actorUserId },
    })
    if (updated.count === 0) {
      const again = await tx.order.findUnique({ where: { id: order.id }, select: ASSIGN_SELECT })
      if (!again) throw new ServiceJobNotFoundError()
      if (again.assignedUserId === args.actorUserId) return { assignedUserId: args.actorUserId }
      assertAssignable(again)
      throw new ServiceJobAlreadyAssignedError(again.assignedUser?.displayName ?? null)
    }
    await recordOrderEvent(tx, {
      orderId: order.id, type: 'SERVICE_CLAIMED', actorUserId: args.actorUserId, occurredAt: now,
      ...(me.displayName ? { meta: { assigneeNameSnapshot: me.displayName } } : {}),
    })
    orderId = order.id
    return { assignedUserId: args.actorUserId }
  })
  const oid = orderId as string | null
  if (oid) runAfterResponse(() => notifyServiceJob({ shopId: args.shopId, orderId: oid, actorUserId: args.actorUserId, event: 'CLAIMED' }))
  return result
}

/**
 * เหตุที่ระบบปลดผู้รับผิดชอบเอง (meta.reason ของ SERVICE_UNASSIGNED) — 'MANUAL' เป็นของการกดยกเลิกเองใน unassignServiceJob
 *  - MEMBER_REMOVED: ถูกลบออกจากร้าน (SDS §3.11)
 *  - ROLE_REMOVED:   ยังอยู่ในร้านแต่ไม่ได้ถือ "ช่าง" แล้ว (แก้บทบาท · เลื่อนเป็นเจ้าของ · รับโอนร้าน) — user อนุมัติ 2026-10-29
 */
export type MemberUnassignReason = 'MEMBER_REMOVED' | 'ROLE_REMOVED'

/**
 * สมาชิกหมดสิทธิ์เป็นผู้รับผิดชอบ → งานที่ยังเปิดของเขากลับเป็น "ยังไม่มีคนรับ" · ใบที่ปิดแล้ว/ยกเลิก/คืน คงชื่อไว้เป็นประวัติ
 * ไม่แตะ serviceStartedAt/serviceFinishedAt/ServiceJobRecord (สิ่งที่ทำไปแล้วยังเป็นข้อเท็จจริง — คนใหม่รับต่อจากจุดเดิม)
 * เรียกใน tx เดียวกับการเปลี่ยนแถวสมาชิก (shop-member.service) — สมาชิกเปลี่ยนสำเร็จแต่งานยังค้างชื่อ = ไม่มีใครเริ่ม/ปิดงานนั้นได้
 * (ช่างล้วนคนอื่นติดด่าน "งานของคนอื่น") · ร้านที่ไม่มีงานมอบ = no-op (query เดียวบน index assignedUserId)
 */
export async function unassignMemberOpenJobs(
  tx: Tx,
  args: { shopId: string; userId: string; actorUserId: string; reason: MemberUnassignReason; now?: Date },
) {
  const now = args.now ?? new Date()
  const jobs = await tx.order.findMany({
    where: { shopId: args.shopId, assignedUserId: args.userId, serviceClosedAt: null, status: { notIn: ['CANCELLED', 'RETURNED'] } },
    select: { id: true, assignedUser: { select: { displayName: true } } },
  })
  if (jobs.length === 0) return 0
  await tx.order.updateMany({
    where: { id: { in: jobs.map((j) => j.id) }, assignedUserId: args.userId },
    data: { assignedUserId: null },
  })
  for (const j of jobs) {
    await recordOrderEvent(tx, {
      orderId: j.id, type: 'SERVICE_UNASSIGNED', actorUserId: args.actorUserId, occurredAt: now,
      meta: { reason: args.reason, ...(j.assignedUser ? { previousAssigneeNameSnapshot: j.assignedUser.displayName } : {}) },
    })
  }
  return jobs.length
}

/**
 * ปิดบัญชี (deleteAccount · reclaim บัญชีค้าง) → งานเปิดที่มอบให้ผู้ใช้นี้ **ทุกร้านบริการ** กลับเป็น "ยังไม่มีคนรับ" (M2)
 * หาร้านจากตัวงานเอง ไม่ใช่จากแถวสมาชิก — ครอบทั้งร้านที่ถูกเชิญและร้านที่เป็นเจ้าของ (ไม่แตะความเป็นเจ้าของ)
 * 🛑 เรียกใน tx เดียวกับการลบแถวสมาชิก และ **หลัง** shopMember.deleteMany: มอบงานที่แข่งเข้ามาล็อกแถวสมาชิกไว้ (lockMemberRow)
 *    ⇒ deleteMany รอจนอีกฝั่ง commit แล้วขั้นนี้เห็นใบที่เพิ่งมอบ · ถ้าปลดก่อนลบ ใบที่มอบแทรกเข้ามาจะค้างชื่อ
 */
export async function unassignUserOpenJobsEverywhere(tx: Tx, args: { userId: string; actorUserId: string; now?: Date }) {
  const shops = await tx.order.findMany({
    // ร้านบริการเท่านั้น (canUseAppointments) — ร้านประเภทอื่นไม่มีแกนผู้รับผิดชอบ ⇒ ไม่แตะแถวของร้านเหล่านั้นแม้มีค่าค้าง
    where: {
      assignedUserId: args.userId, serviceClosedAt: null, status: { notIn: ['CANCELLED', 'RETURNED'] },
      shop: { vertical: 'SERVICE_QUEUE' },
    },
    select: { shopId: true },
    distinct: ['shopId'],
  })
  let count = 0
  for (const { shopId } of shops) {
    count += await unassignMemberOpenJobs(tx, { shopId, userId: args.userId, actorUserId: args.actorUserId, reason: 'MEMBER_REMOVED', now: args.now })
  }
  return count
}

/**
 * รายชื่อช่างของร้าน (ชีตมอบงาน · ฟอร์มสร้างงาน — API §4.10) — ชื่ออย่างเดียว ไม่มีเบอร์/อีเมล · ร้านอื่น = []
 *
 * opts.window (มติ 2026-10-30 · ร้านช่างเยอะ) — แนบ `load` ต่อคน: งานในวันเดียวกัน + งานที่ยังไม่จบซึ่งซ้อนช่วงนี้
 * นับเฉพาะงานที่มอบแล้ว ไม่ใช่ร่าง/ยกเลิก/คืน (ชุดเดียวกับ "งานของฉัน") · excludeToken = งานที่กำลังมอบ (ไม่นับตัวเอง)
 * ไม่มีข้อมูลลูกค้าใน load — เวลาเริ่ม/จบเท่านั้น
 */
export async function listServiceStaff(
  shopId: string,
  opts?: { window: LoadWindow; excludeToken?: string | null },
): Promise<{ userId: string; displayName: string; load?: StaffLoad }[]> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { kind: true, vertical: true, members: { select: { userId: true, role: true, roles: true, user: { select: { displayName: true } } } } },
  })
  if (!shop || !canUseAppointments(shop)) return []
  const staff = shop.members
    .filter((m) => effectiveRoles(shop, m.role, m.roles).includes('TECHNICIAN'))
    .map((m) => ({ userId: m.userId, displayName: m.user.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'))
  if (!opts?.window || staff.length === 0) return staff

  const day = loadDayBounds(opts.window)
  const ids = staff.map((s) => s.userId)
  const rows = await prisma.order.findMany({
    where: {
      shopId,
      assignedUserId: { in: ids },
      ...withoutDrafted(['CANCELLED', 'RETURNED']),
      serviceStart: { lt: day.to },
      serviceEnd: { gt: day.from },
    },
    select: {
      assignedUserId: true, publicToken: true, serviceStart: true, serviceEnd: true,
      serviceFinishedAt: true, serviceClosedAt: true, appointmentStatus: true,
    },
  })
  const load = computeStaffLoad(ids, rows, opts.window, opts.excludeToken)
  return staff.map((s) => ({ ...s, load: load.get(s.userId)! }))
}

/**
 * ตั้งค่ารูปก่อน-หลัง (Q2 · API §4.11) — ส่งทีละฟิลด์ได้ · NONE ⇒ buyerVisible = false บังคับที่ server
 * (CHECK Shop_serviceJobPhoto_check เป็นด่านที่สอง) · ร้านไม่ใช่บริการ → FEATURE_NOT_AVAILABLE
 */
export async function updateServiceJobPhotoSettings(
  shopId: string,
  input: { mode?: ServiceJobPhotoMode; buyerVisible?: boolean },
): Promise<{ mode: ServiceJobPhotoMode; buyerVisible: boolean }> {
  await assertShopCanUseAppointments(shopId)
  return prisma.$transaction(async (tx) => {
    const cur = await tx.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { serviceJobPhotoMode: true, serviceJobPhotosBuyerVisible: true },
    })
    const mode = (input.mode ?? cur.serviceJobPhotoMode) as ServiceJobPhotoMode
    const buyerVisible = mode === 'NONE' ? false : (input.buyerVisible ?? cur.serviceJobPhotosBuyerVisible)
    const row = await tx.shop.update({
      where: { id: shopId },
      data: { serviceJobPhotoMode: mode, serviceJobPhotosBuyerVisible: buyerVisible },
      select: { serviceJobPhotoMode: true, serviceJobPhotosBuyerVisible: true },
    })
    return { mode: row.serviceJobPhotoMode as ServiceJobPhotoMode, buyerVisible: row.serviceJobPhotosBuyerVisible }
  })
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
