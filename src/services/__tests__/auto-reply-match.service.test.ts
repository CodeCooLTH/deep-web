/**
 * auto-reply-match.service.test.ts — unit tests ของ matcher/resolver (feature 00023, S-04)
 *
 * ครอบ TestCase.md กลุ่ม B (การจับคู่ 3 รูปแบบ), กลุ่ม C (tie-break เมื่อตรงหลายกลุ่ม),
 * กลุ่ม D (การเลือกกฎ + ถอยระดับ 9 ขั้น) — เฉพาะเคสที่ประเภทเป็น [Unit] (ล้วนไม่มี DB)
 * เคสที่มี [Integration]/[E2E] ในเอกสาร (เช่น TC-MATCH-06 ส่วน SQL, TC-TIE-07/08 ผ่าน pipeline
 * จริง, TC-RES-12/13/20 ที่ต้องลบแถวจริงใน DB) ทำ **เฉพาะส่วนพฤติกรรมของฟังก์ชันบริสุทธิ์**
 * ที่ตรวจได้โดยไม่มี DB — ส่วนที่เหลือเป็นขอบเขตของ S-06 (runner) / S-15 (QA integration)
 *
 * [หมายเหตุสำคัญ — ไม่ใช่การตัดสินใจเงียบ ๆ] TC-RES-18 (R-MIXED, specificity=3, AC-008-04)
 * ในเอกสารคาดหวังว่ากฎนี้ "ถูกเลือกใช้ได้จริง" แต่ SRS TFR-010 ขั้นที่ 6 + unit test ของ S-02
 * (`src/lib/__tests__/auto-reply-constants.test.ts`) ยืนยันว่า specificity 2/3 พร้อม keywordId
 * "เกิดไม่ได้ตาม invariant TFR-004" และ `getResolutionLevel()` throw ตามนั้นจริง — สองเอกสารขัดกัน
 * เอง ไฟล์นี้จึงเทสพฤติกรรม "ปลอดภัย" ตามที่ auto-reply-match.service.ts เลือกทำ (ข้ามกฎนั้นแทน
 * การเลือกใช้/แทนการ throw) ดู TC-RES-18 ด้านล่างที่ระบุพฤติกรรมจริงไว้ชัดเจน — ต้องรอ Controller
 * ตัดสินว่าจะแก้ TestCase.md/BRD AC-008-04 หรือแก้ invariant ที่ freeze ไปแล้ว
 */

import { describe, it, expect } from 'vitest'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import {
  matchKeywords,
  resolveRule,
  type RuleSet,
  type RuleSetKeyword,
  type RuleSetPhrase,
  type RuleSetRule,
  type MatchContext,
} from '@/services/auto-reply-match.service'

// ---------------------------------------------------------------------------
// Fixture helpers — mirror ของ TestCase.md §2.5/§2.6
// ---------------------------------------------------------------------------

function ph(id: string, raw: string): RuleSetPhrase {
  return { id, phrase: raw, normalizedPhrase: normalizeMessage(raw) }
}

function ctx(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    shopChannelId: null,
    adId: null,
    productId: null,
    now: new Date('2026-07-29T10:00:00Z'),
    ...overrides,
  }
}

// id ของเพจ/โฆษณา/สินค้า — ตาม TestCase.md §2.2-2.4
const PAGE_1 = 'page-1'
const PAGE_2 = 'page-2'
const PAGE_3 = 'page-3'
const AD_1001 = 'ad_1001'
const AD_1002 = 'ad_1002'
const AD_9999 = 'ad_9999'
const PROD_1 = 'prod-1'
const PROD_2 = 'prod-2'

let ruleSeq = 0
/** สร้าง createdAt ที่เพิ่มขึ้นเรื่อย ๆ ตามลำดับที่เรียก — ใช้กับ tie-break `createdAt ASC` (TD-010) */
function nextCreatedAt(): Date {
  ruleSeq += 1
  return new Date(2026, 0, 1, 0, 0, ruleSeq)
}

function rule(overrides: Partial<RuleSetRule> & { id: string; specificity: number; replyText?: string }): RuleSetRule {
  return {
    keywordId: null,
    shopChannelId: null,
    adId: null,
    productId: null,
    isActive: true,
    activeFrom: null,
    activeUntil: null,
    replyText: `[${overrides.id}] คำตอบ`,
    createdAt: nextCreatedAt(),
    ...overrides,
  }
}

// กลุ่มคำหลักที่ใช้ซ้ำหลายเคส (KW-INTEREST) — CONTAINS "สนใจ"
const KW_INTEREST_ID = 'kw-interest'
function kwInterest(): RuleSetKeyword {
  return {
    id: KW_INTEREST_ID,
    name: 'สนใจสินค้า',
    matchType: 'CONTAINS',
    priority: 100,
    phrases: [ph('ph-interest-1', 'สนใจ'), ph('ph-interest-2', 'ขอรายละเอียด'), ph('ph-interest-3', 'อยากสั่ง')],
  }
}

