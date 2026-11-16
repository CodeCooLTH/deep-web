// 00095 S-4 — เครื่องยนต์บอทติดตามยอดขาย: tick เดียว = (0) กวาด SENDING ค้าง → (1) ประเมิน/ส่ง run ที่ ACTIVE → (2) แนบห้องใหม่
// (SRS TFR-FB-09..16 · SDS flow 4.1/4.3 · TD-FB-001/004) · ต้นแบบ claim/revalidate/settle = auto-notify.service
//
// 🛑 Meta ไม่มี idempotency key ⇒ ส่งซ้ำไม่ได้ทุกกรณี: แถว SalesFollowSend (UNIQUE runId+step) ถูก COMMIT ก่อนยิงเสมอ
//    ไม่รู้ผล = ปิด UNCERTAIN_SEND แล้วเดินขั้นต่อ ไม่ลองซ้ำ (Q-9)
// 🛑 ห้ามใช้ป้ายคนรับช่วงนอกกรอบของ Meta (กรอบส่งตัดสินใน decideRun ด้วย getWindowState เท่านั้น) · ห้ามเรียก AutoNotifyLedger (AC-FB-59)
// 🛑 ตัดสินด้วย decideRun ตัวเดียวกันทั้งตอนประเมินและตอนตรวจซ้ำ — ไม่มีนิยามที่สอง (HR16)
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AUTO_FOLLOW_KIND } from '@/lib/auto-reply-constants'
import { shouldBlockLinePush } from '@/lib/line/quota'
import {
  ATTACH_ROOM_LIMIT,
  EVALUATE_LIMIT,
  MIN_MS,
  SENDING_STALE_MS,
  TICK_BUDGET_MS,
  type SalesStageKey,
  type SendReason,
  type StopReason,
} from '@/lib/sales-follow-bot/constants'
import { decideRun, eligibleToAttach, mapFollowFailure, type DecideFacts } from '@/lib/sales-follow-bot/decide'
import { isSalesFollowBotEnabled } from '@/lib/sales-follow-bot/gate'
import { countedShopReplyWhere } from '@/lib/sales-follow-bot/message-defs'
import { buildStepBubbles, type BotStep } from '@/lib/sales-follow-bot/schemas'
import { enqueueOutbound, deliverRoom } from '@/services/chat-outbox.service'
import { getLineQuotaByChannelId } from '@/services/line-quota.service'
import { attachRun } from '@/services/sales-follow-bot.service'
import { loadAttachFacts, loadBots, loadDecideFacts } from '@/services/sales-follow-facts.service'
import { findOwnedImageIds } from '@/services/sales-follow-images.service'
import { stopRunWithNote, stopRunsWithNote } from '@/services/sales-follow-note.service'

/** งบแยกของขั้น sweep (TFR-FB-16) — กันงานกวาดกินงบของงานหลัก */
const SWEEP_BUDGET_MS = 5_000
const SWEEP_LIMIT = 20

export interface TickOptions {
  /** ใช้ในเทสเท่านั้น (HR13) — จำกัดทุกขั้นให้แตะเฉพาะร้านที่เทสสร้าง */
  shopIds?: string[]
  budgetMs?: number
}

export interface TickResult {
  shops: number
  swept: number
  evaluated: number
  stopped: number
  held: number
  sent: number
  skipped: number
  failed: number
  attached: number
  timedOut: boolean
}

// ไม่ log message ของ Prisma (อาจมีค่าพารามิเตอร์/PII) — ชื่อ + code พอสืบได้
const errTag = (e: unknown): string => {
  const code = (e as { code?: unknown } | null)?.code
  return `${e instanceof Error ? e.name : typeof e}${typeof code === 'string' ? `:${code}` : ''}`
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)
const shopCond = (col: string, shopIds?: string[]) =>
  shopIds ? Prisma.sql`AND ${Prisma.raw(col)} = ANY(${shopIds}::text[])` : Prisma.empty

interface RunRow {
  id: string
  shopId: string
  botId: string
  conversationId: string
  stageKey: SalesStageKey
  stageStamp: Date
  structureRev: number
  nextStep: number
  lastSentAt: Date | null
  nextDueAt: Date | null
  holdReason: string | null
}

interface SendRef {
  id: string
  shopId: string
  runId: string
  conversationId: string
  step: number
  stepCount: number
  chatMessageId: string | null
  messageIds: string[]
  createdAt: Date
}

