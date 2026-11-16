// ตรรกะตัดสินของ "บอทติดตามในห้อง" (00095 S-8b) — pure · client-safe · เทส: __tests__/follow-bot-room.test.ts
// (convention ui-boolean-needs-a-testable-home: ชิป/แผงห้ามตัดสินเอง — ถามที่นี่ที่เดียว)
import type { ConversationPanel, PanelRun, PanelStep } from '@/services/sales-follow-bot.service'

export type FollowBotChipTone = 'info' | 'warning'
export type StepRowKind = 'sent' | 'next' | 'waiting' | 'sending' | 'skipped' | 'failed'

/** run ที่ต้องแสดง — available:false / ไม่มี run = null (ชิปและแผงไม่ render อะไรเลย) */
export function runOf(panel: ConversationPanel | null | undefined): PanelRun | null {
  return panel && panel.available ? panel.run : null
}

/** ร้านค้างตอบ = warning ทั้งก้อน (กรณีเดียวที่ผู้ขายต้องลงมือ) · นอกนั้น info */
export function chipTone(run: Pick<PanelRun, 'awaitingShop'>): FollowBotChipTone {
  return run.awaitingShop ? 'warning' : 'info'
}

/** จำนวนรอบที่ส่งสำเร็จ — นับเหมือนแคปซูลในแถวกล่องแชท (Send ที่ SENT) */
export function sentRounds(steps: readonly Pick<PanelStep, 'state'>[]): number {
  return steps.filter((s) => s.state === 'SENT').length
}

/** ตำแหน่ง (0-based) ของรอบที่บอทกำลังจะส่ง/กำลังส่ง — -1 = ไม่เหลือ */
export function nextStepIndex(steps: readonly Pick<PanelStep, 'state'>[]): number {
  return steps.findIndex((s) => s.state === 'PENDING' || s.state === 'SENDING')
}

export interface DurationUnits {
  day: string
  hour: string
  minute: string
}

/** <1 ชม. "25 นาที" · <24 ชม. "2 ชม. 10 นาที" · ≥24 ชม. "1 วัน 3 ชม." (UX §3.3) — ต่ำกว่า 1 นาทีปัดเป็น 1 นาที */
export function formatRemaining(ms: number, u: DurationUnits): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000))
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  const parts =
    d > 0
      ? [`${d} ${u.day}`, h ? `${h} ${u.hour}` : '']
      : h > 0
        ? [`${h} ${u.hour}`, m ? `${m} ${u.minute}` : '']
        : [`${m} ${u.minute}`]
  return parts.filter(Boolean).join(' ')
}

export type NextRoundSummary =
  | { kind: 'afterReply' }
  | { kind: 'hold'; text: string }
  | { kind: 'due'; n: number; total: number; remainingMs: number; dueAt: string }

/**
 * บรรทัดสรุปในกล่องของชิป — ลำดับความสำคัญ: ร้านค้างตอบ > พัก > ถึงรอบ
 * ไม่มีอะไรจะบอก (ไม่มีรอบเหลือ / ไม่มีเวลา) = null
 */
export function nextRoundSummary(run: PanelRun, nowMs: number): NextRoundSummary | null {
  if (run.awaitingShop) return { kind: 'afterReply' }
  if (run.holdText) return { kind: 'hold', text: run.holdText }
  const i = nextStepIndex(run.steps)
  const step = i >= 0 ? run.steps[i] : null
  if (!step?.dueAt) return null
  const due = Date.parse(step.dueAt)
  if (Number.isNaN(due)) return null
  return { kind: 'due', n: step.index, total: run.steps.length, remainingMs: Math.max(0, due - nowMs), dueAt: step.dueAt }
}

/**
 * ชนิดของแถวรอบในแผง — "ถัดไป" ต้องมีเวลา (dueAt) จึงเด่น: ตอนร้านค้างตอบ/พัก ไม่มีเวลา = ทุกรอบที่เหลือเป็น "รอส่ง" เท่ากัน
 */
export function stepRowKind(step: PanelStep, isNextIndex: boolean): StepRowKind {
  switch (step.state) {
    case 'SENT':
      return 'sent'
    case 'SENDING':
      return 'sending'
    case 'SKIPPED':
      return 'skipped'
    case 'FAILED':
      return 'failed'
    default:
      return isNextIndex && step.dueAt ? 'next' : 'waiting'
  }
}

/** ปุ่มหยุด: ล็อกเมื่อ canStop=false (พร้อมเหตุผลเป็นข้อความ ไม่ซ่อนปุ่ม) หรือกำลังหยุด */
export function stopControl(run: Pick<PanelRun, 'canStop'>, stopping: boolean): { disabled: boolean; showReason: boolean } {
  return { disabled: !run.canStop || stopping, showReason: !run.canStop }
}

/**
 * ตัวกันคำตอบเก่า — ทุกคำขอเอา token ใหม่ · คำตอบที่ token ไม่ใช่ล่าสุดต้องทิ้ง
 * ใช้ทั้ง "ยิงสองรอบติดกันแล้วตอบกลับลำดับ" และ "สลับห้อง" (สลับห้อง = ยิงใหม่ = token เก่าตกรุ่นเอง)
 */
export function createLatestGate() {
  let n = 0
  return { next: () => ++n, isLatest: (token: number) => token === n }
}

/** debounce ท้ายช่วง — เรียกซ้ำใน ms = เหลือครั้งสุดท้ายครั้งเดียว · cancel ใช้ตอน unmount */
export function createDebounced(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    call: () => {
      clearTimeout(timer)
      timer = setTimeout(fn, ms)
    },
    cancel: () => clearTimeout(timer),
  }
}
