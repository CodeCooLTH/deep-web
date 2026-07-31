// feature 00023 Chat Auto-Reply — S-04 Matcher / Resolver (SRS TFR-008..TFR-012)
//
// [ข้อบังคับสูงสุด] ฟังก์ชันในไฟล์นี้ต้อง "บริสุทธิ์" (pure) เด็ดขาด:
//   - ห้ามเขียน DB, ห้าม import Prisma, ห้ามส่งข้อความ, ห้ามอ่าน session, ห้าม `new Date()`
//     (เวลาปัจจุบันต้องรับผ่าน `ctx.now` เท่านั้น — dry-run ของหน้าทดสอบกฎ FR-020 ต้องได้ผล
//     เหมือนเส้นทางจริงทุกประการ AC-020-05 — ถ้ามี side effect หรือเวลาที่ไม่ถูกควบคุมเมื่อไหร่
//     หน้าทดสอบจะสร้างผลข้างเคียงจริงทันทีหรือผลไม่ตรงกับที่จะเกิดจริง)
//   - ผู้เรียก (auto-reply.service / route simulate — ยังไม่ถูกสร้างในเฟสนี้) เป็นคนโหลด `ruleSet`
//     จาก `auto-reply-cache`/DB แล้วส่งเข้ามาเป็น argument เท่านั้น
//
// ขอบเขต (Scope Baseline S-04 / T-04):
//   - matchKeywords()  — TFR-008 (จับคู่ 3 matchType) + TFR-009 (tie-break 5 เกณฑ์ + matchTrace)
//   - resolveRule()    — TFR-010 (เลือกกฎ + ถอยระดับ 9 ขั้น ตาม AC-009-01)
//   - ไม่ทำ: fuzzy match (เฟส 2), เดาสินค้าจากข้อความลูกค้า (AC-014-04 — ctx.productId ต้องมาจาก
//     ที่อื่นเสมอ ไฟล์นี้แค่ "ใช้" ค่าที่ได้รับมา ไม่คำนวณ/เดาเอง), บริบทโฆษณา/สินค้า (TFR-011/012
//     คำนวณที่อื่นแล้วส่ง ctx สำเร็จรูปเข้ามา)
//
// [ข้อยุติยังไม่มี — ต้องรายงาน Controller] ไม่ใช่การตัดสินใจเงียบ ๆ ของ dev:
//   TestCase.md บรรทัด 161/488-493 (R-MIXED, AC-008-04) ตั้งสถานการณ์ "โฆษณา+สินค้า ไม่ระบุเพจ"
//   ให้ specificity=3 และคาดหวังว่ากฎนี้ "ถูกเลือกใช้ได้จริง" (TC-RES-18) — แต่ SRS TFR-010 ขั้นที่ 6
//   (ตาราง mapping) ระบุไว้ชัดว่า specificity 2/3 เมื่อมี keywordId "เกิดไม่ได้ — invariant TFR-004"
//   และ `getResolutionLevel()` (S-02, `src/lib/auto-reply-constants.ts`) ก็ `throw` ตามนั้นจริง
//   (มี unit test ของ S-02 ยืนยันพฤติกรรม throw ไว้แล้ว) — สองเอกสารขัดกันเอง (TestCase.md ขัดกับ
//   SRS+โค้ดที่ freeze แล้ว) ไฟล์นี้จึง **เลือกทำตาม SRS/S-02 ที่ freeze แล้ว**: กฎที่ specificity
//   ตกอยู่ในช่วงที่ไม่มีชื่อระดับ FROZEN รองรับ (2 หรือ 3 เมื่อมี keywordId) จะถูกข้ามอย่างปลอดภัย
//   (`console.warn` + นับเป็นการถอยระดับ) แทนการปล่อยให้ throw ทะลุออกไปหา caller — **ไม่คืนกฎนั้น
//   เป็นผู้ชนะเด็ดขาด** ผลคือ TC-RES-18 ตามตัวอักษรจะไม่ผ่านด้วยพฤติกรรมนี้ — ต้องให้ Controller
//   ตัดสินว่าจะแก้ TestCase.md/BRD AC-008-04 (แนะนำ) หรือแก้ invariant ที่ freeze ไปแล้ว

import {
  computeSpecificity,
  getResolutionLevel,
  type MatchType,
  type ResolutionLevel,
} from '@/lib/auto-reply-constants'