const KW_PRICE_ID = 'kw-price'
function kwPrice(): RuleSetKeyword {
  return {
    id: KW_PRICE_ID,
    name: 'ถามราคา',
    matchType: 'CONTAINS',
    priority: 120,
    phrases: [ph('ph-price-1', 'ราคา'), ph('ph-price-2', 'เท่าไหร่'), ph('ph-price-3', 'กี่บาท')],
  }
}

/** ชุดกฎเต็มของ KW-INTEREST ตามตาราง §2.6 (R-7..R-0, R-MIXED) — ใช้กับกลุ่ม D ส่วนใหญ่ */
function interestRules(): RuleSetRule[] {
  return [
    rule({ id: 'R-7', keywordId: KW_INTEREST_ID, shopChannelId: PAGE_1, adId: AD_1001, productId: PROD_1, specificity: 7 }),
    rule({ id: 'R-6', keywordId: KW_INTEREST_ID, shopChannelId: PAGE_1, adId: AD_1002, specificity: 6 }),
    rule({ id: 'R-5', keywordId: KW_INTEREST_ID, shopChannelId: PAGE_1, productId: PROD_2, specificity: 5 }),
    rule({ id: 'R-4', keywordId: KW_INTEREST_ID, shopChannelId: PAGE_1, specificity: 4 }),
    // R-MIXED specificity=3 (ad+product ไม่ระบุเพจ) — ดูหมายเหตุบนหัวไฟล์เรื่อง TC-RES-18
    rule({ id: 'R-MIXED', keywordId: KW_INTEREST_ID, adId: AD_1002, productId: PROD_2, specificity: 3 }),
    rule({ id: 'R-1', keywordId: KW_INTEREST_ID, productId: PROD_1, specificity: 1 }),
    rule({ id: 'R-0', keywordId: KW_INTEREST_ID, specificity: 0 }),
  ]
}

function centralRules(): RuleSetRule[] {
  return [
    rule({ id: 'R-PAGE-DEF', keywordId: null, shopChannelId: PAGE_1, specificity: 4 }),
    rule({ id: 'R-SHOP-DEF', keywordId: null, specificity: 0 }),
  ]
}

function defaultRuleSet(): RuleSet {
  return {
    keywords: [kwInterest()],
    rules: [...interestRules(), ...centralRules()],
  }
}

function norm(text: string): string {
  return normalizeMessage(text)
}

// ===========================================================================
// กลุ่ม B — [Unit] การจับคู่ 3 รูปแบบ
// ===========================================================================

