/**
 * auto-notify.service — เครื่องยนต์ส่งข้อความแจ้งลูกค้าอัตโนมัติ (00078 S-9/S-11/S-14 · SDS §4.1-4.2 · TD-001..004)
 *
 *   reserveAutoNotifyIntent  — จอง "เจตนาส่ง" (INTENT) ใน tx เดียวกับเหตุการณ์ (SAVEPOINT: ล้ม ≠ พางานหลักล้ม)
 *   dispatchAutoNotify       — claim → ตรวจซ้ำ → ประกอบ → ส่ง → ผูกข้อความ → ปิดผล (ไม่ throw: เรียกจาก after())
 *   sweepAutoNotify          — ตัวกวาด INTENT ที่ค้าง (ต่อท้าย cron chat-outbox)
 *
 * 🛑 `claimedAt` คือเกณฑ์ความปลอดภัยเดียวของ "ห้ามส่งซ้ำ" (Meta ไม่มี idempotency key):
 * มีค่าแล้ว = อาจส่งไปแล้ว → ตัวกวาดห้ามยิงซ้ำเด็ดขาด ปิดเป็น FAILED/UNCERTAIN_SEND เท่านั้น
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { evaluateAutoNotifyEligibility } from '@/lib/auto-notify/eligibility'
import { isImplicitKind } from '@/lib/auto-notify/kinds'
import {
  LEDGER_FIXED_KEY,
  TRACKING_NOTICE_MAX,
  DAILY_CAP_DEFAULT,
  mapFailureToLedgerReason,
  normalizeTrackingKey,
  thaiDayStart,
} from '@/lib/auto-notify/ledger'
import type { AutoNotifyKind, AutoNotifyLedgerReason } from '@/lib/auto-notify/ledger-constants'
import type { FitChannel } from '@/lib/auto-notify/fit'
import { UNCERTAIN_SEND_REASON, STALE_CLAIM_MS, type ClaimOwner } from '@/lib/chat-send-queue'
import { recordOrderEventSafe } from '@/services/order-event.service'
import { composeNotice, externalCardParts } from '@/services/auto-notify-message.service'
import { sendMessage } from '@/services/chat.service'
import { enqueueOutbound, deliverRoom } from '@/services/chat-outbox.service'
import { runAfterResponse } from '@/lib/run-after-response'

type Tx = Prisma.TransactionClient

const errTag = (e: unknown): string => {
  // ไม่ log message ของ Prisma (อาจมีค่าพารามิเตอร์) — ชื่อ + code พอสืบได้
  const code = (e as { code?: unknown } | null)?.code
  return `${e instanceof Error ? e.name : typeof e}${typeof code === 'string' ? `:${code}` : ''}`
}

/**
 * 00086 — ร้านเปิดให้ลูกค้าเห็นรูปก่อน-หลังไหม (ตัวตัดสิน SERVICE_FINISHED) · NONE = ไม่มีรูปให้ดู ⇒ false เสมอ
 * อ่านจากแถวร้านตอนจอง/ตอนส่ง (ไม่เชื่อค่าที่ผู้เรียกส่งมา) — ร้านปิดการมองเห็นระหว่างรอส่ง = ไม่ส่ง
 */
function photosBuyerVisibleOf(shop: { serviceJobPhotoMode: string; serviceJobPhotosBuyerVisible: boolean }): boolean {
  return shop.serviceJobPhotosBuyerVisible === true && shop.serviceJobPhotoMode !== 'NONE'
}

/**
 * สวิตช์ของชนิดนี้ — ชนิด "implicit" (IMPLICIT_KINDS · PRD §10.2) ไม่มีแถว AutoNotifySwitch:
 * ถือ "ลูกค้าเห็นรูป" ของร้านเป็นค่าสวิตช์ และ enabledAt = epoch (ไม่มีจังหวะเปิดสวิตช์ให้เทียบ "ก่อนเปิด")
 * ชนิดอื่นอ่านแถวสวิตช์ตามเดิมทุกประการ
 */
