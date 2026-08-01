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
  // เพิ่ม 2026-08-01 (phase 00023-ai-enhance) — AI อ่านคลังความรู้แล้วเรียบเรียงคำตอบเอง
  //
  // WARNING: ห้ามใช้ 'QNA' แทน แม้ข้อมูลจะมาจากคลังเดียวกัน — 'QNA' แปลว่า "จับคู่ตรงตัวได้
  // ข้อใดข้อหนึ่งแล้วส่งคำตอบข้อนั้นตรงตัว" ซึ่งตรวจย้อนหลังได้ว่าเป็นข้อไหน
  // ส่วน 'CHATBOT' คือข้อความที่ AI แต่งขึ้นจากหลายข้อรวมกัน ไม่มีข้อต้นทางข้อเดียว
  // แยกค่าไว้เพื่อให้ตอนบอทตอบแปลก คนไล่ปัญหารู้ทันทีว่าต้องไปดู prompt ไม่ใช่ไปหาข้อในคลัง
  'CHATBOT',
  // เพิ่ม 2026-07-31 (phase 00023-qna) — คำตอบมาจาก AutoReplyQna ไม่ได้ผ่าน resolveRule เลย
  //
  // WARNING: ห้ามใช้ 'KEYWORD_DEFAULT' แทน แม้จะ "ใกล้เคียง": ค่านั้นแปลว่า "กฎกลางของกลุ่มคำถูกเลือก"
  // ซึ่งจะทำให้ตอนบอทตอบแปลก คนไล่ปัญหาไปเปิดหา AutoReplyRule ที่ไม่มีอยู่จริง
  // เป็นค่าที่ **ไม่มีทางออกจาก getResolutionLevel()** — ผู้เรียกเซ็ตตรง ๆ ที่ processJob (TFR-032)
  'QNA',
] as const
export type ResolutionLevel = (typeof RESOLUTION_LEVELS)[number]

/**
 * AutoReplyLog.matchedVia — ข้อความเข้ากลุ่มคำด้วยวิธีไหน (เพิ่ม 2026-07-31, phase 00023-qna)
 *
 * WARNING: `null` ในคอลัมน์นี้ = แถวที่บันทึกก่อน phase นี้ ต้องอ่านว่า `KEYWORD` เสมอ และ **ห้าม backfill
 * ทับ** — การเติมย้อนหลังจะทำให้แยกไม่ออกระหว่างแถวที่ "รู้จริง" กับแถวที่ "เดาให้" ซึ่งเป็น
 * สิ่งเดียวที่ตารางบันทึกมีไว้ทำ (ป้าย DeepBot ในห้องแชทอ่านค่านี้ตรง ๆ เพื่อบอกที่มาของคำตอบ)
 */
// 'CHATBOT' = AI อ่านคลังความรู้แล้วเรียบเรียงคำตอบเอง (ไม่ได้จับคู่กับข้อไหนเป็นพิเศษ)
// ต่างจาก 'QNA' ที่จับคู่ตรงตัวได้ข้อใดข้อหนึ่งแล้วส่งคำตอบข้อนั้นตรง ๆ
export const MATCHED_VIA = ['KEYWORD', 'QNA', 'CHATBOT'] as const
export type MatchedVia = (typeof MATCHED_VIA)[number]

/** AutoReplyQna.source — ข้อในคลังมาจากไหน (ใช้ตอบว่าคลังโตจากงานประจำวันจริงไหม) */
export const QNA_SOURCES = ['MANUAL', 'QUEUE', 'IMPORT'] as const
export type QnaSource = (typeof QNA_SOURCES)[number]

/** AutoReplyUnansweredQuestion.status */
export const UNANSWERED_STATUSES = ['PENDING', 'DISMISSED', 'ANSWERED'] as const
export type UnansweredStatus = (typeof UNANSWERED_STATUSES)[number]

/** จำนวนรูปแนบสูงสุดต่อคำตอบ 1 ชุด (user ตัดสิน 2026-07-31 — ตรงกับ QuickMessage) */
export const MAX_REPLY_IMAGES = 5

