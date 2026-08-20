import { describe, expect, it } from 'vitest'
import {
  pickStaleParcelsForLookup,
  STALE_LOOKUP_MAX_PER_ROUND,
} from '../stale-lookup'

/**
 * [blocker] ใบที่หลุดหน้าต่าง query_orders ต้องถูกตามต่อ — และต้องถูกตามครบทุกใบ
 *
 * บั๊กต้นเรื่อง (prod 2026-08-20 TH068661575518): `syncShipmentStatuses` เจอ `if (!row) continue`
 * แล้วปล่อยใบที่ไม่อยู่ในคำตอบยกชุดทิ้งทุกรอบ = สถานะค้างตลอดกาลโดยไม่มีอะไรฟ้อง
 *
 * เทสชุดนี้ล็อกสองอย่างที่แก้กันคนละทาง: **เพดานต้นทุน** (ห้ามกลายเป็นคำขอรายใบไม่จำกัด
 * ซึ่งคือเหตุผลที่ระบบใช้ query_orders ตั้งแต่แรก) และ **ความครบ** (ห้ามให้ใบท้ายคิว
 * ไม่ถูกถามเลยสักครั้ง ซึ่งจะเป็นบั๊กเดิมที่แค่ย้ายที่อยู่)
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = new Date('2026-08-20T10:00:00.000Z')

function parcel(trackingNo: string, movedDaysAgo: number | null, createdDaysAgo = 30) {
  return {
    trackingNo,
    carrierStatusAt:
      movedDaysAgo === null ? null : new Date(NOW.getTime() - movedDaysAgo * DAY),
    createdAt: new Date(NOW.getTime() - createdDaysAgo * DAY),
  }
}

describe('pickStaleParcelsForLookup', () => {
  it('[blocker] ใบที่อยู่ในคำตอบยกชุดแล้ว ต้องไม่ถูกถามซ้ำรายใบ', () => {
    const list = [parcel('TH1', 8), parcel('TH2', 9)]
    const picked = pickStaleParcelsForLookup(list, new Set(['TH1']), NOW)
    expect(picked.map((p) => p.trackingNo)).toEqual(['TH2'])
  })

  it('[blocker] ใบที่หลุดหน้าต่าง (ตีกลับ 8 วัน) ต้องถูกเลือกมาถาม — ไม่ใช่ถูกข้ามเงียบ', () => {
    // รูปเดียวกับ TH068661575518: สร้าง 12 วันก่อน ขยับล่าสุด 8 วันก่อน ไม่มีในคำตอบยกชุด
    const picked = pickStaleParcelsForLookup([parcel('TH068661575518', 8, 12)], new Set(), NOW)
    expect(picked.map((p) => p.trackingNo)).toEqual(['TH068661575518'])
  })

  it('[blocker] ไม่เกินเพดานต่อรอบ แม้จะมีใบค้างเยอะแค่ไหน', () => {
    const many = Array.from({ length: 50 }, (_, i) => parcel(`TH${i}`, 8 + i * 0.01))
    expect(pickStaleParcelsForLookup(many, new Set(), NOW)).toHaveLength(
      STALE_LOOKUP_MAX_PER_ROUND,
    )
  })

  it('[blocker] ทุกใบต้องได้คิวครบภายใน ceil(n/max) รอบ — ห้ามมีใบที่ไม่ถูกถามเลย', () => {
    const many = Array.from({ length: 20 }, (_, i) => parcel(`TH${i}`, 8 + i * 0.01))
    const rotationMs = 15 * 60 * 1000
    const rounds = Math.ceil(20 / STALE_LOOKUP_MAX_PER_ROUND) // 3

    const seen = new Set<string>()
    for (let r = 0; r < rounds; r++) {
      const at = new Date(NOW.getTime() + r * rotationMs)
      for (const p of pickStaleParcelsForLookup(many, new Set(), at, { rotationMs })) {
        seen.add(p.trackingNo)
      }
    }
    expect(seen.size).toBe(20)
  })

  it('ใบที่เพิ่งขยับล่าสุดได้คิวก่อน (โอกาสขยับต่อสูงสุด)', () => {
    const list = [parcel('OLD', 20), parcel('NEW', 7), parcel('MID', 12)]
    const picked = pickStaleParcelsForLookup(list, new Set(), NOW, { max: 2 })
    expect(picked.map((p) => p.trackingNo)).toEqual(['NEW', 'MID'])
  })

  it('[blocker] ใบที่ไม่ขยับเกินเพดานอายุ = เลิกตาม (ไม่งั้นมันยึดโควตาไว้ตลอดกาล)', () => {
    const list = [parcel('DEAD', 60, 90), parcel('ALIVE', 8)]
    const picked = pickStaleParcelsForLookup(list, new Set(), NOW)
    expect(picked.map((p) => p.trackingNo)).toEqual(['ALIVE'])
  })

  it('[blocker] ใบที่ขนส่งยังไม่เคยสแกน (carrierStatusAt = null) ต้องนับอายุจากวันสร้าง', () => {
    // เพิ่งเปิดเมื่อวาน — เป็นใบใหม่เอี่ยม ห้ามถูกตีว่าเก่าที่สุดแล้วตกเพดานอายุ
    const fresh = parcel('NEWBIE', null, 1)
    const picked = pickStaleParcelsForLookup([fresh, parcel('OTHER', 30)], new Set(), NOW, {
      max: 1,
    })
    expect(picked.map((p) => p.trackingNo)).toEqual(['NEWBIE'])
  })

  it('ใบที่ไม่มีเลขติดตามถามไม่ได้อยู่แล้ว — ต้องไม่อยู่ในคิว', () => {
    const list = [{ trackingNo: null, carrierStatusAt: null, createdAt: NOW }]
    expect(pickStaleParcelsForLookup(list, new Set(), NOW)).toEqual([])
  })

  it('ลำดับต้องนิ่งเมื่อ movedAt เท่ากัน — ไม่งั้นคิวหมุนจะข้ามบางใบไปเรื่อย ๆ', () => {
    const tie = [parcel('TH_B', 8), parcel('TH_A', 8), parcel('TH_C', 8)]
    const a = pickStaleParcelsForLookup(tie, new Set(), NOW, { max: 2 })
    const b = pickStaleParcelsForLookup([...tie].reverse(), new Set(), NOW, { max: 2 })
    expect(a.map((p) => p.trackingNo)).toEqual(b.map((p) => p.trackingNo))
  })
})
