// feature 00023 Chat Auto-Reply — ค่าคงที่ String (FROZEN) จาก DATABASE.md §3.8
// + สูตร specificity (DATABASE §3.4) + mapping resolutionLevel (SRS TFR-010 ขั้นที่ 6)
//
// [SSOT] ไฟล์นี้คือแหล่งเดียวของค่าคงที่กลุ่มนี้ทั้งหมด — ห้ามประกาศซ้ำที่อื่นในโค้ดเบส
// (service/route ที่ต้องใช้ค่าพวกนี้ต้อง import จากไฟล์นี้เท่านั้น)
//
// หมายเหตุ: DATABASE.md §3.8 มีตารางค่าคงที่ 9 แถว (ไม่ใช่ 8 — นับตามตารางจริง:
// matchType, humanTakeoverPauseMode, adsContextMode, AutoReplyJob.status,
// AutoReplyLog.decision, AutoReplyLog.resolutionLevel, AutoReplyLog.skipReason,
// ChatMessage.autoReplyKind, Conversation.contextProductSource) ประกาศครบทั้ง 9
// กลุ่มไว้ที่นี่เพื่อไม่ให้มีค่าคงที่ตกหล่นเป็น SSOT ที่ไม่ครบ

/** AutoReplyKeyword.matchType */
/**
 * โหมดของการตั้งค่าแต่ละชุด (feature 00023, user 2026-07-29)
 * LIVE = ตอบลูกค้าจริงทุกคน · TEST = ตอบเฉพาะเธรดที่อยู่ใน allowlist ของโหมดทดสอบ
 *
 * แยกรายรายการแทนที่จะเป็นสวิตช์ระดับร้าน เพราะสวิตช์ร้านทำให้ "ลืมปิด = ลูกค้าทั้งร้าน
 * ไม่ได้คำตอบ" ส่วนแบบนี้ลืมปิดกระทบแค่ชุดนั้น และปล่อยของทีละชุดได้
 */
export const AUTO_REPLY_MODES = ['LIVE', 'TEST'] as const
export type AutoReplyMode = (typeof AUTO_REPLY_MODES)[number]

export const MATCH_TYPES = ['EXACT', 'CONTAINS', 'STARTS_WITH'] as const
export type MatchType = (typeof MATCH_TYPES)[number]

/** AutoReplyConfig.humanTakeoverPauseMode */
export const HUMAN_TAKEOVER_PAUSE_MODES = ['30M', '2H', 'MANUAL', 'UNTIL_RESOLVED'] as const
export type HumanTakeoverPauseMode = (typeof HUMAN_TAKEOVER_PAUSE_MODES)[number]

/** AutoReplyConfig.adsContextMode */
export const ADS_CONTEXT_MODES = ['UNTIL_RESOLVED', 'HOURS', 'UNTIL_NEW_PRODUCT'] as const
export type AdsContextMode = (typeof ADS_CONTEXT_MODES)[number]

/** AutoReplyJob.status */
export const AUTO_REPLY_JOB_STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED'] as const
export type AutoReplyJobStatus = (typeof AUTO_REPLY_JOB_STATUSES)[number]

/** AutoReplyLog.decision */
export const AUTO_REPLY_LOG_DECISIONS = ['REPLIED', 'SKIPPED', 'HANDOFF', 'FAILED'] as const
export type AutoReplyLogDecision = (typeof AUTO_REPLY_LOG_DECISIONS)[number]

/** AutoReplyLog.resolutionLevel — ระดับ 1..9 ตาม PRD §3.2 / SRS TFR-010 ขั้นที่ 6 */
export const RESOLUTION_LEVELS = [
  'KEYWORD_PAGE_AD_PRODUCT',
  'KEYWORD_PAGE_AD',
  'KEYWORD_PAGE_PRODUCT',
  'KEYWORD_PAGE',
  'KEYWORD_PRODUCT',
  'KEYWORD_DEFAULT',
  'PAGE_DEFAULT',
  'SHOP_DEFAULT',
  'NONE',
] as const
export type ResolutionLevel = (typeof RESOLUTION_LEVELS)[number]

/** AutoReplyLog.skipReason */
export const SKIP_REASONS = [
  'SHOP_DISABLED',
  'CONVERSATION_DISABLED',
  // 🛑 เลิกใช้ 2026-07-29 (โหมดทดสอบระดับร้านถูกยกเลิก) แต่ห้ามลบออกจากรายการ —
  // แถวบันทึกเก่าใน AutoReplyLog ยังมีค่านี้อยู่ ถ้าถอดออกจะอ่านของเดิมไม่ผ่าน validate
  'NOT_IN_TEST_ALLOWLIST',
  // กลุ่มคำที่ชนะอยู่สถานะ TEST แต่เธรดนี้ไม่ได้อยู่ในรายการแชททดสอบของกลุ่มนั้น
  'KEYWORD_TEST_ONLY',
  'SPAM',
  'HANDED_OFF',
  'PAUSED_HUMAN_TAKEOVER',
  'OUTBOUND_MESSAGE',
  'KEYWORD_COOLDOWN',
  'MAX_REPLIES_REACHED',
  'NO_KEYWORD_MATCH',
  'NO_RULE_MATCH',
  'EMPTY_REPLY',
  'WINDOW_CLOSED',
  'CHANNEL_INACTIVE',
  'DUPLICATE_JOB',
] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