async function switchStateOf(
  db: Tx | typeof prisma,
  shopId: string,
  kind: AutoNotifyKind,
  photosBuyerVisible: boolean,
): Promise<{ switchEnabled: boolean; enabledAt: Date | null }> {
  if (isImplicitKind(kind)) return { switchEnabled: photosBuyerVisible, enabledAt: new Date(0) }
  const sw = await db.autoNotifySwitch.findUnique({
    where: { shopId_kind: { shopId, kind } },
    select: { enabled: true, enabledAt: true },
  })
  return { switchEnabled: !!sw?.enabled, enabledAt: sw?.enabledAt ?? null }
}

// ══════════════════════════════════════════════════════════════════════════
// reserve
// ══════════════════════════════════════════════════════════════════════════

export interface ReserveInput {
  shopId: string
  orderId: string
  conversationId: string | null
  kind: AutoNotifyKind
  /** TRACKING: เลขพัสดุ (จะถูก normalize) · ชนิดอื่น: ไม่ต้องส่ง (ใช้ '-') */
  valueKey?: string
  isDryRun: boolean
  /** เวลาที่ผู้ขายคีย์จริง (ฝั่ง server) — ใช้ตัดสิน "ย้อนหลัง" D-13 */
  keyedInAt: Date
  /** createdAt ที่ client ส่งมา (วันที่สั่งซื้อที่ผู้ขายระบุ) — ไม่ได้ส่ง = null */
  createdAtInput?: Date | null
}