type Counters = Pick<TickResult, 'swept' | 'stopped' | 'held' | 'sent' | 'skipped' | 'failed' | 'attached' | 'evaluated'>

const bump = (c: Counters, status: 'SENT' | 'FAILED' | 'SKIPPED') => {
  if (status === 'SENT') c.sent++
  else if (status === 'FAILED') c.failed++
  else c.skipped++
}

// ───────────────────────── ปิดผลของรอบ ─────────────────────────

interface CloseOutcome {
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  reason: SendReason | null
  /** เวลาฟองจริงของฟองล่าสุด (เฉพาะ SENT) — ไม่ใช่เวลาจอง (AC-FB-87) · ข้าม/ล้ม = ไม่แตะ lastSentAt */
  lastSentAt?: Date | null
  /** หยุดทั้ง run ด้วยเหตุนี้แทนการเดินขั้นต่อ (Meta ปฏิเสธนอกกรอบ) */
  stopRun?: StopReason | null
}

/**
 * ปิดแถว Send (conditional SENDING) + เดิน run ขั้นต่อ ใน tx เดียว
 * count=0 = มีคนปิดไปแล้ว (sweeper/อีก tick) → ไม่แตะ run · UPDATE run มีเงื่อนไข nextStep=step ซ้ำอีกชั้น กันเดินสองขั้น
 */
async function closeSend(s: SendRef, o: CloseOutcome, now: Date): Promise<boolean> {
  const nowIso = now.toISOString()
  return prisma.$transaction(async (tx) => {
    const upd = await tx.salesFollowSend.updateMany({
      where: { id: s.id, shopId: s.shopId, status: 'SENDING' },
      data: { status: o.status, reason: o.reason, settledAt: now },
    })
    if (upd.count === 0) return false
    if (o.stopRun) {
      await stopRunsWithNote(tx, { shopId: s.shopId, runId: s.runId }, o.stopRun, { now })
      return true
    }
    const last = s.step + 1 >= s.stepCount
    await tx.$executeRaw`
      UPDATE "SalesFollowRun"
      SET "nextStep" = ${s.step + 1}::int,
          "lastSentAt" = COALESCE(${iso(o.lastSentAt)}::timestamptz, "lastSentAt"),
          "nextDueAt" = NULL, "holdReason" = NULL, "updatedAt" = ${nowIso}::timestamptz,
          "status" = ${last ? 'DONE' : 'ACTIVE'},
          "finishedAt" = ${last ? nowIso : null}::timestamptz
      WHERE "id" = ${s.runId} AND "shopId" = ${s.shopId} AND "status" = 'ACTIVE' AND "nextStep" = ${s.step}::int`
    return true
  })
}