/** ChatMessage.autoReplyKind — `null` = คนตอบเอง (ไม่ใช่ auto-reply) */
export const AUTO_REPLY_KINDS = ['AUTO', 'AUTO_TEST'] as const
export type AutoReplyKind = (typeof AUTO_REPLY_KINDS)[number] | null

/** Conversation.contextProductSource */
export const CONTEXT_PRODUCT_SOURCES = ['ADS_MAPPING', 'MANUAL', 'REFERRAL'] as const
export type ContextProductSource = (typeof CONTEXT_PRODUCT_SOURCES)[number]

// ---------------------------------------------------------------------------
// specificity — DATABASE.md §3.4
// ---------------------------------------------------------------------------

export interface SpecificityInput {
  shopChannelId?: string | null
  adId?: string | null
  productId?: string | null
}

/**
 * คำนวณ bitmask ความเฉพาะเจาะจงของ AutoReplyRule (DATABASE §3.4):
 *   (shopChannelId != null ? 4 : 0) + (adId != null ? 2 : 0) + (productId != null ? 1 : 0)
 *
 * [ข้อบังคับ] ค่านี้ต้องคำนวณที่ service layer ทุกครั้งที่เขียนแถว — ห้ามรับค่าจาก client
 * (SRS TFR-004) ฟังก์ชันนี้เป็นจุดคำนวณเดียวเพื่อไม่ให้มีสูตรคู่ขนานหลุดไปที่อื่น
 */
export function computeSpecificity({ shopChannelId, adId, productId }: SpecificityInput): number {
  return (shopChannelId != null ? 4 : 0) + (adId != null ? 2 : 0) + (productId != null ? 1 : 0)
}

// ---------------------------------------------------------------------------
// resolutionLevel mapping — SRS TFR-010 ขั้นที่ 6
// ---------------------------------------------------------------------------

/**
 * แมป specificity + มี/ไม่มี keywordId -> resolutionLevel ตาม DATABASE §3.8 (FROZEN)
 *
 * ครอบเฉพาะค่าที่ "เกิดได้จริง" ตาม invariant ของ SRS TFR-004:
 *   - keywordId ไม่ null: `adId != null` บังคับให้ `shopChannelId != null` เสมอ
 *     ⇒ specificity 2 (โฆษณาอย่างเดียว) และ 3 (โฆษณา+สินค้า ไม่ระบุเพจ) เกิดไม่ได้
 *   - keywordId เป็น null (กฎกลาง): ต้องไม่มีเงื่อนไขโฆษณา/สินค้า ⇒ specificity มีได้แค่ 0 หรือ 4
 *
 * [ข้อบังคับ] ค่า specificity 2/3 ไม่มีชื่อระดับอยู่ใน FROZEN list ของ DATABASE §3.8
 * เอกสาร TestCase.md (TC-RES-16) ตั้งคำถามไว้ว่าจะ map เป็นชื่อใกล้เคียง แต่ยังไม่มีข้อยุติ
 * ใน SDS — ฟังก์ชันนี้จึงเลือก **throw แทนการเดาค่า** เมื่อเจอ specificity ที่ invariant
 * บอกว่าเกิดไม่ได้ เพราะการเขียนค่านอกลิสต์ FROZEN (หรือเดาเป็นชื่อที่ใกล้เคียงแบบไม่มี
 * ข้อยุติ) เสี่ยงกว่าการ throw ให้เห็นทันทีว่ามีข้อมูลไม่สอดคล้อง (invariant ถูกละเมิดที่อื่น
 * ต้องแก้ที่ rule service ไม่ใช่แก้ที่ helper ตัวนี้)
 */
export function getResolutionLevel(specificity: number, hasKeywordId: boolean): ResolutionLevel {
  if (hasKeywordId) {
    switch (specificity) {
      case 7:
        return 'KEYWORD_PAGE_AD_PRODUCT'
      case 6:
        return 'KEYWORD_PAGE_AD'
      case 5:
        return 'KEYWORD_PAGE_PRODUCT'
      case 4:
        return 'KEYWORD_PAGE'
      case 1:
        return 'KEYWORD_PRODUCT'
      case 0:
        return 'KEYWORD_DEFAULT'
      case 2:
      case 3:
        throw new Error(
          `getResolutionLevel: specificity=${specificity} กับ keywordId ไม่ null เกิดไม่ได้ตาม ` +
            `invariant TFR-004 (adId ต้องมาคู่กับ shopChannelId เสมอ) — ข้อมูลไม่สอดคล้อง ` +
            `ต้องแก้ไขที่ rule service ไม่ใช่เดา resolutionLevel ที่นี่`
        )
      default:
        throw new Error(`getResolutionLevel: specificity=${specificity} ไม่ใช่ค่าที่เป็นไปได้ (ต้องอยู่ในช่วง 0-7)`)
    }
  }

  switch (specificity) {
    case 4:
      return 'PAGE_DEFAULT'
    case 0:
      return 'SHOP_DEFAULT'
    default:
      throw new Error(
        `getResolutionLevel: keywordId=null ต้องมี specificity เป็น 0 หรือ 4 เท่านั้น ` +
          `(ได้ ${specificity}) ตาม invariant TFR-004 — กฎกลางต้องไม่มีเงื่อนไขโฆษณา/สินค้า`
      )
  }
}
