/**
 * line-report-command.service.ts — ประมวลผล event จาก webhook ของบอทรายงาน (00070 · SRS TFR-05/06/07/20 · SDS §4.2/§4.3)
 *
 * 🛑 ตอบด้วย reply token เท่านั้น — ไฟล์นี้ห้าม import/เรียกฟังก์ชันส่งแบบ "ส่งหาเอง" ใด ๆ (เทสสแกนซอร์สไฟล์นี้)
 *    reply ไม่นับโควตา LINE; reply ล้ม/หมดอายุ = บันทึก log แล้วจบ ห้ามหาทางส่งแทน
 * 🛑 ไม่เก็บ LINE userId ของสมาชิก · ไม่เก็บ/ไม่ log ข้อความที่ไม่ใช่คำสั่ง · log ห้ามมี token/secret/ข้อความผู้ใช้
 * 🛑 ทุก event try/catch แยก — ตัวหนึ่งล้มต้องไม่ทำให้ตัวถัดไปหาย
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { shiftIsoDate, todayThaiIsoDate } from '@/lib/date-range'
import { parseGroupCommand } from '@/lib/line-report/commands'
import { cycleContaining } from '@/lib/line-report/cycle'
import { resolveDailyWindow } from '@/lib/line-report/schedule'
import { resolveReportConfig, type ReportConfigGroup } from '@/lib/line-report/report-config'
import { replyTo, type SendResult } from '@/lib/line-report/line-client'
import {
  ALREADY_BOUND_SELF_MESSAGE,
  BIND_FAILED_MESSAGE,
  COMMAND_RATE_LIMITED_MESSAGE,
  GREETING_MESSAGE,
  NOT_BOUND_MESSAGE,
  PACKAGE_PAUSED_MESSAGE,
  SINGLE_CHAT_HELP_MESSAGE,
  bindSuccessMessage,
} from '@/lib/line-report/messages'
import type { Window } from '@/lib/line-report/types'
import { buildPlainNotice, buildSummaryReportFlex, fitToLimits } from '@/lib/line/flex-summary-report'
import { isOwnerPaidForReports } from '@/services/line-report-access.service'
import { claimSlots, writeDelivery } from '@/services/line-report-delivery.service'
import { markInactive } from '@/services/line-report-group.service'
import { resolveSendableShops } from '@/services/line-report-shop.service'
import { buildGroupSummary, createSweepCache } from '@/services/line-report-summary.service'
import { consumeBindCode, recordAndCountRate, type BindOutcome } from '@/services/line-report-bind.service'

/** reply token อายุ ~1 นาที (LINE-API-Facts §4) — เผื่อเวลาส่ง/เครือข่ายไว้ 10 วินาที */
export const REPLY_WINDOW_MS = 50_000
/** คำสั่งสรุปต่อกลุ่ม: ตอบได้ 10 ครั้ง/10 นาที · ครั้งที่ 11 ตอบ "ถามถี่เกินไป" ครั้งเดียว · ครั้งที่ 12+ เงียบ */
export const COMMAND_LIMIT = 10

const LOG = '[line-report-webhook]'
const errTag = (e: unknown) => (e instanceof Error ? `${e.name}${(e as { code?: unknown }).code ? `:${String((e as { code?: unknown }).code)}` : ''}` : 'unknown')

type Rec = Record<string, unknown>
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' ? (x as Rec) : null)
const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined)

type Ctx = { replyToken: string | undefined; baseMs: number }

/** reply ข้อความธรรมดา — คืน SendResult หรือ 'EXPIRED' (เกินหน้าต่าง ไม่เรียก LINE) · ไม่มี token = 'EXPIRED' */
async function replyText(ctx: Ctx, text: string): Promise<SendResult | 'EXPIRED'> {
  return replyMessages(ctx, [buildPlainNotice(text)])
}

async function replyMessages(ctx: Ctx, messages: unknown[]): Promise<SendResult | 'EXPIRED'> {
  if (!ctx.replyToken || Date.now() - ctx.baseMs > REPLY_WINDOW_MS) return 'EXPIRED'
  return replyTo(ctx.replyToken, messages)
}

const BIND_MESSAGE: Record<Exclude<BindOutcome, 'OK'>, string> = {
  INVALID: BIND_FAILED_MESSAGE,
  RATE_LIMITED: BIND_FAILED_MESSAGE,
  NOT_PAID: BIND_FAILED_MESSAGE, // ไม่รั่วว่าเจ้าของหมดแพ็กเกจ (AC-06-4)
  ALREADY_BOUND_SELF: ALREADY_BOUND_SELF_MESSAGE,
}

