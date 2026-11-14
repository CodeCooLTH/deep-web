import { describe, it, expect } from 'vitest'
import {
  gapPct, gapBadge, ratePct, unitCost, frequency, closeRatePct, sumKnown, groupRatePct, isVideoAd, placementLabel,
  HIGH_GAP_PCT, HIGH_GAP_MIN_META_CHATS,
} from '@/lib/ad-quality-formulas'

describe('สูตร F-01…F-13', () => {
  it('F-01 ส่วนต่างแชท: Meta 88 / Deep 51 ≈ 42.05% · ติดลบ = Deep มากกว่า · Meta 0/ไม่มี = null', () => {
    expect(gapPct(88, 51)).toBe(42.05)
    expect(gapPct(100, 120)).toBe(-20)
    expect(gapPct(0, 5)).toBeNull()
    expect(gapPct(null, 5)).toBeNull()
  })
  it('F-03/F-05…F-08/F-13 อัตรา: ตัวหาร 0 → null · action หาย (null) → null ไม่ใช่ 0 · "0" จริง = 0 · เกิน 100% เก็บจริง', () => {
    expect(ratePct(43, 702)).toBe(6.13)
    expect(ratePct(5, 0)).toBeNull()
    expect(ratePct(null, 100)).toBeNull()
    expect(ratePct(0, 100)).toBe(0)
    expect(ratePct(150, 100)).toBe(150)
  })
  it('F-04/F-10/F-11 ต้นทุนต่อหน่วย · F-12 ความถี่ หาร 0 → null', () => {
    expect(unitCost(4960, 100)).toBe(49.6)
    expect(unitCost(100, 0)).toBeNull()
    expect(unitCost(null, 10)).toBeNull()
    expect(frequency(1620000, 512400)).toBe(3.16)
    expect(frequency(10, 0)).toBeNull()
  })
  it('F-09 ปิดการขาย = คำสั่งซื้อ ÷ แชท (Deep) · Deep 0 → null', () => {
    expect(closeRatePct(249, 902)).toBe(27.61)
    expect(closeRatePct(3, 0)).toBeNull()
  })
})

describe('ป้ายส่วนต่าง (BR-AIQ-05 + มติ O4)', () => {
  it('ค่าคงที่เดียว: 20% และ Meta ≥ 20', () => {
    expect(HIGH_GAP_PCT).toBe(20)
    expect(HIGH_GAP_MIN_META_CHATS).toBe(20)
  })
  it.each([
    [88, 51, 'HIGH'], [20, 16, 'HIGH'], [20, 17, null], [19, 10, 'LOW_SAMPLE'], [19, 18, null],
    [88, 0, 'NO_DEEP'], [3, 0, 'LOW_SAMPLE'], [100, 130, 'DEEP_MORE'], [0, 3, null],
  ] as const)('Meta %i / Deep %i → %s', (m, d, want) => expect(gapBadge(m, d)).toBe(want))
  it('ไม่มี Meta → ไม่มีป้าย', () => expect(gapBadge(null, 4)).toBeNull())
})

describe('ผลรวม/กลุ่ม (ห้ามเฉลี่ย %)', () => {
  it('sumKnown: ทุกค่า null → null · มี 0 จริง → 0', () => {
    expect(sumKnown([null, null])).toBeNull()
    expect(sumKnown([0, null])).toBe(0)
    expect(sumKnown([1, null, 2])).toBe(3)
  })
  it('groupRatePct: Σตัวตั้ง ÷ Σตัวหาร เฉพาะแถวที่มีทั้งคู่ (แถว action หายไม่ลากตัวหาร)', () => {
    const rows = [{ n: 10, d: 100 }, { n: 0, d: 900 }, { n: null, d: 500 }]
    const g = groupRatePct(rows, (r) => r.n, (r) => r.d)
    expect(g.pct).toBe(1) // 10/1000 ไม่ใช่เฉลี่ย (10% + 0%)/2 และไม่รวม d=500
    expect(g.den).toBe(1000)
  })
})

describe('วิดีโอ + ชื่อตำแหน่ง', () => {
  it('BR-AIQ-08', () => {
    expect(isVideoAd({ p25: 5, thruplay: null })).toBe(true)
    expect(isVideoAd({ p25: null, thruplay: 3 })).toBe(true)
    expect(isVideoAd({ p25: 0, thruplay: 0 })).toBe(false)
    expect(isVideoAd({ p25: null, thruplay: null })).toBe(false)
  })
  it('BR-AIQ-09: รู้จัก → ชื่อไทย · audience_network ทุกค่า · ไม่รู้จัก → ดิบ', () => {
    expect(placementLabel('facebook', 'feed')).toBe('Facebook ฟีด')
    expect(placementLabel('audience_network', 'classic')).toBe('Audience Network')
    expect(placementLabel('threads', 'threads_stream')).toBe('threads · threads_stream')
  })
})

describe('gapBadge — ตัดสินด้วยค่าดิบ', () => {
  it('ส่วนต่าง 19.996% ไม่ติดป้าย (ปัดแล้วได้ 20 แต่ยังไม่ถึงเกณฑ์)', () => {
    // meta 5001 · deep 4001 → 19.996%
    expect(gapBadge(5001, 4001)).toBeNull()
    expect(gapBadge(5000, 4000)).toBe('HIGH')
  })
})