async function insertLedgerRow(
  tx: Tx,
  p: ReserveInput,
  key: string,
  createdAt: Date,
  status: 'INTENT' | 'SKIPPED',
  reason: AutoNotifyLedgerReason | null,
): Promise<string | null> {
  // ON CONFLICT DO NOTHING — ห้ามใช้ create+catch P2002 (ก่อ ERROR ใน log Postgres: insert-then-catch)
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "AutoNotifyLedger" ("id","shopId","orderId","conversationId","kind","valueKey","status","reason","createdAt","settledAt")
    VALUES (gen_random_uuid()::text, ${p.shopId}, ${p.orderId}, ${p.conversationId}, ${p.kind}, ${key},
            ${status}::text, ${reason}::text, ${createdAt}::timestamptz,
            CASE WHEN ${status}::text = 'INTENT' THEN NULL ELSE ${createdAt}::timestamptz END)
    ON CONFLICT ("shopId","orderId","kind","valueKey") DO NOTHING
    RETURNING "id"`
  return rows[0]?.id ?? null
}

async function reserveInner(tx: Tx, p: ReserveInput): Promise<string | null> {
  // เวลาจาก DB เครื่องเดียวกับ enabledAt/createdAt (ทั้งคู่เป็นเวลา DB) — กัน clock skew ทำให้ "ก่อนเปิดสวิตช์" ผิด
  const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`

  const order = await tx.order.findFirst({
    // shopId มาจากแถวออเดอร์ (ownership ใน WHERE) ไม่เชื่อค่าที่ผู้เรียกประกาศอย่างเดียว
    where: { id: p.orderId, shopId: p.shopId },
    select: {
      publicToken: true,
      status: true,
      serviceStart: true,
      appointmentStatus: true,
      serviceClosedAt: true,
      shop: { select: { vertical: true, serviceJobPhotoMode: true, serviceJobPhotosBuyerVisible: true } },
    },
  })
  if (!order) return null

  const key = p.kind === 'TRACKING' ? normalizeTrackingKey(p.valueKey ?? '') : LEDGER_FIXED_KEY
  const photosBuyerVisible = photosBuyerVisibleOf(order.shop)
  const [sw, conv] = await Promise.all([
    switchStateOf(tx, p.shopId, p.kind, photosBuyerVisible),
    p.conversationId ? tx.conversation.findFirst({ where: { id: p.conversationId, shopId: p.shopId }, select: { id: true } }) : null,
  ])

  const e = evaluateAutoNotifyEligibility({
    kind: p.kind,
    vertical: order.shop.vertical,
    switchEnabled: sw.switchEnabled,
    enabledAt: sw.enabledAt,
    photosBuyerVisible,
    eventAt: now,
    conversationId: conv ? p.conversationId : null,
    isDryRun: p.isDryRun,
    createdAt: p.createdAtInput ?? null,
    keyedInAt: p.keyedInAt,
    orderStatus: order.status,
    trackingNo: p.kind === 'TRACKING' ? key : undefined,
    serviceStart: order.serviceStart,
    appointmentStatus: order.appointmentStatus,
    serviceClosedAt: order.serviceClosedAt,
    // ผู้เรียกจองเฉพาะ SERVED · NO_SHOW เขียน appointmentStatus=NO_SHOW ไว้แล้ว (service-job.service)
    closeOutcome: p.kind === 'SERVICE_CLOSED' ? (order.appointmentStatus === 'NO_SHOW' ? 'NO_SHOW' : 'SERVED') : null,
    nowMs: +now,
  })
  if (!e.eligible) return null // เหตุผลพวกนี้ไม่บันทึก (PRD §4.3) — ไม่ใช่เหตุการณ์ที่ควรส่ง
  const conversationId = p.conversationId!

  // BR-CS-C15: ผู้ขายส่งการ์ดใบนี้ด้วยมือไปแล้ว → ไม่ส่งซ้ำ (TD-007 · ตัวแยกการ์ดออเดอร์/การ์ดนัดคือ body — D-15)
  if (p.kind === 'ORDER_SUMMARY' || p.kind === 'SERVICE_BOOKED') {
    const manual = await tx.chatMessage.findFirst({
      where: {
        conversationId,
        type: 'ORDER',
        orderRefToken: order.publicToken,
        senderRole: 'SHOP',
        autoReplyKind: null,
        body: p.kind === 'ORDER_SUMMARY' ? null : { not: null },
        OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'FAILED' } }],
      },
      select: { id: true },
    })
    if (manual) return null
  }

  // TD-002: ล็อกต่อห้องถึง COMMIT — นับแล้วจองต้องไม่มีใครแทรก (TC-138)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'auto-notify:' + conversationId}, 0))`

  // D-4: เลขพัสดุเปลี่ยนแจ้งซ้ำได้ไม่เกิน 3 ครั้งต่อใบ (นับเฉพาะที่ส่ง/กำลังส่ง — แถวข้ามไม่นับ)
  if (p.kind === 'TRACKING') {
    const sent = await tx.autoNotifyLedger.count({
      where: { orderId: p.orderId, kind: 'TRACKING', status: { in: ['INTENT', 'SENT'] } },
    })
    if (sent >= TRACKING_NOTICE_MAX) {
      await insertLedgerRow(tx, p, key, now, 'SKIPPED', 'RESEND_LIMIT')
      return null
    }
  }

  const capRow = await tx.autoNotifyConfig.findUnique({ where: { shopId: p.shopId }, select: { dailyCapPerRoom: true } })
  const cap = capRow?.dailyCapPerRoom ?? DAILY_CAP_DEFAULT
  const used = await tx.autoNotifyLedger.count({
    where: { conversationId, status: { in: ['INTENT', 'SENT'] }, createdAt: { gte: thaiDayStart(now) } },
  })
  if (used >= cap) {
    await insertLedgerRow(tx, p, key, now, 'SKIPPED', 'DAILY_CAP') // ไม่ส่งเงียบ (BR-CS-C19)
    return null
  }

  return insertLedgerRow(tx, p, key, now, 'INTENT', null)
}

/**
 * จองเจตนาส่งในทรานแซกชันของผู้เรียก — คืน ledgerId (ผู้เรียกสั่ง `runAfterResponse(dispatch)` หลัง commit) หรือ null = ไม่ส่ง
 * ล้มเหลวทุกแบบ = ROLLBACK TO SAVEPOINT + log แล้วคืน null: ห้ามพางานหลัก (ออเดอร์/เลข/ปิดงาน) ล้มตาม (BR-CS-C13)
 */
export async function reserveAutoNotifyIntent(tx: Tx, p: ReserveInput): Promise<string | null> {
  try {
    await tx.$executeRawUnsafe('SAVEPOINT auto_notify_reserve')
  } catch (e) {
    console.error('[auto-notify] เปิด savepoint ไม่ได้ (งานหลักไม่กระทบ)', { kind: p.kind, orderId: p.orderId, err: errTag(e) })
    return null
  }
  try {
    const id = await reserveInner(tx, p)
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT auto_notify_reserve')
    return id
  } catch (e) {
    try {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT auto_notify_reserve')
    } catch {
      // tx พังเกินกู้ — ผู้เรียกจะเจอเองตอน commit · ไม่มีอะไรให้ทำที่นี่
    }
    console.error('[auto-notify] reserve ล้มเหลว (งานหลักไม่กระทบ)', { kind: p.kind, orderId: p.orderId, err: errTag(e) })
    return null
  }
}