/** คืนกุญแจ (ไม่ส่งรอบนี้ — ตัดสินใหม่ tick หน้า) · ห้ามลบเมื่อมีข้อความผูกแล้ว */
async function releaseSend(sendId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "SalesFollowSend" WHERE "id" = ${sendId} AND "status" = 'SENDING' AND "chatMessageId" IS NULL`
}

/**
 * ปิดผลตามสถานะข้อความจริงของทุกฟองในรอบ (แบบ settleFromMessage ของ 00078 — TFR-FB-14 ข้อ 5/TFR-FB-16 ข)
 * ฟองใดยัง QUEUED = PENDING (ปล่อยให้ sweeper มาดูใหม่) · ทุกฟอง SENT/null = SENT · มีฟองล้ม = เหตุผลของฟองแรกที่ล้ม
 */
async function settleRound(s: SendRef, now: Date, c: Counters): Promise<'PENDING' | 'SETTLED'> {
  const ids = s.messageIds.length > 0 ? s.messageIds : s.chatMessageId ? [s.chatMessageId] : []
  const rows = ids.length
    ? await prisma.chatMessage.findMany({
        where: { id: { in: ids }, conversationId: s.conversationId },
        select: { id: true, deliveryStatus: true, failureReason: true, createdAt: true },
      })
    : []
  const byId = new Map(rows.map((m) => [m.id, m]))
  const msgs = ids.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m)
  if (msgs.some((m) => m.deliveryStatus === 'QUEUED')) return 'PENDING'

  let outcome: CloseOutcome
  const failed = msgs.find((m) => m.deliveryStatus === 'FAILED')
  if (msgs.length === 0) outcome = { status: 'FAILED', reason: 'UNCERTAIN_SEND' } // ข้อความหายไปแล้ว = ไม่รู้ผล
  else if (failed) {
    const f = mapFollowFailure(failed.failureReason)
    outcome = { status: f.status, reason: f.reason, stopRun: f.stopRun }
  } else outcome = { status: 'SENT', reason: null, lastSentAt: new Date(Math.max(...msgs.map((m) => m.createdAt.getTime()))) }

  if (await closeSend(s, outcome, now)) bump(c, outcome.status)
  return 'SETTLED'
}

// ───────────────────────── (0) sweep ─────────────────────────

async function sweepSending(now: Date, shopIds: string[] | undefined, c: Counters): Promise<void> {
  const deadline = Date.now() + SWEEP_BUDGET_MS
  const cutoff = new Date(now.getTime() - SENDING_STALE_MS)
  const rows = await prisma.$queryRaw<SendRef[]>`
    SELECT "id","shopId","runId","conversationId","step","stepCount","chatMessageId","messageIds","createdAt"
    FROM "SalesFollowSend"
    WHERE "status" = 'SENDING' AND ("chatMessageId" IS NOT NULL OR "createdAt" < ${cutoff.toISOString()}::timestamptz)
      ${shopCond('"shopId"', shopIds)}
    ORDER BY "createdAt" ASC LIMIT ${SWEEP_LIMIT}`
  for (const s of rows) {
    if (Date.now() >= deadline) break
    try {
      c.swept++
      // (ก) ไม่มีข้อความผูก + ค้างเกินเพดาน = ไม่รู้ผล → ปิด UNCERTAIN_SEND เดินขั้นต่อ ไม่ยิงซ้ำ
      if (!s.chatMessageId) {
        if (await closeSend(s, { status: 'FAILED', reason: 'UNCERTAIN_SEND' }, now)) bump(c, 'FAILED')
      } else await settleRound(s, now, c) // (ข)
    } catch (e) {
      console.error('[sales-follow-bot] sweep ล้มเหลว (ข้ามแถวนี้)', { sendId: s.id, err: errTag(e) })
    }
  }
}

// ───────────────────────── (1) ประเมิน/ส่ง ─────────────────────────

async function pickRuns(shopIds?: string[]): Promise<RunRow[]> {
  // เรียง "ถึงกำหนดก่อน" (nextDueAt ว่าง = ยังไม่เคยประเมิน นับว่าถึง) แล้วเก่าสุดก่อน — แล้ว touch updatedAt ให้คิวหมุน (แบบ gochat engine.ts:168)
  const rows = await prisma.$queryRaw<RunRow[]>`
    SELECT "id","shopId","botId","conversationId","stageKey","stageStamp","structureRev","nextStep","lastSentAt","nextDueAt","holdReason"
    FROM "SalesFollowRun"
    WHERE "status" = 'ACTIVE' ${shopCond('"shopId"', shopIds)}
    ORDER BY COALESCE("nextDueAt" <= clock_timestamp(), true) DESC, "updatedAt" ASC
    LIMIT ${EVALUATE_LIMIT}`
  if (rows.length > 0) {
    await prisma.$executeRaw`UPDATE "SalesFollowRun" SET "updatedAt" = clock_timestamp() WHERE "id" = ANY(${rows.map((r) => r.id)}::text[]) AND "status" = 'ACTIVE'`
  }
  return rows
}

/** claim: tx สั้น — ล็อกแถว run แล้ว INSERT Send SENDING ON CONFLICT DO NOTHING → COMMIT ก่อนยิง (BR-FB-33) */
async function claimSend(run: RunRow, stepCount: number): Promise<{ id: string; createdAt: Date } | null> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "SalesFollowRun"
      WHERE "id" = ${run.id} AND "shopId" = ${run.shopId} AND "status" = 'ACTIVE' AND "nextStep" = ${run.nextStep}::int
      FOR UPDATE SKIP LOCKED`
    if (locked.length === 0) return null
    const ins = await tx.$queryRaw<{ id: string; createdAt: Date }[]>`
      INSERT INTO "SalesFollowSend" ("id","shopId","runId","conversationId","botId","step","stepCount","status","createdAt")
      VALUES (gen_random_uuid()::text, ${run.shopId}, ${run.id}, ${run.conversationId}, ${run.botId}, ${run.nextStep}::int, ${stepCount}::int, 'SENDING', clock_timestamp())
      ON CONFLICT ("runId","step") DO NOTHING
      RETURNING "id","createdAt"`
    return ins[0] ?? null
  })
}