async function handleBind(code: string, lineGroupId: string, ctx: Ctx, now: Date): Promise<void> {
  const r = await consumeBindCode({ lineGroupId, code, now })
  const text = r.outcome === 'OK' ? bindSuccessMessage(r.groupName ?? '', r.shopNames ?? []) : BIND_MESSAGE[r.outcome]
  const sent = await replyText(ctx, text)
  // ผูกสำเร็จแล้วแต่ตอบไม่ได้ = ไม่ย้อนการผูก (ผู้ใช้เห็นผลที่หน้า Deep) · แค่จดไว้
  if (sent === 'EXPIRED' || !sent.ok) console.warn(LOG, 'reply ผลผูกไม่สำเร็จ', r.outcome, sent === 'EXPIRED' ? 'EXPIRED' : sent.reason)
}

type SummaryCommand = 'TODAY' | 'YESTERDAY' | 'MONTH'

type ReplyOutcome = { status: 'SENT' | 'REPLY_FAILED' | 'FAILED'; reason?: string; httpStatus?: number }

/**
 * สรุปวันนี้/สรุปเมื่อวาน/สรุปเดือนนี้ — ผลทุกทางออกไปจบที่ `writeDelivery` จุดเดียวท้ายฟังก์ชัน (TFR-21)
 * ชุดตัวเลข = ธงของกลุ่ม (กำไรปิด = ไม่คำนวณ) · ตอบเสมอแม้ 0 (ไม่ใช้ skipWhenNoOrders)
 */
export async function replyCommand(
  group: { id: string; ownerId: string; cutoffDay: number | null } & ReportConfigGroup,
  command: SummaryCommand,
  claimedRowId: string,
  ctx: Ctx,
  now: Date,
): Promise<void> {
  let out: ReplyOutcome
  try {
    out = await composeAndReply(group, command, ctx, now)
  } catch (e) {
    console.error(LOG, 'คำสั่งสรุปล้ม', errTag(e))
    out = { status: 'FAILED', reason: 'INTERNAL' }
  }
  await writeDelivery(claimedRowId, {
    status: out.status,
    reason: out.reason ?? null,
    httpStatus: out.httpStatus ?? null,
    pushMessageCount: 0,
    ...(out.status === 'SENT' ? { sentAt: new Date() } : {}),
  })
}

function sentOrFailed(r: SendResult | 'EXPIRED', okReason?: string): ReplyOutcome {
  if (r === 'EXPIRED') return { status: 'REPLY_FAILED', reason: 'REPLY_TOKEN_EXPIRED' }
  if (r.ok) return { status: 'SENT', ...(okReason ? { reason: okReason } : {}) }
  return { status: 'REPLY_FAILED', reason: r.status === 400 ? 'REPLY_REJECTED' : r.reason, httpStatus: r.status || undefined }
}

async function composeAndReply(
  group: Parameters<typeof replyCommand>[0],
  command: SummaryCommand,
  ctx: Ctx,
  now: Date,
): Promise<ReplyOutcome> {
  // ไม่ ACTIVE = หยุดชั่วคราว — คำนวณสดทุกครั้ง ไม่อ่านจากแถวกลุ่ม (AC-01-6)
  if (!(await isOwnerPaidForReports(group.ownerId))) {
    return sentOrFailed(await replyText(ctx, PACKAGE_PAUSED_MESSAGE), 'PACKAGE_PAUSED')
  }
  const today = todayThaiIsoDate(now)
  // รอบของ "กลุ่มนี้" แม้ monthlyEnabled=false (AC-11-8) · ไม่ใช่ fullDay → ป้าย "ณ เวลา" ตามปกติ
  // เมื่อวาน = ครบทั้งวัน (1440) → ไม่แนบยอดสะสมรอบ
  const window: Window =
    command === 'TODAY'
      ? resolveDailyWindow(0, today, now)
      : command === 'YESTERDAY'
        ? resolveDailyWindow(1440, shiftIsoDate(today, -1), now)
        : { startIso: cycleContaining(today, group.cutoffDay).startIso, endIso: today, computedAt: now.toISOString() }
  const { sendable, excluded } = await resolveSendableShops(group)
  const { template, flags, needs } = resolveReportConfig(group)
  const summary = await buildGroupSummary({ shops: sendable, excluded, window, flags, needs, cache: createSweepCache() })
  const messages = fitToLimits(buildSummaryReportFlex({ summary, kind: 'COMMAND', template }))
  return sentOrFailed(await replyMessages(ctx, messages))
}

