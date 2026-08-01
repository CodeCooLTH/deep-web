import { describe, it, expect } from 'vitest'
import {
  computeSpecificity,
  getResolutionLevel,
  MATCH_TYPES,
  HUMAN_TAKEOVER_PAUSE_MODES,
  ADS_CONTEXT_MODES,
  AUTO_REPLY_JOB_STATUSES,
  AUTO_REPLY_LOG_DECISIONS,
  RESOLUTION_LEVELS,
  SKIP_REASONS,
  AUTO_REPLY_KINDS,
  CONTEXT_PRODUCT_SOURCES,
} from '@/lib/auto-reply-constants'

// feature 00023 — ครอบ computeSpecificity/resolutionLevel ของ TestCase.md กลุ่ม D
// (เฉพาะส่วน TC-RES-16 mapping specificity -> resolutionLevel; ส่วนที่เหลือของกลุ่ม D
// เป็น resolver เต็มรูป ขอบเขตของ S-04 ไม่ใช่ S-02)

describe('computeSpecificity', () => {
  it('bitmask ตาม DATABASE §3.4: เพจ=4, โฆษณา=2, สินค้า=1', () => {
    expect(computeSpecificity({})).toBe(0)
    expect(computeSpecificity({ shopChannelId: 'ch1' })).toBe(4)
    expect(computeSpecificity({ adId: 'ad1' })).toBe(2)
    expect(computeSpecificity({ productId: 'p1' })).toBe(1)
    expect(computeSpecificity({ shopChannelId: 'ch1', adId: 'ad1' })).toBe(6)
    expect(computeSpecificity({ shopChannelId: 'ch1', productId: 'p1' })).toBe(5)
    expect(computeSpecificity({ adId: 'ad1', productId: 'p1' })).toBe(3)
    expect(computeSpecificity({ shopChannelId: 'ch1', adId: 'ad1', productId: 'p1' })).toBe(7)
  })

  it('null เท่ากับไม่มีเงื่อนไข (เหมือน undefined)', () => {
    expect(computeSpecificity({ shopChannelId: null, adId: null, productId: null })).toBe(0)
  })
})

describe('getResolutionLevel — TC-RES-16 (ค่าที่ FROZEN §3.8 รองรับ)', () => {
  it.each([
    [7, 'KEYWORD_PAGE_AD_PRODUCT'],
    [6, 'KEYWORD_PAGE_AD'],
    [5, 'KEYWORD_PAGE_PRODUCT'],
    [4, 'KEYWORD_PAGE'],
    [1, 'KEYWORD_PRODUCT'],
    [0, 'KEYWORD_DEFAULT'],
  ] as const)('keywordId ไม่ null: specificity=%i -> %s', (specificity, expected) => {
    expect(getResolutionLevel(specificity, true)).toBe(expected)
  })

  it.each([
    [4, 'PAGE_DEFAULT'],
    [0, 'SHOP_DEFAULT'],
  ] as const)('keywordId=null: specificity=%i -> %s', (specificity, expected) => {
    expect(getResolutionLevel(specificity, false)).toBe(expected)
  })

  it('specificity 2/3 เกิดไม่ได้ตาม invariant TFR-004 -> throw แทนการเดาค่านอก FROZEN list', () => {
    expect(() => getResolutionLevel(2, true)).toThrow()
    expect(() => getResolutionLevel(3, true)).toThrow()
  })

  it('keywordId=null แต่ specificity ไม่ใช่ 0/4 -> throw (ขัด invariant กฎกลาง)', () => {
    expect(() => getResolutionLevel(1, false)).toThrow()
    expect(() => getResolutionLevel(7, false)).toThrow()
  })

  it('specificity นอกช่วง 0-7 -> throw', () => {
    expect(() => getResolutionLevel(8, true)).toThrow()
    expect(() => getResolutionLevel(-1, true)).toThrow()
  })
})

describe('ค่าคงที่ FROZEN §3.8 — จำนวนและเนื้อหาตรงตามเอกสาร', () => {
  it('matchType', () => expect(MATCH_TYPES).toEqual(['EXACT', 'CONTAINS', 'STARTS_WITH']))
  it('humanTakeoverPauseMode', () =>
    expect(HUMAN_TAKEOVER_PAUSE_MODES).toEqual(['30M', '2H', 'MANUAL', 'UNTIL_RESOLVED']))
  it('adsContextMode', () =>
    expect(ADS_CONTEXT_MODES).toEqual(['UNTIL_RESOLVED', 'HOURS', 'UNTIL_NEW_PRODUCT']))
  it('AutoReplyJob.status', () =>
    expect(AUTO_REPLY_JOB_STATUSES).toEqual(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED']))
  it('AutoReplyLog.decision', () =>
    expect(AUTO_REPLY_LOG_DECISIONS).toEqual(['REPLIED', 'SKIPPED', 'HANDOFF', 'FAILED']))
  // 10 ไม่ใช่ 9: เพิ่ม 'QNA' 2026-07-31 (phase 00023-qna — คำตอบจากคลังคำถามไม่ได้ผ่าน
  // resolveRule จึงต้องมีชื่อระดับของตัวเอง) · DATABASE.md §3.8 อัปเดตให้ตรงแล้ว
  it('resolutionLevel ครบ 10 ค่า', () => expect(RESOLUTION_LEVELS).toHaveLength(10))
  it("'QNA' ต้องไม่มีทางออกจาก getResolutionLevel — ผู้เรียกเซ็ตตรง ๆ ที่ processJob (TFR-032)", () => {
    // ค่าที่ getResolutionLevel คืนได้ต้องไม่มี QNA เลย ไม่ว่า specificity/hasKeywordId จะเป็นอะไร
    const produced = new Set<string>()
    for (const spec of [0, 1, 4, 5, 6, 7]) produced.add(getResolutionLevel(spec, true))
    for (const spec of [0, 4]) produced.add(getResolutionLevel(spec, false))
    expect(produced.has('QNA')).toBe(false)
  })
  // 17 ไม่ใช่ 16: เพิ่ม OUTSIDE_SCHEDULE 2026-07-31 (เวลาทำงานของ DeepBot, feature 00023 เฟส A)
  // แก้ตัวเลขนี้ได้เฉพาะเมื่อแก้ DATABASE.md §3.8 ให้ตรงกันแล้วเท่านั้น — เทสนี้มีไว้กันการเพิ่ม
  // ค่าเงียบ ๆ โดยลืมอัปเดตเอกสารที่เป็น SSOT
  it('skipReason ครบ 17 ค่า', () => expect(SKIP_REASONS).toHaveLength(17))
  it('autoReplyKind 2 ค่า (ไม่รวม null ที่แทน "คนตอบเอง")', () =>
    expect(AUTO_REPLY_KINDS).toEqual(['AUTO', 'AUTO_TEST']))
  it('contextProductSource', () =>
    expect(CONTEXT_PRODUCT_SOURCES).toEqual(['ADS_MAPPING', 'MANUAL', 'REFERRAL']))
})
