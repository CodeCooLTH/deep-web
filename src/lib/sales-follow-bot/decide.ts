// 00095 TFR-FB-10/11/12 — ตัวตัดสินของบอท (pure: ไม่แตะ DB ไม่อ่านเวลาจริง รับ now)
// เรียกตัวเดียวกันทั้งตอนประเมิน, ตอนตรวจซ้ำก่อนยิง, และแผงในห้อง (HR16: นิยามเดียว)
// 🛑 กรอบส่งใช้ getWindowState เท่านั้น (รับ adWindowStartAt จาก facts) — ห้ามคิดกรอบเอง
import { UNCERTAIN_SEND_REASON } from '../chat-send-queue'
import { getWindowState } from '../messaging-window'
import { decideMetaAiHolding, type MetaAiFacts } from '../meta-ai-holder'
import {
  MIN_MS,
  META_PROVIDERS,
  type BotStatus,
  type HoldReason,
  type SalesStageKey,
  type SendReason,
  type StopReason,
} from './constants'
import { evaluateConditions, hasLimitingCondition, isStageUnrestricted, type ConditionMatch, type ConditionRule } from './conditions'
import { customerRepliedAfterBot, isAwaitingShop, type MsgPos } from './message-defs'
import type { SalesStageResult } from './sales-stage'

export interface DecideBot {
  status: BotStatus
  structureRev: number
  /** เงื่อนไขการเริ่มติดตาม (FR-FA-8) — แท็กในกฎเป็น nameKey */
  conditionMatch: ConditionMatch
  rules: readonly ConditionRule[]
  /** delayMin ของทุกขั้นเรียงตามลำดับ */
  stepDelaysMin: readonly number[]
  channelIds: readonly string[]
  testRoomIds: readonly string[]
}

export interface DecideRoom {
  id: string
  shopChannelId: string | null
  /** Conversation.channel */
  channel: string
  isSpam: boolean
  isHidden: boolean
  lastInboundAt: Date | null
  /** เฉพาะ `false` ตรง ๆ ที่พัก — null/true ไม่พัก (ไม่ดู AutoReplyConfig.isEnabled) */
  autoReplyEnabled: boolean | null
}

export interface DecideContact {
  salesStatus: string
  tags: readonly string[]
  isBlocked: boolean
}

export interface DecideFacts {
  now: Date
  run: { stageKey: SalesStageKey; stageStamp: Date | null; structureRev: number; nextStep: number; lastSentAt: Date | null }
  bot: DecideBot
  /** nameKey ของ ShopTag ทั้งหมดของร้าน — ไว้แยกแท็กที่หายออกจากที่ยังใช้ได้ */
  shopTagKeys: ReadonlySet<string>
  room: DecideRoom
  contact: DecideContact
  shopChannelStatus: string | null
  adWindowStartAt: Date | null
  /** null = ไม่ใช่ห้อง Meta หรือไม่มีข้อมูล */
  metaAi: MetaAiFacts | null
  ourMetaAppId: string | null
  /** ผลของ deriveSalesStage ที่ผู้เรียกคำนวณมา (null = ค่าไม่รู้จัก → ข้ามข้อ 1) */
  stage: SalesStageResult | null
  latestBuyerMsg: MsgPos | null
  latestShopReply: MsgPos | null
  /** ฟองบอทล่าสุดที่ SENT ของ run นี้ (เวลาฟองจริง) */
  lastBotBubble: MsgPos | null
  /** ร้านอยู่ในรายชื่อนำร่อง (isSalesFollowBotEnabled) — false = HOLD ไม่ใช่ STOP (ถอนร้านแล้วยังหยุดตามเหตุอื่นได้ AC-FB-97) */
  sendAllowed: boolean
}

export type Decision =
  | { action: 'STOP'; reason: StopReason; /** แท็กที่ทำให้ไม่ตรงเงื่อนไข (CONDITION_UNMATCHED) */ tagName?: string }
  | { action: 'DONE' }
  | { action: 'HOLD'; reason: HoldReason }
  | { action: 'WAIT'; dueAt: Date | null }
  | { action: 'SEND'; step: number }

const isMeta = (channel: string) => (META_PROVIDERS as readonly string[]).includes(channel)

