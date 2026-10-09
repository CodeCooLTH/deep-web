/**
 * ตัวตัดสินของคำแนะนำคำตอบอัตโนมัติ (00019-ext) — pure ไม่มี React/timer/fetch
 * เหตุผลที่แยก: ให้ทุกเงื่อนไขมีเทสจับได้ (repo ไม่มี jsdom) ส่วน hook มีหน้าที่แค่ "ทำตามที่ฟังก์ชันนี้บอก"
 * อ้างอิง: plan 2026-10-09-00019-ext-typhoon-auto-suggest-plan.md หัวข้อ 5.2, UX spec "วิธีแยกสองโหมด"
 */
import type { AutoSuggestState } from '@/lib/ai-suggest-auto-types'

/** รอให้ข้อความลูกค้าหยุดไหล (A แล้ว B ติดกัน) ก่อนยิง — hook เป็นคนจับเวลา */
export const AUTO_SUGGEST_DEBOUNCE_MS = 1500
export const AUTO_SUGGEST_POLL_INTERVAL_MS = 1500
/** THINKING นานเกินนี้ = ยอมแพ้เงียบ ๆ (ไม่ค้างหมุนตลอดไป) */
export const AUTO_SUGGEST_POLL_MAX_MS = 10_000

export type ShouldRequestInput = {
  enabled: boolean // โหมด auto + มี conversation
  visible: boolean // แท็บมองเห็น (กันยิงตอนแอดมินไม่ได้ดูห้อง)
  latestMessageIsBuyer: boolean
  anchorId: string | null // ข้อความ BUYER ล่าสุด
  handledAnchorId: string | null // anchor ที่ขอจนจบแล้ว — ห้ามยิงซ้ำ (ยกเว้น manual regenerate)
}

export function shouldRequest(i: ShouldRequestInput): boolean {
  return (
    i.enabled &&
    i.visible &&
    i.latestMessageIsBuyer &&
    i.anchorId !== null &&
    i.anchorId !== i.handledAnchorId
  )
}

export type FetchStep = 'post' | 'poll' | 'done' | 'giveup'

/**
 * หลังได้ผลจาก GET/POST ต้องทำอะไรต่อ
 * - กฎ ข: POST เฉพาะ GET ที่ตอบ NONE/NO_RUN (POST ที่ได้ NO_RUN ไม่วนซ้ำ)
 * - poll เฉพาะ THINKING และไม่เกิน POLL_MAX_MS
 */
export function nextStep(source: 'GET' | 'POST', state: AutoSuggestState, pollElapsedMs: number): FetchStep {
  if (state.status === 'THINKING') return pollElapsedMs >= AUTO_SUGGEST_POLL_MAX_MS ? 'giveup' : 'poll'
  if (source === 'GET' && state.status === 'NONE' && state.reason === 'NO_RUN') return 'post'
  return 'done'
}

/**
 * ผลที่ยังใช้ได้ไหม — ทิ้งถ้า anchor ไม่ใช่ BUYER ล่าสุดแล้ว (ส่ง A แล้ว B → เหลือ B)
 * หรือข้อความล่าสุดไม่ใช่ BUYER (ร้านตอบไปก่อนผลมา)
 * NONE ที่ anchor=null (STALE_ANCHOR จาก server) ผ่านได้เพราะไม่มีเนื้อหาให้โชว์
 */
export function isResultCurrent(
  state: AutoSuggestState,
  anchorId: string | null,
  latestMessageIsBuyer: boolean,
): boolean {
  if (!latestMessageIsBuyer || anchorId === null) return false
  return state.anchorMessageId === null || state.anchorMessageId === anchorId
}

export type AutoSuggestViewInput = {
  mode: 'auto' | 'manual'
  status: 'none' | 'thinking' | 'ready'
  anchorIsLatestBuyer: boolean
  typing: boolean
  dismissedAnchorId: string | null
  anchorId: string | null
  recalledAnchorId: string | null
  activePanel: string | null // แผงอื่นเปิดอยู่ (emoji/สินค้า ฯลฯ) → ไม่แย่งที่
  composerDisabled: boolean
}
export type AutoSuggestView = 'none' | 'thinking' | 'ready' | 'recall'

/** สูตรตาม UX spec ตรงตัว — ปุ่มเรียกกลับขึ้นเฉพาะตอนมีคำแนะนำ READY ที่ถูกซ่อน */
export function getAutoSuggestView(i: AutoSuggestViewInput): AutoSuggestView {
  if (
    i.mode !== 'auto' ||
    i.status === 'none' ||
    !i.anchorIsLatestBuyer ||
    i.composerDisabled ||
    i.activePanel !== null
  ) {
    return 'none'
  }
  const hidden = (i.typing && i.recalledAnchorId !== i.anchorId) || i.dismissedAnchorId === i.anchorId
  if (hidden) return i.status === 'ready' ? 'recall' : 'none'
  return i.status === 'thinking' ? 'thinking' : 'ready'
}
