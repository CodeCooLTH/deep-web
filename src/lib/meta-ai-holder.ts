/**
 * ตัดสินว่า "Meta AI ถือห้องอยู่" — pure ห้าม import prisma (TFR-002)
 *
 * สูตรหลัง spike Q-23 (Research-Notes): Meta ไม่ส่ง handover ตอน AI ตอบ และ `admin_text` ไม่เคยมา
 * ⇒ ตัดสินจาก echo ฝั่งร้านล่าสุดที่ไม่ใช่ของเราเท่านั้น:
 *   ถือ = echo นั้นมาจากแอปกลาง Meta (Page Inbox / IG Inbox) ∧ ai_generated=true ∧ ไม่มี admin_text
 *         ∧ ไม่มีข้อความฝั่งร้านที่ใหม่กว่า (ของเรา/คนใน Business Suite)  → ถือถึง echoAt + 24 ชม.
 * ห้ามอ่าน viaStandby / marker ใด ๆ (stored-flag-vs-owner-truth)
 */

export const META_PAGE_INBOX_APP_ID = '263902037430900'
export const META_IG_INBOX_APP_ID = '1217981644879628'
export const META_AI_HOLD_MS = 24 * 60 * 60 * 1000

/** ข้อเท็จจริงจากแถว Conversation (ms แทน Date เพื่อให้เป็น primitive) */
export type MetaAiFacts = {
  metaForeignEchoAt?: Date | number | null | undefined
  metaForeignEchoAppId?: string | null | undefined
  metaForeignEchoAi?: boolean | null | undefined
  metaForeignEchoAdminText?: boolean | null | undefined
  /** ข้อความล่าสุดของห้อง (ทุกฝั่ง) + ฝั่งผู้ส่ง — ใช้ตรวจ "ข้อความฝั่งร้านที่ใหม่กว่า echo" */
  lastMessageAt?: Date | number | null | undefined
  lastSenderRole?: string | null | undefined
  metaOwnerAppId?: string | null
  metaOwnerObservedAt?: Date | number | null
}

const ms = (d: Date | number | null | undefined): number | null =>
  d == null ? null : typeof d === 'number' ? d : d.getTime()

export function metaAiHoldingUntilMs(f: MetaAiFacts, ourAppId: string | null): number | null {
  const echoAt = ms(f.metaForeignEchoAt)
  if (echoAt === null) return null
  const appId = f.metaForeignEchoAppId
  if (appId !== META_PAGE_INBOX_APP_ID && appId !== META_IG_INBOX_APP_ID) return null
  if (ourAppId !== null && appId === ourAppId) return null
  if (f.metaForeignEchoAi !== true || f.metaForeignEchoAdminText === true) return null
  // ingest เขียน lastMessageAt = เวลา echo เดียวกันเป๊ะ ⇒ ต้อง "มากกว่า" จึงเป็นข้อความฝั่งร้านใบใหม่ของเรา
  // (echo ต่างแอปใบใหม่กว่าจะมาทับ metaForeignEcho* เองอยู่แล้ว) · ข้อความลูกค้าไม่ตัด — AI ยังตอบลูกค้าอยู่
  const lastAt = ms(f.lastMessageAt)
  if (f.lastSenderRole === 'SHOP' && lastAt !== null && lastAt > echoAt) return null
  // ผู้ถือล่าสุดที่ Meta ยืนยันว่าเป็นเรา (pass ให้เรา) ใหม่กว่า echo AI ⇒ AI คืนห้องแล้ว
  const ownerAt = ms(f.metaOwnerObservedAt)
  if (ourAppId !== null && f.metaOwnerAppId === ourAppId && ownerAt !== null && ownerAt > echoAt) return null
  return echoAt + META_AI_HOLD_MS
}

export function decideMetaAiHolding(f: MetaAiFacts, nowMs: number, ourAppId: string | null): boolean {
  const until = metaAiHoldingUntilMs(f, ourAppId)
  return until !== null && until > nowMs
}

/** เติม `metaAiHoldUntilMs` ให้แถวรายการ และตัดคอลัมน์ดิบ 6 ตัวออก (ไม่ให้หลุดไป client ผ่าน spread) */
export function withMetaAiHold<T extends Partial<MetaAiFacts>>(
  row: T,
  ourAppId: string | null,
): Omit<T, 'metaOwnerAppId' | 'metaOwnerObservedAt' | 'metaForeignEchoAt' | 'metaForeignEchoAppId' | 'metaForeignEchoAi' | 'metaForeignEchoAdminText'> & {
  metaAiHoldUntilMs: number | null
} {
  const { metaOwnerAppId, metaOwnerObservedAt, metaForeignEchoAt, metaForeignEchoAppId, metaForeignEchoAi, metaForeignEchoAdminText, ...rest } = row
  const until = metaAiHoldingUntilMs(
    {
      metaOwnerAppId, metaOwnerObservedAt, metaForeignEchoAt, metaForeignEchoAppId, metaForeignEchoAi, metaForeignEchoAdminText,
      lastMessageAt: row.lastMessageAt, lastSenderRole: row.lastSenderRole,
    },
    ourAppId,
  )
  return { ...rest, metaAiHoldUntilMs: until }
}
