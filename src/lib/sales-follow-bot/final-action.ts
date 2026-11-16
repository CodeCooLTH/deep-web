// 00095 ส่วนต่อขยาย "ตามครบแล้วไม่ตอบ ทำอะไรต่อ" — ตัวตัดสิน pure (BR-FA-2/3/4/5) · engine เป็นแค่ตัวโหลดข้อเท็จจริง + ลงมือ
// 🛑 ห้าม import prisma: ทุกด่านต้องเทสด้วยข้อเท็จจริงล้วน ๆ (บทเรียน ui-boolean-needs-a-testable-home)
import {
  MESSAGE_LOOKBACK_MS,
  MIN_MS,
  type BotStatus,
  type FinalAction,
  type FinalActionKind,
} from './constants'

export interface FinalActionFacts {
  now: Date
  run: { status: string; lastSentAt: Date | null; finalActionAt: Date | null }
  /** null = หาบอทไม่เจอ (ถูกลบจริง) */
  bot: { status: BotStatus; deletedAt: Date | null; finalAction: FinalAction; finalDelayMin: number; testRoomIds: readonly string[] } | null
  room: { id: string; isSpam: boolean; isHidden: boolean; resolvedAt: Date | null }
  /** เวลาข้อความจริงล่าสุดของลูกค้า / ร้านตอบที่นับล่าสุด (message-defs) */
  latestBuyerAt: Date | null
  latestShopReplyAt: Date | null
}

export type FinalSkipReason =
  | 'ALREADY_HANDLED'
  | 'RUN_NOT_DONE'
  | 'BOT_INACTIVE'
  | 'TEST_ROOM_ONLY'
  | 'NO_LAST_SEND'
  | 'TOO_OLD'
  | 'ROOM_ALREADY_HANDLED'
  | 'CUSTOMER_REPLIED'
  | 'SHOP_REPLIED'

/**
 * ACT  = ทำ action นี้กับห้อง
 * WAIT = ยังไม่ถึงเวลา/บอทตั้งเป็นไม่ทำอะไร → ปล่อยค้างไว้ (ไม่ปิดแถว) เผื่อแก้ค่าภายหลัง (BR-FA-6)
 * SKIP = ไม่ทำและปิดแถว (finalActionAt ตั้ง · taken = null) ไม่ให้ tick หน้าหยิบซ้ำ
 */
export type FinalDecision = { action: 'ACT'; kind: FinalActionKind } | { action: 'WAIT' } | { action: 'SKIP'; reason: FinalSkipReason }

export const finalDueAt = (lastSentAt: Date, finalDelayMin: number): Date => new Date(lastSentAt.getTime() + finalDelayMin * MIN_MS)

export function decideFinalAction(f: FinalActionFacts): FinalDecision {
  const skip = (reason: FinalSkipReason): FinalDecision => ({ action: 'SKIP', reason })
  const { run, bot, room, now } = f

  if (run.finalActionAt) return skip('ALREADY_HANDLED') // BR-FA-4: ทำครั้งเดียวต่อ run
  if (run.status !== 'DONE') return skip('RUN_NOT_DONE') // ถูกหยุดก่อนครบ/ยัง ACTIVE ไม่เข้าเงื่อนไข
  if (!bot || bot.deletedAt || bot.status === 'CLOSED') return skip('BOT_INACTIVE')
  // BR-FA-5: บอททดสอบทำเฉพาะห้องทดสอบ — ห้องจริงของลูกค้าห้ามถูกแตะก่อนร้านเปิดใช้
  if (bot.status === 'TESTING' && !bot.testRoomIds.includes(room.id)) return skip('TEST_ROOM_ONLY')
  if (bot.finalAction === 'NONE') return { action: 'WAIT' }
  if (!run.lastSentAt) return skip('NO_LAST_SEND') // ไม่มีรอบที่ส่งจริงให้นับเวลา
  if (now.getTime() - run.lastSentAt.getTime() > MESSAGE_LOOKBACK_MS) return skip('TOO_OLD') // เกินขอบที่อ่านข้อความยืนยันได้ (AC-FB-47)
  if (now.getTime() < finalDueAt(run.lastSentAt, bot.finalDelayMin).getTime()) return { action: 'WAIT' }

  if (room.isSpam || room.isHidden || room.resolvedAt) return skip('ROOM_ALREADY_HANDLED')
  if (f.latestBuyerAt && f.latestBuyerAt.getTime() > run.lastSentAt.getTime()) return skip('CUSTOMER_REPLIED')
  if (f.latestShopReplyAt && f.latestShopReplyAt.getTime() > run.lastSentAt.getTime()) return skip('SHOP_REPLIED')
  return { action: 'ACT', kind: bot.finalAction }
}

/** ข้อความบรรทัดระบบ (FOLLOW_BOT_NOTE) ของ action ท้ายสุด */
export const FINAL_ACTION_NOTE_TEXT: Record<FinalActionKind, string> = {
  RESOLVE: 'ปิดงาน',
  HIDE: 'ซ่อน',
  SPAM: 'ย้ายไปสแปม',
}

export const buildFinalActionNote = (rounds: number, kind: FinalActionKind): string =>
  `บอทตามครบ ${rounds} รอบ ลูกค้าไม่ตอบ — ${FINAL_ACTION_NOTE_TEXT[kind]}`