/** กรอบโฆษณามีเฉพาะ Meta — LINE ได้ 24 ชม. จาก lastInboundAt เสมอ แม้ facts จะส่ง anchor มาผิดช่อง (BR-FB-23 ก, TC-058) */
const windowOf = (room: DecideRoom, now: Date, adWindowStartAt: Date | null) =>
  getWindowState(room.lastInboundAt, now, isMeta(room.channel) ? adWindowStartAt : null)

/**
 * dueAt = max(ร้านตอบล่าสุด, run.lastSentAt) + delayMin(step) — null = ไม่มีฐานเวลาเลย (ไม่มีร้านตอบ ไม่มีฟองบอท ไม่มี lastInboundAt)
 * ค่าสำรองเมื่อไม่พบร้านตอบ/ฟองบอท: lastInboundAt (TFR-FB-12) · lastSentAt ต้องเป็นเวลาฟองจริง ไม่ใช่เวลาจอง (AC-FB-87)
 */
export function computeDueAt(
  f: Pick<DecideFacts, 'run' | 'latestShopReply' | 'room' | 'bot'>,
  step: number = f.run.nextStep,
): Date | null {
  const delay = f.bot.stepDelaysMin[step]
  if (delay === undefined) return null
  const bases = [f.latestShopReply?.createdAt, f.run.lastSentAt].filter((d): d is Date => !!d).map((d) => d.getTime())
  const base = bases.length > 0 ? Math.max(...bases) : f.room.lastInboundAt?.getTime()
  return base === undefined ? null : new Date(base + delay * MIN_MS)
}

/** ลำดับตัดสิน BR-FB-40 / TFR-FB-11 — ข้อแรกที่ตรงชนะ (ลำดับห้ามสลับ: STOP ชนะ HOLD ชนะ WAIT) */
export function decideRun(f: DecideFacts): Decision {
  const { run, bot, room, contact, now } = f

  // 1 สถานะการขายเปลี่ยน (ข้ามเมื่อ stage ไม่รู้จัก — ไม่ย้ายสถานะ ไม่เดา NOT_BOUGHT)
  if (f.stage) {
    const stampChanged = (f.stage.stamp?.getTime() ?? null) !== (run.stageStamp?.getTime() ?? null)
    if (f.stage.key !== run.stageKey || stampChanged) return { action: 'STOP', reason: 'STAGE_CHANGED' }
  }
  // 2 ห้องไม่ตรงเงื่อนไขการเริ่มติดตาม (สถานะ/แท็กปัจจุบันของลูกค้า ประเมินทุกรอบ BR-FB-50) — ตัวเดียวกับตัวแนบ
  const cond = evaluateConditions(bot.rules, bot.conditionMatch, { stageKey: f.stage?.key ?? run.stageKey, contactTags: contact.tags, shopTagKeys: f.shopTagKeys })
  if (!cond.ok) return { action: 'STOP', reason: 'CONDITION_UNMATCHED', ...(cond.blamedTag ? { tagName: cond.blamedTag } : {}) }
  // 3 บอทถูกปิด/แก้โครง
  if (bot.status === 'CLOSED') return { action: 'STOP', reason: 'BOT_DISABLED' }
  if (run.structureRev !== bot.structureRev) return { action: 'STOP', reason: 'BOT_EDITED' }
  // 4 ลูกค้าตอบหลังฟองบอท (ข้อความจริงเท่านั้น — ไม่ใช้ lastInboundAt)
  if (customerRepliedAfterBot(f.latestBuyerMsg, f.lastBotBubble)) return { action: 'STOP', reason: 'CUSTOMER_REPLIED' }
  // 5 ครบทุกขั้น
  if (run.nextStep >= bot.stepDelaysMin.length) return { action: 'DONE' }
  // 6 กรอบส่งปิด หรือถึงกำหนดช้ากว่ากรอบ (>= : ถึงขอบพอดีก็ส่งไม่ทัน)
  const win = windowOf(room, now, f.adWindowStartAt)
  const dueAt = computeDueAt(f)
  if (!win.open || dueAt === null || (win.expiresAt !== null && dueAt.getTime() >= win.expiresAt.getTime()))
    return { action: 'STOP', reason: 'WINDOW_CLOSED' }
  // 7
  if (contact.salesStatus === 'NOT_INTERESTED') return { action: 'STOP', reason: 'NOT_INTERESTED' }
  // 8 ห้องหลุดขอบเขต
  if (
    room.shopChannelId === null ||
    !bot.channelIds.includes(room.shopChannelId) ||
    room.isSpam ||
    room.isHidden ||
    (bot.status === 'TESTING' && !bot.testRoomIds.includes(room.id))
  )
    return { action: 'STOP', reason: 'OUT_OF_SCOPE' }
  // 9
  if (room.channel === 'LINE' && contact.isBlocked) return { action: 'STOP', reason: 'CONTACT_BLOCKED' }
  // 10-13 พัก (ไม่ใช่หยุด)
  if (!f.sendAllowed) return { action: 'HOLD', reason: 'SHOP_NOT_ENABLED' }
  if (
    isMeta(room.channel) &&
    f.metaAi !== null &&
    decideMetaAiHolding(f.metaAi, now.getTime(), f.ourMetaAppId)
  )
    return { action: 'HOLD', reason: 'META_AI_HOLDING' }
  if (room.autoReplyEnabled === false) return { action: 'HOLD', reason: 'AUTO_REPLY_OFF' }
  if (f.shopChannelStatus !== 'ACTIVE') return { action: 'HOLD', reason: 'CHANNEL_NOT_ACTIVE' }
  // 14 ร้านค้างตอบ — รอ ไม่หยุด (ไม่มีกำหนด)
  if (isAwaitingShop(f.latestBuyerMsg, f.latestShopReply)) return { action: 'WAIT', dueAt: null }
  // 15
  if (dueAt.getTime() > now.getTime()) return { action: 'WAIT', dueAt }
  // 16
  return { action: 'SEND', step: run.nextStep }
}