describe('matchKeywords — กลุ่ม B การจับคู่ 3 รูปแบบ', () => {
  it('TC-MATCH-01: EXACT ตรงทั้งข้อความเท่านั้น', () => {
    const kwCodExact: RuleSetKeyword = {
      id: 'kw-cod-exact',
      name: 'เก็บปลายทาง (เป๊ะ)',
      matchType: 'EXACT',
      priority: 100,
      phrases: [ph('ph-cod-1', 'เก็บปลายทาง')],
    }
    const ruleSet: RuleSet = { keywords: [kwCodExact], rules: [] }

    for (const text of ['เก็บปลายทาง', 'เก็บปลายทาง!', ' เก็บปลายทาง ']) {
      const result = matchKeywords(norm(text), ruleSet, ctx())
      expect(result.winner?.keywordId, `expect match: "${text}"`).toBe('kw-cod-exact')
    }
    for (const text of ['มีเก็บปลายทางไหม', 'เก็บปลายทางไหม']) {
      const result = matchKeywords(norm(text), ruleSet, ctx())
      expect(result.winner, `expect no match: "${text}"`).toBeNull()
    }
  })

  it('TC-MATCH-02: CONTAINS มีคำอยู่ที่ตำแหน่งใดก็ได้ (ไม่ทำ fuzzy)', () => {
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [] }
    for (const text of ['สนใจ', 'ผมสนใจครับ', 'อยากทราบราคา สนใจมากเลย']) {
      expect(matchKeywords(norm(text), ruleSet, ctx()).winner?.keywordId).toBe(KW_INTEREST_ID)
    }
    // "สน ใจ" มีช่องว่างคั่น — ไม่ contains "สนใจ" ต่อเนื่อง (ไม่ทำ fuzzy — เฟส 2)
    expect(matchKeywords(norm('สน ใจ'), ruleSet, ctx()).winner).toBeNull()
  })

  it('TC-MATCH-03: STARTS_WITH ขึ้นต้นเท่านั้น', () => {
    const kwStart: RuleSetKeyword = {
      id: 'kw-start',
      name: 'ขึ้นต้นด้วยสวัสดี',
      matchType: 'STARTS_WITH',
      priority: 100,
      phrases: [ph('ph-start-1', 'สวัสดี')],
    }
    const ruleSet: RuleSet = { keywords: [kwStart], rules: [] }
    for (const text of ['สวัสดีครับ', '  สวัสดีค่ะ']) {
      expect(matchKeywords(norm(text), ruleSet, ctx()).winner?.keywordId, text).toBe('kw-start')
    }
    for (const text of ['ครับสวัสดี', 'ขอถามหน่อย สวัสดีครับ']) {
      expect(matchKeywords(norm(text), ruleSet, ctx()).winner, text).toBeNull()
    }
  })

  it('TC-MATCH-04: EXACT เทียบกับผลหลัง normalize ไม่ใช่ raw', () => {
    const kwCodExact: RuleSetKeyword = {
      id: 'kw-cod-exact',
      name: 'เก็บปลายทาง (เป๊ะ)',
      matchType: 'EXACT',
      priority: 100,
      phrases: [ph('ph-cod-1', 'เก็บปลายทาง')],
    }
    const ruleSet: RuleSet = { keywords: [kwCodExact], rules: [] }
    expect(matchKeywords(norm('เก็บปลายทาง???'), ruleSet, ctx()).winner?.keywordId).toBe('kw-cod-exact')
    // normalize ยุบช่องว่างเหลือ "เก็บ ปลายทาง" (มีช่องว่าง) ซึ่งไม่เท่ากับ "เก็บปลายทาง"
    expect(matchKeywords(norm('เก็บ  ปลายทาง'), ruleSet, ctx()).winner).toBeNull()
  })

  it('TC-MATCH-05: กลุ่มที่ปิดใช้งานต้องไม่ถูกนำมาเทียบเลย (caller กรอง isActive มาแล้วตาม TFR-008)', () => {
    // KW-OFF (isActive=false, priority=999) ไม่ถูกส่งเข้า ruleSet เลย — จำลองว่า query
    // `[shopId, isActive, priority]` กรองออกไปแล้วก่อนถึง matcher (ไม่ใช่กรองใน JS ของไฟล์นี้)
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [] }
    const result = matchKeywords(norm('สนใจ'), ruleSet, ctx())
    expect(result.winner?.keywordId).toBe(KW_INTEREST_ID)
    expect(result.matchTrace.losers.some(l => l.keywordId === 'kw-off')).toBe(false)
  })

  it('TC-MATCH-06: matcher ไม่มี bias ในตัว — เห็นเฉพาะสิ่งที่ ruleSet ส่งมา (ส่วน SQL/DB เป็น scope ของ integration test)', () => {
    // การพิสูจน์ "shopId อยู่ใน WHERE ทุก query" เป็นเรื่องของ caller/DB (out of scope ของฟังก์ชันบริสุทธิ์)
    // ที่ตรวจได้ตรงนี้คือ: ถ้า ruleSet มีแค่กลุ่มคำของร้านเดียว ผลลัพธ์ต้องมาจากร้านนั้นเท่านั้น
    const shopAOnly: RuleSet = { keywords: [kwInterest()], rules: [] }
    const result = matchKeywords(norm('สนใจ'), shopAOnly, ctx())
    expect(result.winner?.keywordId).toBe(KW_INTEREST_ID)
  })

  it("ข้อความว่างหลัง normalize (เช่น '!!!') ต้องไม่ match ทุกกลุ่ม (TFR-007 เคส #15 / TFR-008)", () => {
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [] }
    expect(matchKeywords(norm('!!!'), ruleSet, ctx()).winner).toBeNull()
  })
})

// ===========================================================================
// กลุ่ม C — [Unit] การตัดสินเมื่อตรงหลายกลุ่ม (BR-AR-04)
// ===========================================================================