async function handleSummaryCommand(command: SummaryCommand, lineGroupId: string, eventId: string | undefined, ctx: Ctx, now: Date) {
  // ตัวนับเดียวกันทั้งกลุ่มที่ผูกและไม่ผูก (AC-22-9) — นับก่อนตัดสินใจอะไร
  const n = await recordAndCountRate(lineGroupId, 'COMMAND', now, COMMAND_LIMIT + 1)
  if (n > COMMAND_LIMIT + 1) return
  if (n === COMMAND_LIMIT + 1) {
    await replyText(ctx, COMMAND_RATE_LIMITED_MESSAGE)
    return
  }

  const group = await prisma.lineReportGroup.findFirst({
    where: { lineGroupId, status: 'ACTIVE' },
    select: {
      id: true, ownerId: true, cutoffDay: true, template: true, monthlyEnabled: true, attachCycleToDaily: true,
      showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true,
    },
  })
  if (!group) {
    await replyText(ctx, NOT_BOUND_MESSAGE)
    return
  }

  // idempotency: event เดิมส่งซ้ำ (redelivery/ซ้อน) → claim ไม่ได้ = ข้าม · ไม่มี eventId = สุ่มคีย์ (ไม่ dedupe แต่ยังมี log)
  const slotKey = `C:${eventId ?? randomUUID()}`
  if ((await claimSlots([{ groupId: group.id, kind: 'COMMAND', slotKey }])) === 0) return
  const row = await prisma.lineReportDelivery.findUniqueOrThrow({
    where: { groupId_slotKey: { groupId: group.id, slotKey } },
    select: { id: true },
  })
  await replyCommand(group, command, row.id, ctx, now)
}

async function handleEvent(raw: unknown, receivedAtMs: number): Promise<void> {
  const e = rec(raw)
  if (!e || e.mode === 'standby') return // standby ไม่มี replyToken — ข้าม
  const source = rec(e.source)
  const replyToken = str(e.replyToken)
  const baseMs = typeof e.timestamp === 'number' ? e.timestamp : receivedAtMs
  const ctx: Ctx = { replyToken, baseMs }
  const now = new Date()
  const message = rec(e.message)
  const isText = e.type === 'message' && message?.type === 'text' && typeof message.text === 'string'

  // แชทเดี่ยว: ตอบช่วยเหลือสั้น ๆ (Should AC-22-10) · room/อื่น ๆ เมิน
  if (source?.type === 'user') {
    if (isText) await replyText(ctx, SINGLE_CHAT_HELP_MESSAGE)
    return
  }
  const lineGroupId = source?.type === 'group' ? str(source.groupId) : undefined
  if (!lineGroupId) return

  if (e.type === 'join') {
    await replyText(ctx, GREETING_MESSAGE)
    return
  }
  if (e.type === 'leave') {
    await markInactive(lineGroupId) // ไม่เจอ/ไม่ ACTIVE = no-op เงียบ (AC-07-5)
    return
  }
  if (!isText) return

  const cmd = parseGroupCommand(message!.text as string)
  if (!cmd) return // ข้อความทั่วไป: ไม่ตอบ ไม่เก็บ (AC-06-5)
  if (cmd.type === 'BIND') {
    // ส่งซ้ำของคำสั่งผูก = ข้าม (ไม่มี dedupe table — ผู้ใช้พิมพ์ใหม่ได้) · ไม่งั้นนับ attempt ซ้ำ/เผากลายเป็น "ผิด"
    if (rec(e.deliveryContext)?.isRedelivery === true) return
    await handleBind(cmd.code, lineGroupId, ctx, now)
    return
  }
  await handleSummaryCommand(cmd.type, lineGroupId, str(e.webhookEventId), ctx, now)
}

export async function handleEvents(events: unknown[], receivedAtMs: number): Promise<void> {
  for (const ev of events) {
    try {
      await handleEvent(ev, receivedAtMs)
    } catch (err) {
      // ห้ามใส่ event/ข้อความ/token ลง log — เหลือแค่ชนิด event + ข้อความ error
      // L-3: เฉพาะชื่อ/โค้ดของ error — message ของ DB/LINE อาจมีค่าที่ผู้ใช้ส่งมา
      console.error(LOG, 'event ล้มเหลว', rec(ev)?.type, errTag(err))
    }
  }
}