type OutItem = { kind: 'TEXT'; text: string } | { kind: 'IMAGE'; fileId: string }

/**
 * ประกอบรอบเป็นฟองที่ส่งได้จริง: ชิ้นตามลำดับ · QUICK_MESSAGE เติมจาก DB (ร้านเดียวกัน — ถูกลบ = ข้ามชิ้น; ข้อความแล้วรูปของมัน)
 * รูปทุกชิ้นผ่าน findOwnedImageIds ก่อนยิงเสมอ (หลุดเจ้าของ = ข้ามชิ้น) — ไม่เหลืออะไร: IMAGE_MISSING (เหตุคือรูปทั้งหมดหาย) หรือ EMPTY_MESSAGE
 * IMAGES 1 ชิ้น = หลายฟอง (1 รูป/ฟอง) ตามทางเดียวกับช่องพิมพ์แชท (route messages: IMAGE_GRID วน enqueue ทีละรูป)
 */
async function composeRound(
  shopId: string,
  step: Pick<BotStep, 'parts'>,
  contactName: string | null,
): Promise<{ ok: true; items: OutItem[] } | { ok: false; reason: 'EMPTY_MESSAGE' | 'IMAGE_MISSING' }> {
  const sb = buildStepBubbles(step, contactName)
  if (!sb.ok) return { ok: false, reason: 'EMPTY_MESSAGE' }
  const qmIds = sb.bubbles.flatMap((b) => (b.type === 'QUICK_MESSAGE' ? [b.quickMessageId] : []))
  const qms = qmIds.length
    ? await prisma.quickMessage.findMany({
        where: { shopId, id: { in: qmIds } },
        select: { id: true, body: true, imageFileIds: true, imageFileId: true },
      })
    : []
  const qmById = new Map(qms.map((q) => [q.id, q]))

  const raw: OutItem[] = []
  for (const b of sb.bubbles) {
    if (b.type === 'TEXT') raw.push({ kind: 'TEXT', text: b.text })
    else if (b.type === 'IMAGES') for (const fileId of b.fileIds) raw.push({ kind: 'IMAGE', fileId })
    else {
      const q = qmById.get(b.quickMessageId)
      if (!q) continue // ถูกลบ/ไม่ใช่ของร้านนี้ = ข้ามชิ้น
      if (q.body.trim() !== '') raw.push({ kind: 'TEXT', text: q.body.trim() })
      const files = q.imageFileIds.length > 0 ? q.imageFileIds : q.imageFileId ? [q.imageFileId] : []
      for (const fileId of files) raw.push({ kind: 'IMAGE', fileId })
    }
  }
  const wanted = raw.flatMap((i) => (i.kind === 'IMAGE' ? [i.fileId] : []))
  const owned = wanted.length > 0 ? await findOwnedImageIds(prisma, shopId, wanted) : new Set<string>()
  const items = raw.filter((i) => i.kind === 'TEXT' || owned.has(i.fileId))
  if (items.length === 0) return { ok: false, reason: wanted.length > 0 ? 'IMAGE_MISSING' : 'EMPTY_MESSAGE' }
  return { ok: true, items }
}

async function sendStep(run: RunRow, now: Date, c: Counters): Promise<void> {
  const bots = await loadBots(run.shopId, [run.botId])
  const bot = bots.get(run.botId)
  const step = bot?.steps[run.nextStep]
  if (!bot || !step) return

  const claim = await claimSend(run, bot.steps.length)
  if (!claim) return // มีคนจอง/ส่งแล้ว (อีก tick พร้อมกัน) — ไม่ใช่ความผิดพลาด
  const flag = { enqueued: false }
  try {
    await sendClaimed(run, bot, step, claim, flag, now, c)
  } catch (e) {
    // throw หลัง claim แต่ยังไม่มีฟองใดเกิด = ไม่มีอะไรออกไปแน่ → คืนกุญแจให้ tick หน้าลองใหม่ (ไม่ปล่อยให้ sweep ข้ามขั้น)
    // เกิดฟองแล้ว = อาจออกไปแล้ว → คงแถว SENDING ให้ sweeper ปิดตามข้อความ/UNCERTAIN_SEND
    if (!flag.enqueued) await releaseSend(claim.id).catch(() => undefined)
    throw e
  }
}

