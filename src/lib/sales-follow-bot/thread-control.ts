// 00095 ส่วนต่อขยาย FR-FA-5/BR-FA-8 — บอทดึงสิทธิ์คุมเธรด (Messenger/IG) คืนจาก Business Suite แล้วส่ง · ตัวตัดสิน pure (ห้าม import prisma)
//
// 🛑 ทางนี้ (ฟองล้มแล้วดึงคืน) ห้ามแย่งจาก Meta AI / Business AI — ห้อง Meta AI มีทางแยกของมันเอง: ยืม→ส่ง→คืน (shouldBorrowFromMetaAi ท้ายไฟล์ · ผู้ใช้สั่ง 2026-11-16)
// แยกเจ้าของเธรดไม่ได้แน่ชัด (Meta ไม่ส่ง handover ตอน AI ตอบ) → ถือว่าเป็น Business Suite (Page Inbox) **เมื่อไม่มีหลักฐาน Meta AI**
// หลักฐาน Meta AI = (ก) สูตรถือห้อง decideMetaAiHolding ที่ decideRun HOLD อยู่แล้ว (ข) เจ้าของที่ spy ได้คือแอป Business AI
// (ค) handover event ล่าสุดของเธรดเป็น take ด้วย metadata `axon_take_thread_control` (ของ Business AI — graph.ts META_BUSINESS_AI_APP_ID)
import { MIN_MS, type SendReason } from './constants'

export const META_BUSINESS_AI_APP_ID = '928891643393937'
/** หลัง REQUESTED (เจ้าของยังไม่ปล่อย) รอก่อนลองใหม่ — กันฟองล้มซ้ำทุก tick; ยังอยู่ในกรอบส่งเพราะ decideRun ตรวจกรอบทุกครั้ง */
export const RECLAIM_RETRY_MS = 5 * MIN_MS
/** ข้อความที่ Meta ตอบเมื่อแอปอื่นคุมเธรด — ถ้อยคำเดียวกับ mapFollowFailure/chat-send-failure */
export const OTHER_APP_CONTROLS_RE = /another app is controlling this thread/i

export interface ReclaimGateFacts {
  channel: string
  /** ผล decideMetaAiHolding ณ ตอนส่ง */
  metaAiHolding: boolean
  /** เจ้าของล่าสุดที่เคยสังเกตได้ (Conversation.metaOwnerAppId) */
  ownerAppId: string | null | undefined
  /** metadata ของ handover event ล่าสุดของเธรด + ชนิด (null = ไม่มี event) */
  lastHandover: { kind: string; metadata: string | null } | null
}

export type ReclaimGate = { ok: true } | { ok: false; reason: 'NOT_META' | 'META_AI' }

export function mayReclaim(f: ReclaimGateFacts): ReclaimGate {
  if (f.channel !== 'MESSENGER' && f.channel !== 'INSTAGRAM') return { ok: false, reason: 'NOT_META' }
  if (f.metaAiHolding || f.ownerAppId === META_BUSINESS_AI_APP_ID) return { ok: false, reason: 'META_AI' }
  if (f.lastHandover?.kind === 'take' && /axon_take_thread_control/i.test(f.lastHandover.metadata ?? '')) return { ok: false, reason: 'META_AI' }
  return { ok: true }
}

/** ผลของ claimThreadControl (graph.ts) ในรูปที่ pure รู้จัก */
export type ClaimOutcome =
  | { outcome: 'TAKEN' }
  | { outcome: 'REQUESTED' }
  | { outcome: 'FAILED'; reason: 'ROUTING_NOT_ENABLED' | 'TOKEN_INVALID' | 'UNKNOWN' }

export type AfterClaim = { action: 'RESEND' } | { action: 'RETRY_LATER' } | { action: 'SKIP'; reason: SendReason }

export function afterClaim(c: ClaimOutcome): AfterClaim {
  if (c.outcome === 'TAKEN') return { action: 'RESEND' } // ได้สิทธิ์แล้ว ส่งรอบเดิมทันที (ใต้ Send claim เดิม — ไม่เกิดรอบซ้อน)
  if (c.outcome === 'REQUESTED') return { action: 'RETRY_LATER' } // ไม่ข้ามรอบถาวร: คืนกุญแจให้ tick หน้าลองใหม่
  if (c.reason === 'ROUTING_NOT_ENABLED') return { action: 'SKIP', reason: 'ROUTING_NOT_ENABLED' }
  if (c.reason === 'TOKEN_INVALID') return { action: 'SKIP', reason: 'CHANNEL_TOKEN_INVALID' }
  return { action: 'SKIP', reason: 'OTHER_APP_CONTROLS' }
}

/** ยังอยู่ในช่วงรอหลังฟองล้มเพราะแอปอื่นคุมเธรด → ไม่เปิดฟองใหม่ใน tick นี้ */
export const reclaimBackoffActive = (lastOtherAppFailureAt: Date | null, now: Date): boolean =>
  lastOtherAppFailureAt !== null && now.getTime() - lastOtherAppFailureAt.getTime() < RECLAIM_RETRY_MS

// ── ยืมห้องจาก Meta AI (ผู้ใช้สั่ง 2026-11-16 — กลับมติ "ห้ามแตะห้อง Meta AI" เฉพาะจังหวะส่งรอบ) ─────────────
// ห้องที่ Meta AI ถือ: ถึงเวลาส่งรอบ → take ก่อน (ไม่สร้างฟองจนกว่าจะได้สิทธิ์ = ไม่มีฟองล้มโผล่ในห้อง)
// ได้สิทธิ์ → ส่งรอบ → คืนให้ Business AI ทันที · ไม่ได้ (เพจไม่ได้ตั้ง Conversation Routing ฯลฯ) → พักต่อแบบเดิม
/** ลองยืมไม่สำเร็จแล้ว รอก่อนลองใหม่ — เพจที่ไม่ได้ตั้ง routing จะล้มทุกครั้ง ห้ามยิง Graph ทุก tick */
export const BORROW_RETRY_MS = 30 * MIN_MS
export const BORROW_METADATA = 'deep-follow-bot-borrow'

/** ควรลองยืมห้องจาก Meta AI ใน tick นี้ไหม: เฉพาะ Meta channel · รอบถึงเวลาส่งแล้วถ้าไม่นับ Meta AI · พ้น backoff */
export function shouldBorrowFromMetaAi(f: { channel: string; dueIfNotHeld: boolean; lastFailedBorrowAt: Date | null; now: Date }): boolean {
  if (f.channel !== 'MESSENGER' && f.channel !== 'INSTAGRAM') return false
  if (!f.dueIfNotHeld) return false
  return f.lastFailedBorrowAt === null || f.now.getTime() - f.lastFailedBorrowAt.getTime() >= BORROW_RETRY_MS
}