describe('matchKeywords — กลุ่ม C tie-break', () => {
  it('TC-TIE-01: เกณฑ์ที่ 1 — priority สูงกว่าชนะ', () => {
    const ruleSet: RuleSet = { keywords: [kwInterest(), kwPrice()], rules: [] }
    const result = matchKeywords(norm('สนใจ ราคาเท่าไหร่'), ruleSet, ctx())
    expect(result.winner?.keywordId).toBe(KW_PRICE_ID)
    expect(result.matchTrace.criterion).toBe('PRIORITY')
  })

  it('TC-TIE-02: เกณฑ์ที่ 2 — priority เท่ากัน แต่กฎเฉพาะเจาะจงกว่าชนะ', () => {
    // KW-INTEREST (priority 100) มี R-6 (specificity 6, ใช้ได้กับ PAGE-1+ad_1002)
    const kwLowSpec: RuleSetKeyword = {
      id: 'kw-low-spec',
      name: 'กลุ่มคะแนนต่ำ',
      matchType: 'CONTAINS',
      priority: 100, // เท่ากับ KW-INTEREST
      phrases: [ph('ph-low-1', 'สนใจ')],
    }
    const lowSpecRule = rule({ id: 'R-LOW', keywordId: 'kw-low-spec', specificity: 0 })
    const ruleSet: RuleSet = {
      keywords: [kwInterest(), kwLowSpec],
      rules: [...interestRules(), lowSpecRule],
    }
    const c = ctx({ shopChannelId: PAGE_1, adId: AD_1002 })
    const result = matchKeywords(norm('สนใจ'), ruleSet, c)
    expect(result.winner?.keywordId).toBe(KW_INTEREST_ID)
    expect(result.matchTrace.criterion).toBe('RULE_SPECIFICITY')

    const resolved = resolveRule(result.winner!.keywordId, c, ruleSet)
    expect(resolved.resolutionLevel).toBe('KEYWORD_PAGE_AD')
  })

  it('TC-TIE-03: เกณฑ์ที่ 3 — EXACT ชนะ CONTAINS', () => {
    const kwCodExact: RuleSetKeyword = {
      id: 'kw-cod-exact',
      name: 'เก็บปลายทาง (เป๊ะ)',
      matchType: 'EXACT',
      priority: 100,
      phrases: [ph('ph-cod-exact-1', 'เก็บปลายทาง')],
    }
    const kwCodContains: RuleSetKeyword = {
      id: 'kw-cod-contains',
      name: 'เก็บปลายทาง (ในประโยค)',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-cod-contains-1', 'เก็บปลายทาง')],
    }
    const ruleSet: RuleSet = { keywords: [kwCodExact, kwCodContains], rules: [] }
    const result = matchKeywords(norm('เก็บปลายทาง'), ruleSet, ctx())
    expect(result.winner?.keywordId).toBe('kw-cod-exact')
    expect(result.winner?.matchType).toBe('EXACT')
    expect(result.matchTrace.criterion).toBe('MATCH_TYPE')
  })

  it('TC-TIE-04: เกณฑ์ที่ 4 — คำตรวจจับที่ยาวกว่าชนะ (วัดจาก normalizedPhrase)', () => {
    const kwLong: RuleSetKeyword = {
      id: 'kw-long',
      name: 'คำยาว',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-long-1', 'สนใจโช๊คหลัง')],
    }
    const ruleSet: RuleSet = { keywords: [kwInterest(), kwLong], rules: [] }
    const result = matchKeywords(norm('สนใจโช๊คหลังครับ'), ruleSet, ctx())
    expect(result.winner?.keywordId).toBe('kw-long')
    expect(result.winner?.matchedPhraseNormalized).toBe(norm('สนใจโช๊คหลัง'))
    expect(result.matchTrace.criterion).toBe('PHRASE_LENGTH')
  })

  it('TC-TIE-05: เท่ากันทุกเกณฑ์ → มีผู้ชนะที่กำหนดไว้แน่นอน (keyword.id ASC)', () => {
    const kwTieA: RuleSetKeyword = {
      id: 'kw-tie-a',
      name: 'เสมอกัน A',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-tie-a-1', 'ทดสอบเสมอ')],
    }
    const kwTieB: RuleSetKeyword = {
      id: 'kw-tie-b',
      name: 'เสมอกัน B',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-tie-b-1', 'ทดสอบเสมอ')],
    }
    const ruleSet: RuleSet = { keywords: [kwTieA, kwTieB], rules: [] }
    const r1 = matchKeywords(norm('ทดสอบเสมอ'), ruleSet, ctx())
    const r2 = matchKeywords(norm('ทดสอบเสมอ'), ruleSet, ctx())
    expect(r1.winner?.keywordId).toBe('kw-tie-a') // 'kw-tie-a' < 'kw-tie-b'
    expect(r2.winner?.keywordId).toBe('kw-tie-a')
    expect(r1.matchTrace.criterion).toBe('KEYWORD_ID')
  })

  it('TC-TIE-06: BLOCKER — deterministic ข้ามการรันและข้ามลำดับข้อมูล (50 รอบ x 2 ลำดับ)', () => {
    const kwTieA: RuleSetKeyword = {
      id: 'kw-tie-a',
      name: 'เสมอกัน A',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-tie-a-1', 'ทดสอบเสมอ')],
    }
    const kwTieB: RuleSetKeyword = {
      id: 'kw-tie-b',
      name: 'เสมอกัน B',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-tie-b-1', 'ทดสอบเสมอ')],
    }
    const text = norm('ทดสอบเสมอ')
    const results = new Set<string>()

    for (let i = 0; i < 50; i++) {
      const ruleSet: RuleSet = { keywords: [kwTieA, kwTieB], rules: [] }
      const r = matchKeywords(text, ruleSet, ctx())
      results.add(JSON.stringify({ keywordId: r.winner?.keywordId, criterion: r.matchTrace.criterion }))
    }
    for (let i = 0; i < 50; i++) {
      // สลับลำดับ insert (B ก่อน A) — ผลต้องไม่เปลี่ยนเพราะ comparator ไม่พึ่งลำดับ array
      const ruleSetSwapped: RuleSet = { keywords: [kwTieB, kwTieA], rules: [] }
      const r = matchKeywords(text, ruleSetSwapped, ctx())
      results.add(JSON.stringify({ keywordId: r.winner?.keywordId, criterion: r.matchTrace.criterion }))
    }

    expect(results.size).toBe(1) // 100 รอบ ได้ผลเดียวกันทุกครั้ง
  })

  it('TC-TIE-07/08: หนึ่งข้อความได้ผู้ชนะไม่เกิน 1 ราย + matchTrace ระบุผู้ชนะ/เกณฑ์/ผู้แพ้ครบ', () => {
    const kwCodContains: RuleSetKeyword = {
      id: 'kw-cod-contains',
      name: 'เก็บปลายทาง (ในประโยค)',
      matchType: 'CONTAINS',
      priority: 100,
      phrases: [ph('ph-cod-contains-1', 'เก็บปลายทาง')],
    }
    const ruleSet: RuleSet = { keywords: [kwInterest(), kwPrice(), kwCodContains], rules: [] }
    const result = matchKeywords(norm('สนใจครับ ราคาเท่าไหร่ มีเก็บปลายทางไหม'), ruleSet, ctx())

    // AC-011-01 — ผู้ชนะมีเพียงหนึ่งเดียวเสมอ (โครงสร้าง type คืนค่าเดี่ยวอยู่แล้ว แต่ยืนยัน field ตรง)
    expect(result.winner?.keywordId).toBe(KW_PRICE_ID) // priority 120 สูงสุด
    // AC-011-04 — matchTrace ระบุผู้ชนะ + เกณฑ์ + ผู้แพ้ครบ (2 กลุ่มที่เหลือ)
    expect(result.matchTrace.winner?.keywordId).toBe(KW_PRICE_ID)
    expect(result.matchTrace.criterion).toBe('PRIORITY')
    expect(result.matchTrace.losers).toHaveLength(2)
    expect(result.matchTrace.losers.every(l => l.lostAt === 'PRIORITY')).toBe(true)
    expect(result.matchTrace.losers.map(l => l.keywordId).sort()).toEqual([KW_INTEREST_ID, 'kw-cod-contains'].sort())
  })

  it('matchTrace.losers ถูกจำกัดไม่เกิน 20 รายการ พร้อม truncated=true', () => {
    const many: RuleSetKeyword[] = Array.from({ length: 25 }, (_, i) => ({
      id: `kw-many-${String(i).padStart(2, '0')}`,
      name: `กลุ่ม ${i}`,
      matchType: 'CONTAINS' as const,
      priority: i === 0 ? 200 : 100, // ตัวแรก priority สูงสุด = ผู้ชนะ
      phrases: [ph(`ph-many-${i}`, 'สนใจ')],
    }))
    const ruleSet: RuleSet = { keywords: many, rules: [] }
    const result = matchKeywords(norm('สนใจ'), ruleSet, ctx())
    expect(result.winner?.keywordId).toBe('kw-many-00')
    expect(result.matchTrace.losers).toHaveLength(20)
    expect(result.matchTrace.truncated).toBe(true)
  })
})