async function sendClaimed(
  run: RunRow,
  bot: { steps: BotStep[] },
  step: BotStep,
  claim: { id: string; createdAt: Date },
  flag: { enqueued: boolean },
  now: Date,
  c: Counters,
): Promise<void> {
  const ref: SendRef = {
    id: claim.id, shopId: run.shopId, runId: run.id, conversationId: run.conversationId, step: run.nextStep,
    stepCount: bot.steps.length, chatMessageId: null, messageIds: [], createdAt: claim.createdAt,
  }

  // ตรวจซ้ำอ่านสดหลัง COMMIT — decideRun ตัวเดิมต้องได้ SEND ขั้นเดิม (stamp/แท็ก/บอท/กรอบ/ร้านเปิดอยู่ ครบใน decideRun)
  const fresh = await prisma.salesFollowRun.findFirst({
    where: { id: run.id, shopId: run.shopId, status: 'ACTIVE', nextStep: run.nextStep },
    select: {
      id: true, shopId: true, botId: true, conversationId: true, stageKey: true, stageStamp: true,
      structureRev: true, nextStep: true, lastSentAt: true,
    },
  })
  const facts = fresh ? (await loadDecideFacts([{ ...fresh, stageKey: fresh.stageKey as SalesStageKey }], now)).get(fresh.id) : undefined
  const d = facts ? decideRun(facts) : null
  // แอดมินตอบหลังจอง (AC-FB-50): ร้านตอบที่นับใหม่กว่าเวลาจอง = ไม่ยิง (decideRun อ่านก่อนจองอาจไม่เห็น)
  const newerReply = d?.action === 'SEND'
    ? await prisma.chatMessage.findFirst({
        where: { conversationId: run.conversationId, AND: [countedShopReplyWhere(now), { createdAt: { gt: claim.createdAt } }] },
        select: { id: true },
      })
    : null
  if (!facts || !d || d.action !== 'SEND' || d.step !== run.nextStep || newerReply) return releaseSend(claim.id)

  const conv = await prisma.conversation.findFirst({
    where: { id: run.conversationId, shopId: run.shopId },
    select: { externalContact: { select: { name: true } } },
  })
  const composed = await composeRound(run.shopId, step, conv?.externalContact?.name ?? null)
  const skip = async (reason: SendReason) => {
    if (await closeSend(ref, { status: 'SKIPPED', reason }, now)) bump(c, 'SKIPPED')
  }
  if (!composed.ok) return skip(composed.reason)

  // LINE: กินโควตา push — เต็ม = ข้ามขั้น (ไม่ใช่พัก) · อ่านไม่ได้/ไม่มีค่า = ส่งต่อให้ LINE ตัดสิน (shouldBlockLinePush บล็อกเฉพาะรู้แน่ว่า 0)
  if (facts.room.channel === 'LINE' && facts.room.shopChannelId) {
    const q = await getLineQuotaByChannelId(facts.room.shopChannelId, { shopId: run.shopId })
    if (q && shouldBlockLinePush(q.level)) return skip('LINE_QUOTA_FULL')
  }

  // ยิง: enqueue ทีละฟองตามลำดับ แล้ว deliverRoom ครั้งเดียว (ไม่ใช้ป้ายนอกกรอบ — กรอบอยู่ใน decideRun)
  const ids: string[] = []
  try {
    for (const it of composed.items) {
      const row = await enqueueOutbound({
        conversationId: run.conversationId,
        actorUserId: null,
        systemShopId: run.shopId,
        autoReplyKind: AUTO_FOLLOW_KIND,
        ...(it.kind === 'TEXT' ? { text: it.text } : { attachment: { fileId: it.fileId, kind: 'IMAGE' as const, name: null, size: null } }),
      })
      ids.push(row.id)
      flag.enqueued = true
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // ยังไม่มีฟองไหนเกิด + ด่านที่รู้ล่วงหน้า = คืนกุญแจ (BLOCKED → รอบหน้าหยุดด้วย decideRun ข้อ 9 · NOT_ACTIVE → HOLD ข้อ 13)
    if (ids.length === 0 && (msg === 'CONTACT_BLOCKED' || msg === 'CHANNEL_NOT_ACTIVE')) return releaseSend(claim.id)
    // ไม่รู้สาเหตุ + ยังไม่มีฟอง: โยนต่อให้ตัวห่อคืนกุญแจ · มีฟองแล้วบางส่วน: ไปต่อด้วยฟองที่เกิด
    if (ids.length === 0) throw e
    console.error('[sales-follow-bot] enqueue ล้มกลางรอบ (ไปต่อด้วยฟองที่เกิดแล้ว)', { sendId: claim.id, err: errTag(e) })
  }
  await prisma.salesFollowSend.updateMany({
    where: { id: claim.id, status: 'SENDING' },
    data: { chatMessageId: ids[0], messageIds: ids },
  })
  ref.chatMessageId = ids[0]
  ref.messageIds = ids
  try {
    await deliverRoom(run.conversationId, 'cron')
  } catch (e) {
    console.error('[sales-follow-bot] deliverRoom ล้มเหลว (sweeper ตามปิดผล)', { sendId: claim.id, err: errTag(e) })
  }
  await settleRound(ref, now, c)
}

async function evaluateRun(run: RunRow, facts: DecideFacts, now: Date, c: Counters): Promise<void> {
  const d = decideRun(facts)
  const nowIso = now.toISOString()
  if (d.action === 'STOP') {
    c.stopped += (await stopRunWithNote({ shopId: run.shopId, runId: run.id }, d.reason, { now })).length
  } else if (d.action === 'DONE') {
    await prisma.$executeRaw`
      UPDATE "SalesFollowRun" SET "status" = 'DONE', "finishedAt" = ${nowIso}::timestamptz, "nextDueAt" = NULL, "holdReason" = NULL, "updatedAt" = ${nowIso}::timestamptz
      WHERE "id" = ${run.id} AND "shopId" = ${run.shopId} AND "status" = 'ACTIVE'`
  } else if (d.action === 'HOLD') {
    c.held++
    if (run.holdReason !== d.reason) {
      // เขียนเมื่อค่าเปลี่ยนเท่านั้น (= บันทึกเหตุผลครั้งเดียวต่อขั้น AC-FB-54)
      await prisma.salesFollowRun.updateMany({ where: { id: run.id, shopId: run.shopId, status: 'ACTIVE' }, data: { holdReason: d.reason } })
    }
  } else if (d.action === 'WAIT') {
    if (run.holdReason !== null || (run.nextDueAt?.getTime() ?? null) !== (d.dueAt?.getTime() ?? null)) {
      await prisma.salesFollowRun.updateMany({
        where: { id: run.id, shopId: run.shopId, status: 'ACTIVE' },
        data: { holdReason: null, nextDueAt: d.dueAt },
      })
    }
  } else await sendStep(run, now, c)
}

// ───────────────────────── (2) แนบห้องใหม่ ─────────────────────────

async function attachPhase(now: Date, shopIds: string[] | undefined, deadline: number, c: Counters, shops: Set<string>): Promise<boolean> {
  const bots = await prisma.salesFollowBot.findMany({
    where: {
      deletedAt: null,
      status: { in: ['TESTING', 'ACTIVE'] },
      shop: { vertical: 'ONLINE_SALES' }, // Q-14 ก
      ...(shopIds ? { shopId: { in: shopIds } } : {}),
    },
    select: {
      id: true, shopId: true, status: true, structureRev: true, steps: true,
      channels: { select: { shopChannelId: true } },
      testRooms: { select: { conversationId: true } },
    },
  })
  for (const bot of bots) {
    if (Date.now() >= deadline) return true
    if (!isSalesFollowBotEnabled(bot.shopId)) continue
    const delay1 = (bot.steps as unknown as BotStep[])[0]?.delayMin
    const channelIds = bot.channels.map((x) => x.shopChannelId)
    const testRoomIds = bot.testRooms.map((x) => x.conversationId)
    if (delay1 === undefined || channelIds.length === 0 || (bot.status === 'TESTING' && testRoomIds.length === 0)) continue
    try {
      shops.add(bot.shopId)
      // ตัวกรองหยาบด้วย SQL (ใช้ index (shopId,lastInboundAt)) — ตัวจริงตรวจต่อใน eligibleToAttach
      const since = new Date(now.getTime() - delay1 * MIN_MS).toISOString()
      const cands = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c."id" FROM "Conversation" c JOIN "ShopChannel" sc ON sc."id" = c."shopChannelId"
        WHERE c."shopId" = ${bot.shopId} AND c."channel" IN ('MESSENGER','INSTAGRAM','LINE')
          AND c."shopChannelId" = ANY(${channelIds}::text[]) AND c."externalContactId" IS NOT NULL
          AND c."isSpam" = false AND c."isHidden" = false AND sc."status" = 'ACTIVE'
          AND c."lastInboundAt" > ${since}::timestamptz
          ${bot.status === 'TESTING' ? Prisma.sql`AND c."id" = ANY(${testRoomIds}::text[])` : Prisma.empty}
          AND NOT EXISTS (SELECT 1 FROM "SalesFollowRun" r WHERE r."conversationId" = c."id" AND r."status" = 'ACTIVE')
        ORDER BY c."lastInboundAt" DESC LIMIT ${ATTACH_ROOM_LIMIT}`
      if (cands.length === 0) continue
      const facts = await loadAttachFacts(bot.shopId, bot.id, cands.map((x) => x.id), now)
      for (const cand of cands) {
        if (Date.now() >= deadline) return true
        const f = facts.get(cand.id)
        if (!f) continue
        try {
          const e = eligibleToAttach(f)
          if (!e.ok) continue
          const runId = await attachRun({
            shopId: bot.shopId, botId: bot.id, conversationId: cand.id, stageKey: e.stage.key,
            stageStamp: e.stage.stamp, structureRev: bot.structureRev, now,
          })
          if (runId) c.attached++
        } catch (err) {
          console.error('[sales-follow-bot] แนบห้องล้มเหลว (ข้ามห้องนี้)', { err: errTag(err) })
        }
      }
    } catch (err) {
      console.error('[sales-follow-bot] ผู้สมัครแนบของบอทล้มเหลว (ข้ามบอทนี้)', { err: errTag(err) })
    }
  }
  return false
}

// ───────────────────────── tick ─────────────────────────

export async function runSalesFollowTick(now: Date, opts: TickOptions = {}): Promise<TickResult> {
  const deadline = Date.now() + (opts.budgetMs ?? TICK_BUDGET_MS)
  const c: Counters = { swept: 0, evaluated: 0, stopped: 0, held: 0, sent: 0, skipped: 0, failed: 0, attached: 0 }
  const shops = new Set<string>()
  let timedOut = false

  try {
    await sweepSending(now, opts.shopIds, c)
  } catch (e) {
    console.error('[sales-follow-bot] sweep ล้มเหลว (ไปขั้นต่อไป)', { err: errTag(e) })
  }

  try {
    const runs = await pickRuns(opts.shopIds)
    for (const r of runs) shops.add(r.shopId)
    const factsByRun = runs.length > 0 ? await loadDecideFacts(runs, now) : new Map<string, DecideFacts>()
    for (const run of runs) {
      if (Date.now() >= deadline) {
        timedOut = true
        break
      }
      const facts = factsByRun.get(run.id)
      if (!facts) {
        console.error('[sales-follow-bot] run ไม่มี facts (ห้อง/บอทหลุดจากร้าน) — ข้าม', { runId: run.id })
        continue
      }
      c.evaluated++
      try {
        await evaluateRun(run, facts, now, c)
      } catch (e) {
        console.error('[sales-follow-bot] ประเมิน run ล้มเหลว (ข้าม run นี้)', { runId: run.id, err: errTag(e) })
      }
    }
  } catch (e) {
    console.error('[sales-follow-bot] ขั้นประเมินล้มเหลว', { err: errTag(e) })
  }

  if (!timedOut) {
    try {
      timedOut = await attachPhase(now, opts.shopIds, deadline, c, shops)
    } catch (e) {
      console.error('[sales-follow-bot] ขั้นแนบล้มเหลว', { err: errTag(e) })
    }
  }

  const result: TickResult = { shops: shops.size, ...c, timedOut }
  // log ทุกรอบแม้เป็นศูนย์ — ตัวเลขล้วน ไม่มี PII (แบบ chat-outbox)
  console.log('[sales-follow-bot]', JSON.stringify(result))
  return result
}