// ── แนบบอทให้ห้อง (TFR-FB-10 ส่วนตรวจในโค้ด) ──

export type AttachRejection =
  | 'BOT_NOT_RUNNABLE'
  | 'OUT_OF_SCOPE'
  | 'NO_RECENT_BUYER_MSG'
  | 'WINDOW_CLOSED'
  | 'NOT_INTERESTED'
  | 'CONTACT_BLOCKED'
  | 'STAGE_UNKNOWN'
  | 'CONDITION_UNMATCHED'
  | 'NO_CONDITION'
  | 'ALREADY_RAN'
  | 'STAMP_MISSING'

export interface AttachFacts {
  now: Date
  bot: Omit<DecideBot, 'structureRev'> & { deletedAt: Date | null }
  shopTagKeys: ReadonlySet<string>
  room: DecideRoom & { externalContactId: string | null }
  contact: DecideContact
  shopChannelStatus: string | null
  adWindowStartAt: Date | null
  stage: SalesStageResult | null
  latestBuyerMsg: MsgPos | null
  /** finishedAt ของ run ล่าสุดของ (บอท,ห้อง) ที่จบแล้ว — null = ไม่เคยมี */
  lastRunFinishedAt: Date | null
}

/** ตรวจครบก่อนแนบ — ok เมื่อผ่านทุกข้อ (คืนเหตุผลแรกที่ไม่ผ่านเพื่อ log/เทส) */
export function eligibleToAttach(f: AttachFacts): { ok: true; stage: SalesStageResult & { stamp: Date } } | { ok: false; reason: AttachRejection } {
  const no = (reason: AttachRejection) => ({ ok: false as const, reason })
  const { bot, room, contact, now } = f

  if (bot.deletedAt || bot.status === 'CLOSED') return no('BOT_NOT_RUNNABLE')
  if (
    !room.externalContactId ||
    room.shopChannelId === null ||
    !bot.channelIds.includes(room.shopChannelId) ||
    room.isSpam ||
    room.isHidden ||
    f.shopChannelStatus !== 'ACTIVE' ||
    (bot.status === 'TESTING' && !bot.testRoomIds.includes(room.id))
  )
    return no('OUT_OF_SCOPE')

  // 1 ข้อความจริงของลูกค้าภายใน delay ขั้นแรก (ตัวจริงของ BR-FB-06 — lastInboundAt ขยับจาก reaction/โฆษณาได้ จึงเป็นแค่ตัวกรองหยาบ)
  const delay1 = bot.stepDelaysMin[0]
  if (delay1 === undefined || !f.latestBuyerMsg || f.latestBuyerMsg.createdAt.getTime() <= now.getTime() - delay1 * MIN_MS)
    return no('NO_RECENT_BUYER_MSG')
  // 2 กรอบส่งยังเปิด (ไม่ใช่ "24 ชม." — Q-2 มีกรอบโฆษณา)
  if (!windowOf(room, now, f.adWindowStartAt).open) return no('WINDOW_CLOSED')
  // 3
  if (contact.salesStatus === 'NOT_INTERESTED') return no('NOT_INTERESTED')
  if (room.channel === 'LINE' && contact.isBlocked) return no('CONTACT_BLOCKED')
  // 4
  if (f.stage === null) return no('STAGE_UNKNOWN')
  // 5 เงื่อนไขการเริ่มติดตาม — กฎว่าง/ไม่มีแถวจำกัดวง = ไม่แนบ (fail-closed) · แท็กหาย: has_all = ไม่ตรง (OD-FB-7)
  if (!hasLimitingCondition(bot.rules, bot.conditionMatch)) return no('NO_CONDITION')
  if (!evaluateConditions(bot.rules, bot.conditionMatch, { stageKey: f.stage.key, contactTags: contact.tags, shopTagKeys: f.shopTagKeys }).ok) return no('CONDITION_UNMATCHED')
  // 6 บอทไม่เลือกสถานะ: run เก่าจบแล้วต้องมีลูกค้าทักใหม่หลังจบ (BR-FB-09 กันหยิบซ้ำเมื่อสถานะเปลี่ยน)
  if (isStageUnrestricted(bot.rules, bot.conditionMatch) && f.lastRunFinishedAt && f.latestBuyerMsg.createdAt.getTime() <= f.lastRunFinishedAt.getTime())
    return no('ALREADY_RAN')
  // 7
  if (f.stage.stamp === null) return no('STAMP_MISSING')
  return { ok: true, stage: { ...f.stage, stamp: f.stage.stamp } }
}