/**
 * จุดเขียนเลขพัสดุ (order/iship service) — จอง TRACKING จากแถวออเดอร์เอง (ห้องผูกที่ Order.conversationId เท่านั้น · BR-CS-S01)
 * ไม่มีห้อง = ไม่แตะ ledger เลย · ล้ม = ตกเป็น null ตาม reserveAutoNotifyIntent (SAVEPOINT)
 */
export async function reserveTrackingNotice(tx: Tx, orderId: string, trackingNo: string): Promise<string | null> {
  // การอ่านต้องอยู่ใน SAVEPOINT ด้วย — query ที่ล้มนอก savepoint ทำให้ Postgres abort ทั้ง tx แล้ว commit ของงานหลักล้มตาม
  let o: { shopId: string; conversationId: string | null; isDryRun: boolean } | null
  try {
    await tx.$executeRawUnsafe('SAVEPOINT auto_notify_read')
  } catch (e) {
    console.error('[auto-notify] เปิด savepoint ไม่ได้ (งานหลักไม่กระทบ)', { orderId, err: errTag(e) })
    return null
  }
  try {
    o = await tx.order.findUnique({ where: { id: orderId }, select: { shopId: true, conversationId: true, isDryRun: true } })
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT auto_notify_read')
  } catch (e) {
    try {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT auto_notify_read')
    } catch {
      // tx พังเกินกู้ — ผู้เรียกเจอเองตอน commit
    }
    console.error('[auto-notify] อ่านออเดอร์ก่อนจองล้มเหลว (งานหลักไม่กระทบ)', { orderId, err: errTag(e) })
    return null
  }
  if (!o?.conversationId) return null
  return reserveAutoNotifyIntent(tx, {
    shopId: o.shopId, orderId, conversationId: o.conversationId, kind: 'TRACKING',
    valueKey: trackingNo, isDryRun: o.isDryRun, keyedInAt: new Date(),
  })
}

/** หลัง COMMIT เท่านั้น — dispatch ไม่ throw · พลาดแล้ว sweeper เก็บ INTENT ที่ค้าง */
export function dispatchAutoNotifyAfterCommit(ledgerId: string | null | undefined): void {
  if (ledgerId) runAfterResponse(() => dispatchAutoNotify(ledgerId))
}

// ══════════════════════════════════════════════════════════════════════════
// settle
// ══════════════════════════════════════════════════════════════════════════

type LedgerRow = {
  id: string
  shopId: string
  orderId: string
  conversationId: string | null
  kind: string
  valueKey: string
  chatMessageId: string | null
  createdAt: Date
}
const LEDGER_SELECT = {
  id: true, shopId: true, orderId: true, conversationId: true, kind: true, valueKey: true, chatMessageId: true, createdAt: true,
} as const

/** ออก INTENT เท่านั้น (conditional) — ปิดซ้ำ/แข่งกัน = ไม่ทำอะไร · SENT/FAILED เขียน OrderEvent ภาพไทม์ไลน์ (ledger คือ SSOT) */
async function settle(
  l: LedgerRow,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  reason: AutoNotifyLedgerReason | null,
): Promise<boolean> {
  const res = await prisma.autoNotifyLedger.updateMany({
    where: { id: l.id, status: 'INTENT' },
    data: { status, reason, settledAt: new Date() },
  })
  if (res.count === 0) return false
  if (status === 'SENT') {
    await recordOrderEventSafe({ orderId: l.orderId, type: 'AUTO_NOTICE_SENT' })
  } else if (status === 'FAILED') {
    await recordOrderEventSafe({ orderId: l.orderId, type: 'AUTO_NOTICE_FAILED', meta: { reason: reason ?? undefined } })
  }
  return true
}

