// 00095 BR-FA-12 — "รอ action ท้ายสุด" (pending) ตัวเดียวทั้งชิปแถว/แผงในห้อง · pure ห้าม import prisma
import { MESSAGE_LOOKBACK_MS, type FinalAction, type FinalActionKind } from './constants'
import { finalDueAt } from './final-action'

export interface FinalPending {
  kind: FinalActionKind
  dueAt: Date
}

/**
 * run DONE + บอทตั้ง action + ยังไม่ claim + ยังอยู่ในกรอบ lookback เดียวกับ decideFinalAction (เกินแล้ว engine จะ SKIP TOO_OLD)
 * เลยเวลาแล้วแต่ tick ยังไม่หยิบ = ยังเป็น pending (dueAt อยู่อดีต) — ผู้ใช้ควรเห็นว่ากำลังจะทำ
 */
export function finalPendingOf(
  run: { status: string; lastSentAt: Date | null; finalActionAt: Date | null },
  bot: { finalAction: FinalAction; finalDelayMin: number },
  now: Date,
): FinalPending | null {
  if (run.status !== 'DONE' || run.finalActionAt || bot.finalAction === 'NONE' || !run.lastSentAt) return null
  if (now.getTime() - run.lastSentAt.getTime() > MESSAGE_LOOKBACK_MS) return null
  return { kind: bot.finalAction, dueAt: finalDueAt(run.lastSentAt, bot.finalDelayMin) }
}