/** AutoReplyLog.skipReason */
export const SKIP_REASONS = [
  // 🛑 เลิกใช้ 2026-07-30 (สวิตช์ระดับร้านถูกถอดออก) — ห้ามลบ แถว log เก่ายังมีค่านี้
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
  // นอกเวลาทำงานที่ร้านตั้งไว้ (feature 00023 เฟส A) — กลุ่มสถานะ TEST ไม่ติดด่านนี้
  'OUTSIDE_SCHEDULE',
  'MAX_REPLIES_REACHED',
  'NO_KEYWORD_MATCH',
  'NO_RULE_MATCH',
  'EMPTY_REPLY',
  // AI Enhance: ข้อความที่กำลังจะส่งชนกฎห้ามตอบของร้าน -> ไม่ส่งอะไรเลย ส่งต่อคน
  // (ต่างจาก GUARDRAILS_CHECK_FAILED ที่ตัวตรวจเองล่ม ซึ่งถอยไปส่งคำตอบดิบและ "ตอบสำเร็จ"
  //  จึงไม่ใช่ skipReason — ไปอยู่ใน reason ของ AI Enhance แทน)
  'GUARDRAILS_BLOCKED',
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

/* ══ AI Enhance (phase `00023-ai-enhance`) ═══════════════════════════════════
 * SSOT: docs/scope/2026-08-01-00023-ai-enhance-scope-baseline.md
 *       + PRD.md §3.9 (BR-AR-31..36)
 */

/**
 * งบเวลาทั้ง pipeline ของ AI Enhance (BR-AR-31) — เรียบเรียง + ด่านตรวจ รวมกัน
 *
 * WARNING: **ห้ามใช้ `REQUEST_TIMEOUT_MS` (15s) ของ `lib/gemini.ts` แทน** — ตัวนั้นเป็นงบของ
 * ผู้ช่วยร่างคำตอบ (feature 00019) ซึ่งมีแอดมินนั่งรอดูผลอยู่ จึงยอมรอนานกว่าได้
 * ส่วนตัวนี้อยู่ในเส้นทางที่ลูกค้ากำลังรอคำตอบ ไม่มีใครคอยกดยกเลิกให้
 *
 * 8 วินาทีคือ "สัญญากับลูกค้า" ไม่ใช่สัญญากับแต่ละโมเดล — โมเดลแรกหมดเวลาถือว่าล้มทั้งรอบ
 * ไม่ไล่ตัวสำรองต่อ (user เคาะ 2026-08-01)
 */
export const AI_ENHANCE_TIMEOUT_MS = 8_000

/**
 * งบเวลาของ ChatBot เมื่อร้านเปิดโหมด "ให้ AI ตอบเอง" — 20 วินาที
 *
 * เส้นทางนั้นอาจต้องเรียกโมเดลถึง 3 รอบภายใต้งบก้อนเดียว (ตอบจากคลัง -> ตอบอิสระ
 * ซึ่งอาจค้นเว็บด้วย -> ด่านตรวจกฎ) 8 วินาทีจึงหมดกลางทางเป็นปกติ แล้วบอทเงียบ
 * ทั้งที่ตั้งค่าถูกทุกอย่าง — ซึ่งอ่านจากภายนอกไม่ต่างจากฟีเจอร์พัง
 *
 * ยาวได้เพราะงานนี้อยู่ในคิวเบื้องหลัง ไม่ใช่คำขอที่ Meta รออยู่ (webhook ตอบ 200 ไปแล้ว)
 * ส่วนโหมดอื่นยังใช้ 8 วินาทีเท่าเดิม — ไม่จ่ายค่าความช้าให้ฟีเจอร์ที่ไม่ได้เปิด
 */
export const AI_CHATBOT_FREE_TIMEOUT_MS = 20_000

/**
 * เรตแปลง USD → บาท สำหรับคิดต้นทุน AI (BR-AR-36)
 *
 * ตั้ง **สูงกว่าตลาดจริงเล็กน้อยโดยเจตนา** เป็น margin — หลักเดียวกับ `FALLBACK_RATE`
 * ใน `ai-pricing.ts` ("ประเมินสูงไว้ก่อน ดีกว่าขายขาดทุน")
 *
 * ปรับด้วยมือ ไม่ผูก API เรตสด (user เคาะ 2026-08-01) — เส้นทางคิดเงินไม่ควรมี dependency
 * ภายนอกที่ล่มแล้วต้องมีค่าสำรองอยู่ดี
 *
 * ตรวจล่าสุด 2026-08-01 (ตลาด ~32.5) — ถ้าเงินบาทอ่อนกว่านี้มากต้องมาปรับ
 */
export const USD_TO_THB_RATE = 36

/** เพดานค่าใช้จ่าย AI ต่อวันเริ่มต้น (บาท) — ตรงกับ DEFAULT ของคอลัมน์ใน schema */
export const DEFAULT_AI_DAILY_CAP_BAHT = 50

/** สัดส่วนที่ถือว่า "ใกล้เต็ม" แล้วต้องเตือนร้าน (BR-AR-35) */
export const AI_CAP_ALERT_RATIO = 0.8

/**
 * เหตุผลที่ไม่ได้ส่งข้อความที่ AI เรียบเรียง — บันทึกลง log ทุกครั้ง (BR-AR-33)
 *
 * WARNING: `GUARDRAILS_BLOCKED` กับ `GUARDRAILS_CHECK_FAILED` **ปลายทางต่างกัน**
 *   BLOCKED = ชนกฎจริง -> ไม่ส่งอะไรเลย ส่งต่อคน
 *   CHECK_FAILED = ตัวตรวจเองล่ม -> ถอยไปส่งคำตอบดิบ (ซึ่งปลอดภัยโดยนิยาม)
 * รวมสองอันนี้เป็นค่าเดียวเมื่อไหร่ จะแยกไม่ออกว่าร้านเงียบเพราะกฎหรือเพราะระบบพัง
 */
export const AI_ENHANCE_SKIP_REASONS = [
  'DISABLED',
  'NO_RAW_ANSWER',
  'AI_ENHANCE_TIMEOUT',
  'AI_ENHANCE_ERROR',
  'GUARDRAILS_BLOCKED',
  'GUARDRAILS_CHECK_FAILED',
  'DAILY_CAP_REACHED',
  'INSUFFICIENT_CREDIT',
] as const

export type AiEnhanceSkipReason = (typeof AI_ENHANCE_SKIP_REASONS)[number]

/**
 * ชุดกฎห้ามตอบเริ่มต้น 6 ข้อ (BR-AR-34) — user เคาะเนื้อหา 2026-08-01
 *
 * copy-by-value เข้ากลุ่มคำตอนเปิดสวิตช์ครั้งแรกเท่านั้น — หลังจากนั้นเป็นของกลุ่มนั้น
 * ร้านแก้/ลบได้อิสระ และการแก้ชุดนี้ในอนาคต **ห้ามย้อนไปแตะกลุ่มที่ copy ไปแล้ว**
 *
 * `denyPhrases` = ด่านแรกที่ตรวจได้โดยไม่เสียเงินเรียก AI — ตั้งใจใส่เฉพาะคำที่ชัดเจนมาก
 * ไม่พยายามครอบคลุมทุกสำนวน เพราะ false positive แปลว่าร้านเงียบใส่ลูกค้าโดยไม่มีเหตุผลที่ดี
 * ส่วนที่จับด้วยคำไม่ได้ ปล่อยให้ด่าน AI ตัดสิน
 */
export const DEFAULT_GUARDRAILS: { rule: string; denyPhrases: string[] }[] = [
  {
    rule: 'ห้ามต่อรองราคาหรือให้ส่วนลดที่ไม่ได้ตั้งไว้ในระบบ',
    denyPhrases: ['ลดให้', 'ลดราคาให้', 'ต่อรองได้', 'ลดเพิ่ม'],
  },
  {
    rule: 'ห้ามสัญญาระยะเวลาจัดส่งที่ไม่ตรงกับที่ร้านตั้งไว้',
    denyPhrases: ['ส่งวันนี้', 'ถึงพรุ่งนี้', 'ส่งด่วนพิเศษ'],
  },
  {
    rule: 'ห้ามตอบเรื่องคืนเงิน เคลม หรือข้อพิพาทคำสั่งซื้อ — ต้องส่งต่อคนเสมอ',
    denyPhrases: ['คืนเงินได้', 'ยินดีคืนเงิน', 'รับผิดชอบเต็มจำนวน'],
  },
  {
    rule: 'ห้ามให้เลขบัญชีหรือพร้อมเพย์ที่ไม่ใช่ของร้านที่ตั้งไว้',
    denyPhrases: ['เลขบัญชี', 'พร้อมเพย์', 'โอนมาที่'],
  },
  {
    rule: 'ห้ามวิจารณ์หรือเปรียบเทียบกับร้านและแบรนด์คู่แข่ง',
    denyPhrases: [],
  },
  {
    rule: 'ห้ามตอบประเด็นการเมือง ศาสนา หรือเนื้อหาละเอียดอ่อนที่ไม่เกี่ยวกับสินค้า',
    denyPhrases: [],
  },
]