// ---------------------------------------------------------------------------
// ชนิดข้อมูลนำเข้า — ruleSet ที่ caller โหลดมาให้แล้ว (คิวรีเดียว, กรอง shopId/isActive มาแล้ว
// สำหรับ keyword ตาม TFR-008; ส่วน rule ไฟล์นี้กรอง isActive/schedule เองอีกชั้นเพราะ
// TC-RES-17 ทดสอบพฤติกรรมนี้ที่ระดับ unit ของฟังก์ชันบริสุทธิ์โดยตรง ไม่ได้พึ่ง query filter)
// ---------------------------------------------------------------------------

export interface RuleSetPhrase {
  id: string
  /** คำที่ร้านพิมพ์ไว้ตอนตั้งค่า (raw) — ใช้แสดงผลใน matchTrace/log */
  phrase: string
  /** ผ่าน normalizeMessage() มาแล้วตอนบันทึก (SRS §6, S-02) */
  normalizedPhrase: string
}

export interface RuleSetKeyword {
  id: string
  name: string
  matchType: MatchType
  priority: number
  /** 'TEST' | 'LIVE' — matcher ไม่ใช้ตัดสิน แต่ผู้เรียกใช้ต่อที่ gate หลัง match
   *  (เก็บไว้ที่นี่เพราะ ruleSet คือชุดข้อมูลเดียวที่ processor ถืออยู่ตอนนั้น) */
  status?: string
  /** เธรดที่กลุ่มนี้ใช้ทดสอบ — มีผลเฉพาะตอน status='TEST' (user 2026-07-29) */
  testConversationIds?: string[]
  /** [ข้อสมมติ] เฉพาะกลุ่มที่ไม่ใช่ OFFLINE เท่านั้น — caller กรองมาด้วย query
   *  ตาม index `[shopId, status, priority]` (TFR-008) ไม่ใช่หน้าที่ของ matcher */
  phrases: RuleSetPhrase[]
}

export interface RuleSetRule {
  id: string
  keywordId: string | null
  shopChannelId: string | null
  adId: string | null
  productId: string | null
  specificity: number
  isActive: boolean
  activeFrom: Date | null
  activeUntil: Date | null
  replyText: string
  createdAt: Date
}

/** ชุดกฎของร้านที่โหลดมาทั้งหมด (เฉพาะร้านเดียว — caller ต้องกรอง shopId ที่ query แล้ว) */
export interface RuleSet {
  keywords: RuleSetKeyword[]
  rules: RuleSetRule[]
}

/** บริบทจริงของเธรด ณ เวลาตัดสิน (TFR-010 ขั้นที่ 1) — คำนวณจากที่อื่น (TFR-011/012) แล้วส่งเข้ามา */
export interface MatchContext {
  shopChannelId: string | null
  adId: string | null
  productId: string | null
  /** เวลาปัจจุบัน — ต้องรับจาก caller เสมอ ห้ามเรียก `new Date()` ในไฟล์นี้ (เพื่อให้ dry-run
   *  กำหนดผลลัพธ์ล่วงหน้าได้และ resolver ยังคง pure) */
  now: Date
}

// ---------------------------------------------------------------------------
// matchKeywords — TFR-008 (จับคู่) + TFR-009 (tie-break 5 เกณฑ์ + matchTrace)
// ---------------------------------------------------------------------------

export type TieBreakCriterion = 'PRIORITY' | 'RULE_SPECIFICITY' | 'MATCH_TYPE' | 'PHRASE_LENGTH' | 'KEYWORD_ID'

export interface MatchCandidateInfo {
  keywordId: string
  keywordName: string
  priority: number
  matchType: MatchType
  /** phrase ดิบ (ก่อน normalize) ของตัวแทนกลุ่ม — normalizedPhrase.length มากสุดชนะ (TFR-008) */
  matchedPhrase: string
  matchedPhraseNormalized: string
  matchedLength: number
  /** specificity ของกฎที่ดีที่สุดของกลุ่มนี้ที่ "ใช้ได้จริง" กับ ctx ปัจจุบัน, -1 ถ้าไม่มีกฎใดใช้ได้ (TFR-009 ข้อ 1) */
  bestSpecificity: number
}

export interface MatchLoserInfo extends MatchCandidateInfo {
  /** เกณฑ์แรกที่ทำให้กลุ่มนี้แพ้ผู้ชนะ (TFR-009 ข้อ 4) */
  lostAt: TieBreakCriterion
}