/** ปิดผลตามสถานะข้อความจริง (D-8) — QUEUED = ยังไม่รู้ผล ปล่อยให้ตัวกวาดมาดูใหม่ */
async function settleFromMessage(l: LedgerRow): Promise<boolean> {
  if (!l.chatMessageId) return false
  const m = await prisma.chatMessage.findUnique({
    where: { id: l.chatMessageId },
    select: { deliveryStatus: true, failureReason: true },
  })
  if (!m || m.deliveryStatus === 'QUEUED') return false
  if (m.deliveryStatus !== 'FAILED') return settle(l, 'SENT', null) // SENT หรือ null (แชทในแอป = ถึงทันที)
  const fr = m.failureReason
  const reason: AutoNotifyLedgerReason = fr === UNCERTAIN_SEND_REASON ? 'UNCERTAIN_SEND' : mapFailureToLedgerReason(fr)
  if (reason === 'NOT_ELIGIBLE_ANYMORE') console.warn('[auto-notify] ส่งล้มด้วยสถานะที่ไม่ควรเกิด', { ledgerId: l.id, code: fr })
  return settle(l, 'FAILED', reason)
}

// ══════════════════════════════════════════════════════════════════════════
// dispatch
// ══════════════════════════════════════════════════════════════════════════

const CHANNELS: readonly FitChannel[] = ['MESSENGER', 'INSTAGRAM', 'LINE', 'DEEP']

/** ตรวจซ้ำตอนส่งจริง — สวิตช์/ออเดอร์/ห้อง อาจเปลี่ยนไปตั้งแต่จอง (BR-CS-C02: ปิดแล้ว INTENT ค้างต้องไม่ถูกส่ง) */
async function revalidate(l: LedgerRow): Promise<{ ok: true; channel: FitChannel; conversationId: string } | { ok: false }> {
  const kind = l.kind as AutoNotifyKind
  const order = await prisma.order.findFirst({
    where: { id: l.orderId, shopId: l.shopId },
    select: {
      status: true, isDryRun: true, conversationId: true, serviceStart: true, appointmentStatus: true, serviceClosedAt: true,
      shop: { select: { vertical: true, serviceJobPhotoMode: true, serviceJobPhotosBuyerVisible: true } },
    },
  })
  if (!order || !l.conversationId || order.conversationId !== l.conversationId) return { ok: false }
  const photosBuyerVisible = photosBuyerVisibleOf(order.shop)
  const sw = await switchStateOf(prisma, l.shopId, kind, photosBuyerVisible)
  const conv = await prisma.conversation.findFirst({ where: { id: l.conversationId, shopId: l.shopId }, select: { id: true, channel: true } })
  if (!conv || !CHANNELS.includes(conv.channel as FitChannel)) return { ok: false }
  const e = evaluateAutoNotifyEligibility({
    kind,
    vertical: order.shop.vertical,
    switchEnabled: sw.switchEnabled,
    enabledAt: sw.enabledAt,
    photosBuyerVisible,
    // เหตุการณ์ = เวลาจอง: สวิตช์ปิดแล้วเปิดใหม่ (enabledAt ใหม่กว่า) ต้องไม่ส่งของเก่า (TC-139)
    eventAt: l.createdAt,
    conversationId: conv.id,
    isDryRun: order.isDryRun,
    // ยกเลิก = หมดความหมาย · สถานะที่ไล่ไปข้างหน้า (ยืนยัน/จัดส่ง) ไม่ทำให้ใบแจ้งผิด
    orderStatus: order.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING',
    trackingNo: kind === 'TRACKING' ? l.valueKey : undefined,
    serviceStart: order.serviceStart,
    appointmentStatus: order.appointmentStatus,
    serviceClosedAt: order.serviceClosedAt,
    closeOutcome: kind === 'SERVICE_CLOSED' ? (order.appointmentStatus === 'NO_SHOW' ? 'NO_SHOW' : 'SERVED') : null,
    nowMs: Date.now(),
  })
  return e.eligible ? { ok: true, channel: conv.channel as FitChannel, conversationId: conv.id } : { ok: false }
}

async function linkMessage(ledgerId: string, chatMessageId: string): Promise<void> {
  // ผูกทันทีที่ข้อความเกิด — จอใช้ chatMessageId หา kind ของบับเบิล (ดู report) และตัวกวาดใช้ตามผล
  await prisma.autoNotifyLedger.updateMany({ where: { id: ledgerId, status: 'INTENT' }, data: { chatMessageId } })
}