// ── ปิดผลข้อความที่ส่งล้ม (TFR-FB-14 ข้อ 5) ──

export interface FollowFailureOutcome {
  status: 'SKIPPED' | 'FAILED'
  reason: SendReason
  /** ต้องหยุดทั้ง run ด้วยเหตุนี้ด้วยไหม — ทุกกรณีเดินขั้นต่อ ไม่ลองซ้ำ (Q-9) */
  stopRun: StopReason | null
}

/**
 * จัดเหตุผลจาก ChatMessage.failureReason (ข้อความดิบ — "ตัวพิมพ์ต่าง" ของรหัส = ไม่ใช่รหัส ตกเป็น PLATFORM_REJECTED)
 * แบบเดียวกับ mapFailureToLedgerReason ของ 00078 แต่ละเอียดกว่า: แยกแอปอื่นคุมห้อง (จำแนกด้วยถ้อยคำ ห้ามใช้ code #10 เปล่า ๆ — ชนกฎกรอบ 24 ชม.)
 */
export function mapFollowFailure(failureReason: string | null | undefined): FollowFailureOutcome {
  if (failureReason === 'WINDOW_CLOSED') return { status: 'SKIPPED', reason: 'META_WINDOW_REJECTED', stopRun: 'WINDOW_CLOSED' }
  if (failureReason === 'QUOTA_EXCEEDED') return { status: 'SKIPPED', reason: 'LINE_QUOTA_FULL', stopRun: null }
  if (failureReason === UNCERTAIN_SEND_REASON) return { status: 'FAILED', reason: 'UNCERTAIN_SEND', stopRun: null }
  if (failureReason && /another app is controlling this thread/i.test(failureReason))
    return { status: 'SKIPPED', reason: 'OTHER_APP_CONTROLS', stopRun: null }
  return { status: 'FAILED', reason: 'PLATFORM_REJECTED', stopRun: null }
}