export interface MatchTrace {
  winner: MatchCandidateInfo | null
  /** เกณฑ์ที่ทำให้ผู้ชนะแยกตัวออกจากอันดับ 2 — null เมื่อไม่มีคู่แข่งเลย (ผู้ชนะรายเดียว) */
  criterion: TieBreakCriterion | null
  losers: MatchLoserInfo[]
  /** true เมื่อ losers ถูกตัดเหลือ 20 รายการ (TFR-009 ข้อ 2) */
  truncated?: boolean
}

export interface MatchResult {
  winner: MatchCandidateInfo | null
  matchTrace: MatchTrace
}

/** จำกัดจำนวน loser ที่บันทึกใน matchTrace กัน JSON บวมเมื่อร้านมีกลุ่มคำมาก (TFR-009 ข้อ 2) */
const MAX_TRACE_LOSERS = 20

/** อันดับของ matchType สำหรับเกณฑ์ที่ 3 — EXACT ตรงทั้งข้อความก่อนมีคำในประโยค (TFR-009) */
const MATCH_TYPE_RANK: Record<MatchType, number> = {
  EXACT: 3,
  STARTS_WITH: 2,
  CONTAINS: 1,
}

function testMatch(matchType: MatchType, normalizedText: string, normalizedPhrase: string): boolean {
  switch (matchType) {
    case 'EXACT':
      return normalizedText === normalizedPhrase
    case 'STARTS_WITH':
      return normalizedText.startsWith(normalizedPhrase)
    case 'CONTAINS':
      return normalizedText.includes(normalizedPhrase)
  }
}

/** เทียบ candidate 2 ตัวตามลำดับเกณฑ์ทั้ง 5 ของ TFR-009 — คืนเกณฑ์แรกที่ต่างกัน หรือ null ถ้าเท่ากันหมด
 *  (เกิดไม่ได้จริงเพราะ keywordId เป็น unique key แต่กันไว้เพื่อความปลอดภัยของ type) */
function firstDifferingCriterion(
  a: Pick<MatchCandidateInfo, 'priority' | 'bestSpecificity' | 'matchType' | 'matchedLength' | 'keywordId'>,
  b: Pick<MatchCandidateInfo, 'priority' | 'bestSpecificity' | 'matchType' | 'matchedLength' | 'keywordId'>
): TieBreakCriterion | null {
  if (a.priority !== b.priority) return 'PRIORITY'
  if (a.bestSpecificity !== b.bestSpecificity) return 'RULE_SPECIFICITY'
  if (MATCH_TYPE_RANK[a.matchType] !== MATCH_TYPE_RANK[b.matchType]) return 'MATCH_TYPE'
  if (a.matchedLength !== b.matchedLength) return 'PHRASE_LENGTH'
  if (a.keywordId !== b.keywordId) return 'KEYWORD_ID'
  return null
}

/** เปรียบเทียบ candidate สำหรับ sort (ผู้ชนะอยู่ index 0) — ทิศทางตรงกับ 5 เกณฑ์ของ TFR-009 */
function compareCandidates(a: MatchCandidateInfo, b: MatchCandidateInfo): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  if (a.bestSpecificity !== b.bestSpecificity) return b.bestSpecificity - a.bestSpecificity
  const rankDiff = MATCH_TYPE_RANK[b.matchType] - MATCH_TYPE_RANK[a.matchType]
  if (rankDiff !== 0) return rankDiff
  if (a.matchedLength !== b.matchedLength) return b.matchedLength - a.matchedLength
  // เกณฑ์สุดท้าย — keyword.id น้อยไปมาก (string compare, deterministic เสมอเพราะ id unique)
  if (a.keywordId < b.keywordId) return -1
  if (a.keywordId > b.keywordId) return 1
  return 0
}