async function dispatchInner(ledgerId: string, owner: ClaimOwner): Promise<void> {
  // claim แบบเงื่อนไขเดียว: count 0 = มีคนรับไปแล้ว/ปิดผลแล้ว → จบทันที ห้ามส่ง (idempotent)
  const claim = await prisma.autoNotifyLedger.updateMany({
    where: { id: ledgerId, status: 'INTENT', claimedAt: null },
    data: { claimedAt: new Date() },
  })
  if (claim.count === 0) return
  const l = (await prisma.autoNotifyLedger.findUnique({ where: { id: ledgerId }, select: LEDGER_SELECT })) as LedgerRow | null
  if (!l) return

  const v = await revalidate(l)
  if (!v.ok) {
    await settle(l, 'SKIPPED', 'NOT_ELIGIBLE_ANYMORE')
    return
  }

  const kind = l.kind as AutoNotifyKind
  const isTrackingUpdate =
    kind === 'TRACKING' &&
    (await prisma.autoNotifyLedger.count({
      where: { orderId: l.orderId, kind: 'TRACKING', createdAt: { lt: l.createdAt }, status: { not: 'SKIPPED' } },
    })) > 0
  const composed = await composeNotice(kind, {
    shopId: l.shopId,
    orderId: l.orderId,
    channel: v.channel,
    trackingKey: kind === 'TRACKING' ? l.valueKey : undefined,
    isTrackingUpdate,
  })
  if (!composed.ok) {
    await settle(l, 'SKIPPED', composed.reason === 'EMPTY_MESSAGE' ? 'EMPTY_MESSAGE' : 'NOT_ELIGIBLE_ANYMORE')
    return
  }

  const card = composed.card
  if (v.channel === 'DEEP') {
    let messageId: string
    try {
      const m = await sendMessage({
        conversationId: v.conversationId,
        senderUserId: null,
        senderRole: 'SHOP',
        type: card ? 'ORDER' : 'TEXT',
        // การ์ดออเดอร์เก็บ body=null (sendMessage จัดการ) · การ์ดนัดเก็บข้อความ · ข้อความล้วน = text
        body: composed.text,
        orderRefToken: card ? composed.orderToken : null,
        isAppointmentCard: card?.kind === 'APPOINTMENT',
        system: { shopId: l.shopId, autoReplyKind: 'AUTO_NOTICE' },
      })
      messageId = m.id
    } catch (e) {
      // sendMessage ล้มก่อน insert (tx เดียว) = ไม่มีข้อความออกไป → ปิดเป็น FAILED ได้อย่างปลอดภัย
      await settle(l, 'FAILED', mapFailureToLedgerReason(e instanceof Error ? e.message : null))
      return
    }
    await linkMessage(l.id, messageId)
    await settle({ ...l, chatMessageId: messageId }, 'SENT', null)
    return
  }

  // ช่องทางนอก: เข้าคิวขาออกเดิม (ด่าน 24 ชม. ของ Meta อยู่ที่ตัวยิง ห้ามผ่อน — ล้ม WINDOW_CLOSED โดยไม่เรียก Graph)
  let messageId: string
  try {
    const row = await enqueueOutbound({
      conversationId: v.conversationId,
      actorUserId: null,
      systemShopId: l.shopId,
      autoReplyKind: 'AUTO_NOTICE',
      text: composed.text,
      ...(card ? { orderRefToken: composed.orderToken, ...externalCardParts(card, v.channel) } : {}),
    })
    messageId = row.id
  } catch (e) {
    // ด่านก่อนเข้าคิวล้ม (ผู้ติดต่อบล็อก/เพจถูกถอด/ห้องหาย) = ยังไม่มีข้อความ → ปิด FAILED ปลอดภัย
    await settle(l, 'FAILED', mapFailureToLedgerReason(e instanceof Error ? e.message : null))
    return
  }
  await linkMessage(l.id, messageId)
  try {
    await deliverRoom(v.conversationId, owner)
  } catch (e) {
    console.error('[auto-notify] ระบายคิวห้องล้มเหลว — ตัวกวาดจะตามผลจากสถานะข้อความ', { ledgerId: l.id, err: errTag(e) })
    return
  }
  await settleFromMessage({ ...l, chatMessageId: messageId })
}