// ===========================================================================
// กลุ่ม D — [Unit] การเลือกกฎและการถอยระดับ 9 ขั้น (FR-009)
// ===========================================================================

describe('resolveRule — กลุ่ม D การถอยระดับ 9 ขั้น', () => {
  it('TC-RES-01: ระดับ 1 — Keyword + เพจ + โฆษณา + สินค้า', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1, adId: AD_1001, productId: PROD_1 }), ruleSet)
    expect(result.rule?.id).toBe('R-7')
    expect(result.resolutionLevel).toBe('KEYWORD_PAGE_AD_PRODUCT')
    expect(result.rule?.replyText).toBe('[R-7] คำตอบ')
  })

  it('TC-RES-02: ระดับ 2 — Keyword + เพจ + โฆษณา', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1, adId: AD_1002 }), ruleSet)
    expect(result.rule?.id).toBe('R-6')
    expect(result.resolutionLevel).toBe('KEYWORD_PAGE_AD')
  })

  it('TC-RES-03: ระดับ 3 — Keyword + เพจ + สินค้า', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1, productId: PROD_2 }), ruleSet)
    expect(result.rule?.id).toBe('R-5')
    expect(result.resolutionLevel).toBe('KEYWORD_PAGE_PRODUCT')
  })

  it('TC-RES-04: ระดับ 4 — Keyword + เพจ', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1 }), ruleSet)
    expect(result.rule?.id).toBe('R-4')
    expect(result.resolutionLevel).toBe('KEYWORD_PAGE')
  })

  it('TC-RES-05: ระดับ 5 — Keyword + สินค้า (ไม่ระบุเพจ)', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_3, productId: PROD_1 }), ruleSet)
    expect(result.rule?.id).toBe('R-1')
    expect(result.resolutionLevel).toBe('KEYWORD_PRODUCT')
  })

  it('TC-RES-06: ระดับ 6 — Keyword กลาง', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_3 }), ruleSet)
    expect(result.rule?.id).toBe('R-0')
    expect(result.resolutionLevel).toBe('KEYWORD_DEFAULT')
  })

  it('TC-RES-07: ระดับ 7 — คำตอบกลางของเพจ (ไม่มีกลุ่มคำใดตรง) ไม่ใช่ HANDOFF', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(null, ctx({ shopChannelId: PAGE_1 }), ruleSet)
    expect(result.rule?.id).toBe('R-PAGE-DEF')
    expect(result.resolutionLevel).toBe('PAGE_DEFAULT')
  })

  it('TC-RES-08: ระดับ 8 — คำตอบกลางของร้าน', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(null, ctx({ shopChannelId: PAGE_3 }), ruleSet)
    expect(result.rule?.id).toBe('R-SHOP-DEF')
    expect(result.resolutionLevel).toBe('SHOP_DEFAULT')
  })

  it('TC-RES-09/14: ระดับ 9 — ไม่เหลืออะไรให้ถอย → NONE (ไม่ throw ไม่เดา)', () => {
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: interestRules() } // ไม่มี central rules
    const result = resolveRule(null, ctx({ shopChannelId: PAGE_3 }), ruleSet)
    expect(result.rule).toBeNull()
    expect(result.resolutionLevel).toBe('NONE')
  })

  it('TC-RES-10: BLOCKER — เมทริกซ์การถอยระดับทุกคู่ (ตัดกฎออกทีละระดับ)', () => {
    // [หมายเหตุ — พบข้อขัดแย้งในเอกสาร ไม่ใช่บั๊กของ resolver] TestCase.md บอกว่าให้ resolve
    // "ด้วยบริบทเดิม (PAGE-1 + ad_1001 + PROD-1)" ตลอดทั้งตาราง แต่ตารางกฎ §2.6 เองผูก R-6 กับ
    // `ad_1002` (ไม่ใช่ ad_1001) และผูก R-5 กับ PROD-2 (ไม่ใช่ PROD-1) — ถ้า ctx คงที่จริงตามที่บอก
    // ตัด R-7 ออกแล้วจะข้าม R-6/R-5 ไปที่ R-4 ทันที (เพราะ R-6/R-5 ไม่ผ่านเงื่อนไข ad/product ของ
    // ctx นี้เลย ไม่ว่าจะลบ R-7 หรือไม่) ซึ่งถูกต้องตาม TFR-010 เงื่อนไข a-c (กฎที่ระบุ ad/product
    // เจาะจงต้องตรงเป๊ะ ไม่ใช่แค่ "ไม่มีกฎที่เฉพาะกว่า") — เพื่อพิสูจน์ผู้ชนะที่ "ถูกต้อง" ของทุกระดับ
    // (ตรงกับที่ TC-RES-01..09 ทำแยกเคสด้วย ctx ของแต่ละระดับเอง) เทสนี้จึงใช้ ctx เฉพาะของแต่ละ
    // ระดับ (เหมือน TC-RES-01..09) ควบคู่กับการตัดกฎออกทีละระดับจากบนลงล่าง เพื่อยืนยันว่าการถอย
    // ระดับไม่ข้ามชั้นและไม่ย้อนขึ้น — ต้องรายงาน Controller ว่า TestCase.md ควรแก้ถ้อยคำ "บริบทเดิม"
    // แต่ละแถว: removeId = กฎที่ตัดออกในขั้นนี้ (สะสมจากขั้นก่อนหน้า), ctxAfter = บริบทที่ใช้ตรวจ
    // "กฎถัดไปที่ควรชนะ" หลังตัดออกแล้ว (เลือกให้ตรงเงื่อนไขเฉพาะของกฎนั้น — เหมือน TC-RES-01..09),
    // expected = resolutionLevel ที่ต้องได้
    const rows: Array<{ removeId: string; ctxAfter: MatchContext; expected: string }> = [
      { removeId: 'R-7', ctxAfter: ctx({ shopChannelId: PAGE_1, adId: AD_1002 }), expected: 'KEYWORD_PAGE_AD' }, // เหลือ R-6
      { removeId: 'R-6', ctxAfter: ctx({ shopChannelId: PAGE_1, productId: PROD_2 }), expected: 'KEYWORD_PAGE_PRODUCT' }, // เหลือ R-5
      { removeId: 'R-5', ctxAfter: ctx({ shopChannelId: PAGE_1 }), expected: 'KEYWORD_PAGE' }, // เหลือ R-4
      { removeId: 'R-4', ctxAfter: ctx({ shopChannelId: PAGE_3, productId: PROD_1 }), expected: 'KEYWORD_PRODUCT' }, // เหลือ R-MIXED(ไม่ผ่าน)/R-1/R-0 → R-1
      {
        removeId: 'R-MIXED',
        ctxAfter: ctx({ shopChannelId: PAGE_3, productId: PROD_1 }),
        expected: 'KEYWORD_PRODUCT', // ไม่เปลี่ยน — พิสูจน์ว่า R-MIXED ไม่เคยถูกใช้กับ ctx นี้อยู่แล้ว
      },
      { removeId: 'R-1', ctxAfter: ctx({ shopChannelId: PAGE_3 }), expected: 'KEYWORD_DEFAULT' }, // เหลือ R-0
      { removeId: 'R-0', ctxAfter: ctx({ shopChannelId: PAGE_1 }), expected: 'PAGE_DEFAULT' }, // กลุ่มหมด → กฎกลางเพจ
      { removeId: 'R-PAGE-DEF', ctxAfter: ctx({ shopChannelId: PAGE_1 }), expected: 'SHOP_DEFAULT' }, // เหลือกฎกลางร้าน
      { removeId: 'R-SHOP-DEF', ctxAfter: ctx({ shopChannelId: PAGE_1 }), expected: 'NONE' }, // ไม่เหลืออะไรให้ถอย
    ]

    let rules = [...interestRules(), ...centralRules()]
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules }

    // สถานะเริ่มต้น (ยังไม่ตัดอะไร) — ระดับสูงสุด
    expect(
      resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1, adId: AD_1001, productId: PROD_1 }), ruleSet)
        .resolutionLevel
    ).toBe('KEYWORD_PAGE_AD_PRODUCT')

    const removed: string[] = []
    for (const row of rows) {
      rules = rules.filter(r => r.id !== row.removeId)
      removed.push(row.removeId)
      ruleSet.rules = rules
      const result = resolveRule(KW_INTEREST_ID, row.ctxAfter, ruleSet)
      expect(result.resolutionLevel, `after removing ${removed.join(',')}`).toBe(row.expected)
    }
  })

  it('TC-RES-11: BLOCKER — โฆษณาที่ไม่รู้จักต้องถอยไประดับเพจ ไม่ใช่หยุดตอบ (AC-007-04)', () => {
    const ruleSet = defaultRuleSet()
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1, adId: AD_9999 }), ruleSet)
    expect(result.rule?.id).toBe('R-4')
    expect(result.resolutionLevel).toBe('KEYWORD_PAGE')
  })

  it('TC-RES-12/13: สินค้า/เพจถูกถอด (SetNull) แต่ specificity ค้าง → ข้ามอย่างปลอดภัย ไม่ throw (AC-008-03, AC-006-05)', () => {
    // จำลองผลของ onDelete:SetNull — คอลัมน์เงื่อนไขถูกล้างแล้วแต่คอลัมน์ specificity (เก็บจริง)
    // ยังไม่ถูก sweeper แก้ไข (TFR-024) — resolveRule ต้องตรวจจับด้วย computeSpecificity แล้วข้าม
    const staleRule = rule({ id: 'R-STALE', keywordId: KW_INTEREST_ID, productId: null, specificity: 1 })
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [staleRule, ...centralRules()] }
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_3, productId: PROD_1 }), ruleSet)
    // R-STALE ไม่ถูกเลือก (ข้ามเงียบ ๆ ด้วย console.warn) — ถอยไป SHOP_DEFAULT แทน ไม่ throw ไม่พัง
    expect(result.rule?.id).not.toBe('R-STALE')
    expect(result.resolutionLevel).toBe('SHOP_DEFAULT')
  })

  it('TC-RES-15: คำตอบว่างถือว่าไม่มีคำตอบ → ถอยระดับต่อ (ไม่ส่งข้อความว่างเด็ดขาด)', () => {
    const kwPriceKw = kwPrice()
    const rEmpty = rule({ id: 'R-EMPTY', keywordId: KW_PRICE_ID, shopChannelId: PAGE_2, specificity: 4, replyText: '   ' })
    const rInactive = rule({ id: 'R-INACTIVE', keywordId: KW_PRICE_ID, shopChannelId: PAGE_1, specificity: 4, isActive: false })
    const rScheduled = rule({
      id: 'R-SCHEDULED',
      keywordId: KW_PRICE_ID,
      shopChannelId: PAGE_3,
      specificity: 4,
      activeFrom: new Date('2099-01-01T00:00:00Z'),
    })

    // มี fallback กลางรองรับ — ต้องถอยไปหาแทนที่จะพัง
    const withFallback: RuleSet = {
      keywords: [kwPriceKw],
      rules: [rEmpty, rInactive, rScheduled, ...centralRules()],
    }
    const result = resolveRule(KW_PRICE_ID, ctx({ shopChannelId: PAGE_2 }), withFallback)
    expect(result.rule?.id).not.toBe('R-EMPTY')
    expect(result.resolutionLevel).toBe('SHOP_DEFAULT')
    expect(result.fallbackFrom.some(f => f.reason === 'EMPTY_TEXT')).toBe(true)

    // ไม่มี fallback เหลือเลย → NONE (ไม่ throw)
    const noFallback: RuleSet = { keywords: [kwPriceKw], rules: [rule({ ...rEmpty, id: 'R-EMPTY-2' })] }
    const result2 = resolveRule(KW_PRICE_ID, ctx({ shopChannelId: PAGE_2 }), noFallback)
    expect(result2.rule).toBeNull()
    expect(result2.resolutionLevel).toBe('NONE')
    expect(result2.fallbackFrom.some(f => f.reason === 'EMPTY_TEXT')).toBe(true)
  })

  it('TC-RES-16: การแมป specificity -> resolutionLevel ถูกทุกค่าที่ FROZEN รองรับ', () => {
    const cases: Array<[number, boolean, string]> = [
      [7, true, 'KEYWORD_PAGE_AD_PRODUCT'],
      [6, true, 'KEYWORD_PAGE_AD'],
      [5, true, 'KEYWORD_PAGE_PRODUCT'],
      [4, true, 'KEYWORD_PAGE'],
      [1, true, 'KEYWORD_PRODUCT'],
      [0, true, 'KEYWORD_DEFAULT'],
      [4, false, 'PAGE_DEFAULT'],
      [0, false, 'SHOP_DEFAULT'],
    ]
    for (const [specificity, hasKeyword, expected] of cases) {
      // conditions = ทั้งเงื่อนไขของกฎ "และ" ค่า ctx ที่ต้องตรงกันเป๊ะ (มิติที่ไม่ระบุ = ไม่ใส่คีย์เลย
      // เพื่อไม่ให้ทับค่า default null ของ ctx() ด้วย undefined โดยไม่ตั้งใจ)
      const conditions: { shopChannelId?: string; adId?: string; productId?: string } =
        specificity === 7
          ? { shopChannelId: PAGE_1, adId: AD_1001, productId: PROD_1 }
          : specificity === 6
            ? { shopChannelId: PAGE_1, adId: AD_1001 }
            : specificity === 5
              ? { shopChannelId: PAGE_1, productId: PROD_1 }
              : specificity === 4
                ? { shopChannelId: PAGE_1 }
                : specificity === 1
                  ? { productId: PROD_1 }
                  : {}
      const r = rule({ id: `R-${specificity}-${hasKeyword}`, keywordId: hasKeyword ? KW_INTEREST_ID : null, specificity, ...conditions })
      const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [r] }
      const c = ctx(conditions)
      const result = resolveRule(hasKeyword ? KW_INTEREST_ID : null, c, ruleSet)
      expect(result.resolutionLevel, `specificity=${specificity} hasKeyword=${hasKeyword}`).toBe(expected)
    }
  })

  it('TC-RES-17: กฎที่ปิดอยู่หรืออยู่นอกช่วงเวลาต้องถูกข้าม (กรองที่เดียว ไม่มี logic คู่ขนาน)', () => {
    const rInactive = rule({ id: 'R-INACTIVE', keywordId: KW_INTEREST_ID, shopChannelId: PAGE_1, specificity: 6, isActive: false })
    const rScheduled = rule({
      id: 'R-SCHEDULED',
      keywordId: KW_INTEREST_ID,
      shopChannelId: PAGE_1,
      specificity: 5,
      activeUntil: new Date('2000-01-01T00:00:00Z'), // หมดอายุไปแล้ว
    })
    const rFallback = rule({ id: 'R-4', keywordId: KW_INTEREST_ID, shopChannelId: PAGE_1, specificity: 4 })
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [rInactive, rScheduled, rFallback] }
    const result = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1 }), ruleSet)
    expect(result.rule?.id).toBe('R-4')
  })

  it('TC-RES-18: specificity=3 (R-MIXED, AC-008-04) — พฤติกรรมจริงปัจจุบัน คือ "ข้ามอย่างปลอดภัย" ไม่ throw ไม่เลือกใช้ (ดูหมายเหตุบนหัวไฟล์ — รอ Controller ตัดสิน)', () => {
    const rMixed = rule({ id: 'R-MIXED', keywordId: KW_INTEREST_ID, adId: AD_1002, productId: PROD_2, specificity: 3 })
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [rMixed] }
    const c = ctx({ adId: AD_1002, productId: PROD_2 }) // ตรงเงื่อนไขของ R-MIXED ทุกประการ ยกเว้นไม่ระบุเพจ

    const result = resolveRule(KW_INTEREST_ID, c, ruleSet)

    // ปัจจุบัน: ไม่เลือก R-MIXED (ไม่มี resolutionLevel ที่ FROZEN รองรับสำหรับ specificity=3
    // พร้อม keywordId — S-02 `getResolutionLevel` throw ตาม invariant TFR-004) ไม่ throw ทะลุออกมา
    // แต่ก็ไม่ได้ผลลัพธ์ตาม TC-RES-18 ตามตัวอักษรของ TestCase.md (ที่คาดหวังว่าเลือก R-MIXED ได้)
    expect(result.rule).not.toBe(rMixed)
    expect(result.resolutionLevel).toBe('NONE')
    expect(result.fallbackFrom).toContainEqual({ resolutionLevel: null, reason: 'STALE_SPECIFICITY' })
  })

  it('TC-RES-19: คำตอบเฉพาะเพจชนะคำตอบกลาง และเพจที่ไม่ตั้งต้องถอยไปกลางเอง', () => {
    const ruleSet = defaultRuleSet()
    const onPage1 = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_1 }), ruleSet)
    expect(onPage1.rule?.id).toBe('R-4')
    expect(onPage1.resolutionLevel).toBe('KEYWORD_PAGE')

    const onPage3 = resolveRule(KW_INTEREST_ID, ctx({ shopChannelId: PAGE_3 }), ruleSet)
    expect(onPage3.rule?.id).toBe('R-0')
    expect(onPage3.resolutionLevel).toBe('KEYWORD_DEFAULT')
  })

  it('เรียงกฎด้วย specificity DESC, createdAt ASC, id ASC — deterministic แม้ specificity ซ้ำกัน', () => {
    // สองกฎ specificity เท่ากัน (0) ผูกกับกลุ่มเดียวกัน — ตามปกติ unique constraint ของ DB จริง
    // จะกันไม่ให้เกิดกรณีนี้ แต่ resolver ต้องมี tie-break ชั้นสุดท้ายไว้เผื่อไว้เสมอ (TD-010)
    const first = rule({ id: 'R-A', keywordId: KW_INTEREST_ID, specificity: 0 })
    const second = rule({ id: 'R-B', keywordId: KW_INTEREST_ID, specificity: 0 })
    const ruleSet: RuleSet = { keywords: [kwInterest()], rules: [second, first] } // ใส่สลับลำดับโดยตั้งใจ
    const result = resolveRule(KW_INTEREST_ID, ctx(), ruleSet)
    expect(result.rule?.id).toBe('R-A') // createdAt เก่ากว่า (ถูกสร้างก่อนใน fixture) ชนะ
  })
})