/** เรียงกฎของกลุ่มคำเดียวกัน (หรือกฎกลาง) ตาม TD-010: specificity DESC, createdAt ASC, id ASC */
function compareRules(a: RuleSetRule, b: RuleSetRule): number {
  if (a.specificity !== b.specificity) return b.specificity - a.specificity
  const at = a.createdAt.getTime()
  const bt = b.createdAt.getTime()
  if (at !== bt) return at - bt
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

type ApplicableReason =
  | 'INACTIVE'
  | 'PAGE_MISMATCH'
  | 'AD_MISMATCH'
  | 'PRODUCT_MISMATCH'
  | 'SCHEDULE'
  | 'EMPTY_TEXT'
  | 'STALE_SPECIFICITY'

type ApplicableCheck = { ok: true } | { ok: false; reason: ApplicableReason }

/** TFR-010 ขั้นที่ 3 — เงื่อนไข a-g ครบ (+ isActive เป็นชั้นป้องกันเสริมก่อนหน้า a-g เดิม) */
function isRuleApplicable(rule: RuleSetRule, ctx: MatchContext): ApplicableCheck {
  if (!rule.isActive) return { ok: false, reason: 'INACTIVE' }
  if (rule.shopChannelId != null && rule.shopChannelId !== ctx.shopChannelId) {
    return { ok: false, reason: 'PAGE_MISMATCH' }
  }
  if (rule.adId != null && rule.adId !== ctx.adId) {
    return { ok: false, reason: 'AD_MISMATCH' }
  }
  if (rule.productId != null && rule.productId !== ctx.productId) {
    return { ok: false, reason: 'PRODUCT_MISMATCH' }
  }
  if (rule.activeFrom != null && rule.activeFrom > ctx.now) {
    return { ok: false, reason: 'SCHEDULE' }
  }
  if (rule.activeUntil != null && rule.activeUntil <= ctx.now) {
    return { ok: false, reason: 'SCHEDULE' }
  }
  if (rule.replyText.trim().length === 0) {
    return { ok: false, reason: 'EMPTY_TEXT' }
  }
  const expectedSpecificity = computeSpecificity({
    shopChannelId: rule.shopChannelId,
    adId: rule.adId,
    productId: rule.productId,
  })
  if (expectedSpecificity !== rule.specificity) {
    // เพจ/สินค้าถูกถอด-ลบไปแล้ว (SetNull) แต่คอลัมน์ specificity ยังค้างค่าเดิม (TFR-004 edge case,
    // AC-006-05 / AC-008-03) — ไม่ throw ไม่ลบทิ้ง แค่ไม่เลือกใช้กฎที่ข้อมูลไม่สอดคล้องกันแล้ว
    console.warn(
      `auto-reply-match: rule ${rule.id} specificity=${rule.specificity} ไม่ตรงกับที่คำนวณได้จริง ` +
        `(${expectedSpecificity}) — คอลัมน์เงื่อนไขถูก SetNull ไปแล้วแต่ specificity ค้าง (TFR-010 ข้อ g) ข้าม`
    )
    return { ok: false, reason: 'STALE_SPECIFICITY' }
  }
  return { ok: true }
}

/** หา specificity ของกฎที่ดีที่สุดของกลุ่มคำที่ "ใช้ได้จริง" กับ ctx — ใช้เป็นเกณฑ์ที่ 2 ของ TFR-009
 *  (เรียก isRuleApplicable ตัวเดียวกับ resolveRule — ไม่มี logic คู่ขนาน) */
function computeBestSpecificity(keywordId: string, ruleSet: RuleSet, ctx: MatchContext): number {
  const rules = ruleSet.rules.filter(r => r.keywordId === keywordId).sort(compareRules)
  for (const rule of rules) {
    if (isRuleApplicable(rule, ctx).ok) return rule.specificity
  }
  return -1
}

/**
 * matchKeywords — TFR-008 (จับคู่ 3 matchType ต่อกลุ่มคำ) + TFR-009 (ตัดสินผู้ชนะเมื่อตรงหลายกลุ่ม)
 *
 * [หมายเหตุสำคัญ] รับ `ctx` เพิ่มจากที่ระบุใน task สั้น ๆ ว่า `matchKeywords(normalizedText, ruleSet)`
 * เพราะ TFR-009 เกณฑ์ที่ 2 (`RULE_SPECIFICITY`) ต้องคำนวณ `bestSpecificity` ของแต่ละกลุ่มด้วย
 * `isRuleApplicable(ctx)` จริง (SRS ระบุไว้ชัดในขั้นตอนที่ 1 ของ TFR-009) — ถ้าไม่รับ ctx จะไม่มีทาง
 * คำนวณเกณฑ์นี้ได้เลย ยังคงเป็นฟังก์ชันบริสุทธิ์เหมือนเดิม (รับทุกอย่างเป็น argument ไม่มี I/O)
 *
 * @param normalizedText ข้อความลูกค้าที่ผ่าน `normalizeMessage()` มาแล้ว (S-02) — ไฟล์นี้ไม่ normalize เอง
 * @param ruleSet ชุดกลุ่มคำ+กฎของร้าน (เฉพาะกลุ่มที่ `isActive=true` — caller กรองมาแล้ว)
 * @param ctx บริบทจริงของเธรด ณ เวลาตัดสิน
 */
export function matchKeywords(normalizedText: string, ruleSet: RuleSet, ctx: MatchContext): MatchResult {
  const empty: MatchResult = { winner: null, matchTrace: { winner: null, criterion: null, losers: [] } }

  // ข้อความว่างหลัง normalize (เช่น "!!!" ทั้งประโยค) ต้องไม่ match ทุกกลุ่ม (สตริงว่างเป็น
  // substring ของทุกสตริง — บั๊กที่เกิดง่ายที่สุดของขั้นนี้ TFR-007 เคส #15 / TFR-008)
  if (normalizedText === '') return empty

  const candidates: MatchCandidateInfo[] = []

  for (const keyword of ruleSet.keywords) {
    let bestPhrase: RuleSetPhrase | null = null

    for (const phrase of keyword.phrases) {
      if (phrase.normalizedPhrase === '') continue // ป้องกันเชิงลึกซ้อนกับ TFR-003 (ห้ามบันทึก phrase ว่างอยู่แล้ว)
      if (!testMatch(keyword.matchType, normalizedText, phrase.normalizedPhrase)) continue

      // ตัวแทนของกลุ่ม = phrase ที่ normalizedPhrase.length มากที่สุด, เท่ากันใช้ id น้อยกว่า (TFR-008)
      if (
        bestPhrase === null ||
        phrase.normalizedPhrase.length > bestPhrase.normalizedPhrase.length ||
        (phrase.normalizedPhrase.length === bestPhrase.normalizedPhrase.length && phrase.id < bestPhrase.id)
      ) {
        bestPhrase = phrase
      }
    }

    if (bestPhrase == null) continue

    candidates.push({
      keywordId: keyword.id,
      keywordName: keyword.name,
      priority: keyword.priority,
      matchType: keyword.matchType,
      matchedPhrase: bestPhrase.phrase,
      matchedPhraseNormalized: bestPhrase.normalizedPhrase,
      matchedLength: bestPhrase.normalizedPhrase.length,
      bestSpecificity: computeBestSpecificity(keyword.id, ruleSet, ctx),
    })
  }

  // ไม่มีกลุ่มคำใด match เลย — ไปต่อที่การถอยระดับกฎกลางใน resolveRule (BR-AR-06) ไม่ใช่จบทันที
  if (candidates.length === 0) return empty

  candidates.sort(compareCandidates)

  const winner = candidates[0]
  const runnersUp = candidates.slice(1)

  const criterion = runnersUp.length > 0 ? firstDifferingCriterion(winner, runnersUp[0]) : null

  const losers: MatchLoserInfo[] = runnersUp.slice(0, MAX_TRACE_LOSERS).map(candidate => ({
    ...candidate,
    lostAt: firstDifferingCriterion(winner, candidate) ?? 'KEYWORD_ID',
  }))

  const matchTrace: MatchTrace = {
    winner,
    criterion,
    losers,
    ...(runnersUp.length > MAX_TRACE_LOSERS ? { truncated: true } : {}),
  }

  return { winner, matchTrace }
}

// ---------------------------------------------------------------------------
// resolveRule — TFR-010 (เลือกกฎ + ถอยระดับ 9 ขั้น)
// ---------------------------------------------------------------------------

export type FallbackReason = ApplicableReason

export interface FallbackTraceEntry {
  /** null เมื่อ specificity ของกฎอยู่นอกลิสต์ FROZEN (2/3 พร้อม keywordId — ดูหมายเหตุบนหัวไฟล์) */
  resolutionLevel: ResolutionLevel | null
  reason: FallbackReason
}

export interface ResolveResult {
  rule: RuleSetRule | null
  resolutionLevel: ResolutionLevel
  /** ร่องรอยการถอยระดับ (TFR-010 ขั้นที่ 7) — กฎที่ "มีอยู่แต่ไม่ผ่าน" พร้อมเหตุผล ผู้เรียกนำไปรวม
   *  เข้ากับ `matchTrace` ของ `matchKeywords` ก่อนเขียน `AutoReplyLog.matchTrace` ทั้งก้อน */
  fallbackFrom: FallbackTraceEntry[]
}

/** ห่อ `getResolutionLevel` กัน throw ทะลุออกจากฟังก์ชันบริสุทธิ์ — คืน `null` แทนเมื่อ specificity
 *  อยู่นอก invariant ที่ freeze ไว้แล้ว (ดูหมายเหตุบนหัวไฟล์เรื่อง R-MIXED/TC-RES-18) */
function safeResolutionLevel(specificity: number, hasKeywordId: boolean): ResolutionLevel | null {
  try {
    return getResolutionLevel(specificity, hasKeywordId)
  } catch {
    return null
  }
}

/** พยายามหากฎที่ใช้ได้ตัวแรกจากรายการที่เรียงมาแล้ว (specificity DESC, createdAt ASC, id ASC)
 *  คืนกฎที่ชนะ (พร้อม resolutionLevel) หรือ `null` แล้วสะสม fallbackFrom ระหว่างทาง */
function tryResolveFromRules(
  rules: RuleSetRule[],
  ctx: MatchContext,
  hasKeywordId: boolean,
  fallbackFrom: FallbackTraceEntry[]
): { rule: RuleSetRule; resolutionLevel: ResolutionLevel } | null {
  for (const rule of rules) {
    const applicable = isRuleApplicable(rule, ctx)
    if (!applicable.ok) {
      fallbackFrom.push({ resolutionLevel: safeResolutionLevel(rule.specificity, hasKeywordId), reason: applicable.reason })
      continue
    }

    const level = safeResolutionLevel(rule.specificity, hasKeywordId)
    if (level == null) {
      // specificity 2/3 พร้อม keywordId — invariant TFR-004 บอกว่า "เกิดไม่ได้" (ดูหมายเหตุบนหัวไฟล์)
      // ไม่เลือกกฎนี้เป็นผู้ชนะ ถือเป็นข้อมูลไม่สอดคล้องกัน ถอยไปกฎถัดไปแทนการ throw
      console.warn(
        `auto-reply-match: rule ${rule.id} specificity=${rule.specificity} ผ่าน isRuleApplicable ` +
          `แต่ไม่มี resolutionLevel ที่ FROZEN รองรับ (invariant TFR-004) — ข้าม ไม่ throw`
      )
      fallbackFrom.push({ resolutionLevel: null, reason: 'STALE_SPECIFICITY' })
      continue
    }

    return { rule, resolutionLevel: level }
  }
  return null
}

/**
 * resolveRule — TFR-010: เลือก `AutoReplyRule` ที่จะใช้ตอบจากกลุ่มคำที่ชนะ (ถ้ามี) + บริบทของเธรด
 * แล้วถอยระดับตามลำดับ 9 ขั้นของ AC-009-01 จนกว่าจะเจอกฎที่ใช้ได้จริง หรือหมดระดับ (`NONE`)
 *
 * @param keywordId id ของกลุ่มคำที่ชนะจาก `matchKeywords` — `null` เมื่อไม่มีกลุ่มคำใด match เลย
 *   (ข้ามไปกฎกลางระดับเพจ/ร้านทันที ตาม BR-AR-06 "ไม่มีกลุ่มคำใดตรง ≠ จบทันที")
 * @param ctx บริบทจริงของเธรด ณ เวลาตัดสิน
 * @param ruleSet ชุดกฎของร้าน (เดียวกับที่ส่งให้ `matchKeywords`)
 */
export function resolveRule(keywordId: string | null, ctx: MatchContext, ruleSet: RuleSet): ResolveResult {
  const fallbackFrom: FallbackTraceEntry[] = []

  if (keywordId != null) {
    const keywordRules = ruleSet.rules.filter(r => r.keywordId === keywordId).sort(compareRules)
    const resolved = tryResolveFromRules(keywordRules, ctx, true, fallbackFrom)
    if (resolved) return { ...resolved, fallbackFrom }
  }

  // ขั้นที่ 5 — ไม่มีกฎของกลุ่มคำใดผ่านเลย (หรือไม่มีกลุ่มคำใด match ตั้งแต่ต้น) → กฎกลาง (keywordId=null)
  const centralRules = ruleSet.rules.filter(r => r.keywordId === null).sort(compareRules)
  const resolvedCentral = tryResolveFromRules(centralRules, ctx, false, fallbackFrom)
  if (resolvedCentral) return { ...resolvedCentral, fallbackFrom }

  // ขั้นที่ 9 — ไม่เหลือระดับใดให้ถอย (AC-009-04, BR-AR-08) — caller ต้องเข้าสู่ handoff ไม่เดาคำตอบ
  return { rule: null, resolutionLevel: 'NONE', fallbackFrom }
}