/**
 * ส่งตามเจตนาที่จองไว้ — ห้าม throw (เรียกจาก after()) · ความผิดพลาดที่ไม่คาดคิดหลัง claim = ปล่อยให้ตัวกวาดปิดเป็น
 * UNCERTAIN_SEND (ไม่ยิงซ้ำ) ดีกว่าเดาว่า "ยังไม่ได้ส่ง" แล้วส่งซ้ำ
 */
export async function dispatchAutoNotify(ledgerId: string, owner: ClaimOwner = 'after'): Promise<void> {
  try {
    await dispatchInner(ledgerId, owner)
  } catch (e) {
    console.error('[auto-notify] dispatch ล้มเหลว', { ledgerId, err: errTag(e) })
  }
}

// ══════════════════════════════════════════════════════════════════════════
// sweep
// ══════════════════════════════════════════════════════════════════════════

/** (ก) INTENT ที่ยังไม่มีใคร claim เกินเกณฑ์นี้ = after() ไม่ได้รัน (TFR-012) */
export const SWEEP_UNCLAIMED_AFTER_MS = 60_000
const SWEEP_BATCH = 20
/** งบเวลาของตัวกวาดนี้ — cron มี maxDuration 60 วิ และ sweepOutbox ใช้ได้ถึง 45 วิก่อนหน้า */
const SWEEP_BUDGET_MS = 10_000

export type AutoNotifySweepResult = { dispatched: number; uncertain: number; settled: number }

/** `opts.shopIds` ใช้ในเทสเท่านั้น (HR13: ห้ามแตะแถวของร้านอื่น) — cron จริงไม่ส่ง = กวาดทั้งระบบ */
export async function sweepAutoNotify(now: Date = new Date(), opts: { shopIds?: string[] } = {}): Promise<AutoNotifySweepResult> {
  const scope = opts.shopIds ? { shopId: { in: opts.shopIds } } : {}
  const result: AutoNotifySweepResult = { dispatched: 0, uncertain: 0, settled: 0 }
  const deadline = Date.now() + SWEEP_BUDGET_MS
  const out = () => Date.now() >= deadline

  // (ก) ยังไม่เคยเริ่มยิง → ส่งได้โดยไม่มีทางซ้ำ
  const unclaimed = await prisma.autoNotifyLedger.findMany({
    where: { ...scope, status: 'INTENT', claimedAt: null, createdAt: { lt: new Date(+now - SWEEP_UNCLAIMED_AFTER_MS) } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: SWEEP_BATCH,
  })
  for (const r of unclaimed) {
    if (out()) return result
    await dispatchAutoNotify(r.id, 'cron')
    result.dispatched += 1
  }

  // (ค) มีข้อความแล้ว → ตามผลจากสถานะข้อความ (ทำก่อน (ข) เพราะ (ข) ต้องไม่มี chatMessageId)
  const linked = await prisma.autoNotifyLedger.findMany({
    where: { ...scope, status: 'INTENT', chatMessageId: { not: null } },
    select: LEDGER_SELECT,
    orderBy: { createdAt: 'asc' },
    take: SWEEP_BATCH,
  })
  for (const l of linked) {
    if (out()) return result
    try {
      if (await settleFromMessage(l)) result.settled += 1
    } catch (e) {
      console.error('[auto-notify] sweep ตามผลข้อความล้มเหลว', { ledgerId: l.id, err: errTag(e) })
    }
  }

  // (ข) claim ค้างโดยไม่มีข้อความ → ไม่รู้ว่าออกไปหรือยัง: ห้ามยิงซ้ำ ปิดเป็น UNCERTAIN_SEND
  const stuck = await prisma.autoNotifyLedger.findMany({
    where: { ...scope, status: 'INTENT', chatMessageId: null, claimedAt: { lt: new Date(+now - STALE_CLAIM_MS) } },
    select: LEDGER_SELECT,
    orderBy: { claimedAt: 'asc' },
    take: SWEEP_BATCH,
  })
  for (const l of stuck) {
    if (out()) return result
    try {
      if (await settle(l, 'FAILED', 'UNCERTAIN_SEND')) result.uncertain += 1
    } catch (e) {
      console.error('[auto-notify] sweep ปิด UNCERTAIN_SEND ล้มเหลว', { ledgerId: l.id, err: errTag(e) })
    }
  }
  return result
}
