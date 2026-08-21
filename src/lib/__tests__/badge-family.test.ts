/**
 * [blocker] ทะเบียนตระกูลเหรียญ (feature 00052 P1-a)
 *
 * เทสชุดนี้ผูกกับ **แคตตาล็อกจริงใน `prisma/badge-seed-data.ts`** ไม่ใช่ข้อมูลที่แต่งขึ้น —
 * เพราะสิ่งที่ต้องกันคือ "เหรียญที่มีอยู่จริงแล้วแมปเข้าตระกูลไม่ได้" ซึ่งเทสที่แต่งข้อมูลเองจับไม่ได้
 * (บทเรียน `external-payload-schema.md`: เทสที่แต่งค่าเองตามข้อสันนิษฐานของโค้ด ยืนยันได้แค่ว่า
 *  "โค้ดทำตามที่คนเขียนคิด" ไม่ใช่ว่า "คนเขียนคิดถูก")
 *
 * mutation ที่ต้องทำให้แดง — ถ้าทำแล้วยังเขียว เทสข้อนั้นใช้ไม่ได้ ต้องเขียนใหม่:
 *   1. ลบตระกูลใดตระกูลหนึ่งออกจาก `BADGE_FAMILY_REGISTRY`
 *   2. ลบเหรียญใดใบหนึ่งออกจาก `BADGE_TO_FAMILY`
 *   3. เปลี่ยน fallback ของ `familiesForVertical` ให้ตกไปที่ `ONLINE_SALES`
 *   4. เปลี่ยน `resolveSurface` ให้คืน `EVIDENCE` เมื่อค่าไม่รู้จัก
 *   5. ตั้ง `REVENUE_MILESTONE` ขั้นใดขั้นหนึ่งเป็น `EVIDENCE`
 *   6. ประกาศตระกูลใหม่เป็น `STATUS` โดยไม่ใส่ `minSampleByTier`
 *   7. เปลี่ยน `tier` ของเหรียญที่ปล่อยไปแล้ว (เช่น Veteran 3 → 2)
 */
import { describe, expect, it } from 'vitest'

import {
  BADGE_FAMILY_REGISTRY,
  BADGE_TO_FAMILY,
  coreFamiliesForVertical,
  familiesForVertical,
  resolveBadgeFamily,
  resolveFamily,
  resolveSurface,
  statusFamilies,
  tiersOf,
  type BadgeFamilyKey,
} from '../badge-family'
import { defaultBadges } from '../../../prisma/badge-seed-data'

/**
 * คู่คอลัมน์ "ค่า + ตัวหาร" บน `Shop` ที่ P2 จะเพิ่ม — ตระกูลชนิดเหรียญสถานะทุกตัว
 * ต้องมีคู่ของตัวเองที่นี่ ไม่งั้นงานรายวันจะประเมินด้วยค่าที่ไม่มีอยู่จริง
 * แล้วเหรียญหลุดจากโปรไฟล์ตลอดกาลโดยไม่มีอะไรฟ้อง (SRS §1.4.1)
 */
const STATUS_FAMILY_METRIC_COLUMNS: Record<string, { value: string; sample: string }> = {
  NO_SELLER_CANCEL: { value: 'sellerCancelCount90d', sample: 'orderSample90d' },
  REVIEW_REPLY: { value: 'reviewReplyRate', sample: 'reviewReplySampleSize' },
  SHIP_SPEED: { value: 'shipSpeedAvgHours', sample: 'shipSpeedSampleSize' },
  TRACKING_COVERAGE: { value: 'trackingCoverageRate', sample: 'trackingCoverageSampleSize' },
}

describe('[blocker] แคตตาล็อกจริงต้องแมปเข้าตระกูลได้ครบ', () => {
  it('เหรียญทุกใบใน seed data มีตระกูลและขั้น', () => {
    const unmapped = defaultBadges
      .filter((b) => resolveBadgeFamily(b.nameEN) === null)
      .map((b) => b.nameEN)

    expect(unmapped, `เหรียญที่แมปตระกูลไม่ได้: ${unmapped.join(', ')}`).toEqual([])
  })

  it('ตระกูลที่เหรียญอ้างถึง ต้องมีอยู่จริงในทะเบียน', () => {
    const dangling = defaultBadges
      .map((b) => ({ nameEN: b.nameEN, m: resolveBadgeFamily(b.nameEN) }))
      .filter((x) => x.m !== null && resolveFamily(x.m!.family) === null)
      .map((x) => `${x.nameEN} → ${x.m!.family}`)

    expect(dangling, `เหรียญที่ชี้ไปตระกูลที่ไม่มีในทะเบียน: ${dangling.join(', ')}`).toEqual([])
  })

  it('ขั้นที่เหรียญอ้างถึง ต้องมีอยู่จริงในตระกูลนั้น', () => {
    const bad = defaultBadges
      .map((b) => ({ nameEN: b.nameEN, m: resolveBadgeFamily(b.nameEN)! }))
      .filter((x) => x.m && !tiersOf(x.m.family).includes(x.m.tier))
      .map((x) => `${x.nameEN} → ${x.m.family} ขั้น ${x.m.tier}`)

    expect(bad, `เหรียญที่อ้างขั้นซึ่งตระกูลไม่ได้ประกาศไว้: ${bad.join(', ')}`).toEqual([])
  })

  it('ไม่มีเหรียญสองใบอยู่ตระกูลเดียวกันขั้นเดียวกัน', () => {
    const seen = new Map<string, string>()
    const dup: string[] = []
    for (const b of defaultBadges) {
      const m = resolveBadgeFamily(b.nameEN)
      if (!m) continue
      const key = `${m.family}#${m.tier}`
      const prev = seen.get(key)
      if (prev) dup.push(`${key}: ${prev} กับ ${b.nameEN}`)
      else seen.set(key, b.nameEN)
    }
    expect(dup, `ขั้นซ้ำในตระกูลเดียวกัน: ${dup.join(' · ')}`).toEqual([])
  })

  it('ขั้นที่ยังว่างอยู่คือขั้นที่รอเหรียญใหม่ของ P2 — ห้ามบีบให้เรียงติดกัน', () => {
    // เทสนี้ไม่ได้ห้ามช่องว่าง แต่ปักหมุดว่า "ช่องว่างที่มีอยู่คือช่องไหน" ไว้เป็นหลักฐาน
    // ถ้าใครไป renumber ให้ติดกัน เทสนี้จะแดงพร้อมบอกว่าขั้นไหนหายไป
    const occupied = new Map<BadgeFamilyKey, Set<number>>()
    for (const b of defaultBadges) {
      const m = resolveBadgeFamily(b.nameEN)
      if (!m) continue
      if (!occupied.has(m.family)) occupied.set(m.family, new Set())
      occupied.get(m.family)!.add(m.tier)
    }
    // ขั้นที่ประกาศไว้ในทะเบียนแต่ยังไม่มีเหรียญเดิมถือครอง = ที่ว่างสำหรับ P2
    expect([...(occupied.get('SHOP_TENURE') ?? [])].sort()).toEqual([1, 3])
    expect([...(occupied.get('ORDER_VOLUME') ?? [])].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    expect([...(occupied.get('NO_SELLER_CANCEL') ?? [])].sort()).toEqual([1, 2])
    expect([...(occupied.get('SHIP_SPEED') ?? [])].sort()).toEqual([1, 2])
    // สามตระกูลนี้ยังไม่มีเหรียญเดิมเลย — ทั้งตระกูลมาใน P2
    expect(occupied.get('REVIEW_REPLY')).toBeUndefined()
    expect(occupied.get('TRACKING_COVERAGE')).toBeUndefined()
    expect(occupied.get('REVENUE_MILESTONE')).toBeUndefined()
  })
})

describe('[blocker] allow-list ตามประเภทร้าน ต้อง fail-closed', () => {
  it('ร้านขายของเห็นหมวดหลัก 9 ตระกูล', () => {
    expect(coreFamiliesForVertical('ONLINE_SALES').sort()).toEqual(
      [
        'NO_SELLER_CANCEL',
        'ORDER_VOLUME',
        'REVENUE_MILESTONE',
        'REVIEWER_COUNT',
        'REVIEW_RATING',
        'REVIEW_REPLY',
        'SHIP_SPEED',
        'SHOP_TENURE',
        'TRACKING_COVERAGE',
      ].sort(),
    )
  })

  it('ร้านบริการและบ้านพักเห็นหมวดหลัก 7 ตระกูล (ชุดกลาง)', () => {
    const central = [
      'NO_SELLER_CANCEL',
      'ORDER_VOLUME',
      'REVENUE_MILESTONE',
      'REVIEWER_COUNT',
      'REVIEW_RATING',
      'REVIEW_REPLY',
      'SHOP_TENURE',
    ].sort()
    expect(coreFamiliesForVertical('SERVICE_QUEUE').sort()).toEqual(central)
    expect(coreFamiliesForVertical('LODGING').sort()).toEqual(central)
  })

  it('ค่าประเภทร้านที่ไม่รู้จักได้ชุดกลาง 7 ตระกูล ไม่ใช่ชุดของร้านขายของ', () => {
    for (const bogus of ['', 'GENERAL', 'ONLINE', 'online_sales', 'ร้านค้า', 'undefined']) {
      const got = coreFamiliesForVertical(bogus).sort()
      expect(got, `vertical="${bogus}" ต้องได้ชุดกลาง`).toHaveLength(7)
      expect(got, `vertical="${bogus}" ต้องไม่เห็นตระกูลของร้านขายของ`).not.toContain('SHIP_SPEED')
      expect(got).not.toContain('TRACKING_COVERAGE')
    }
    expect(coreFamiliesForVertical(null)).toHaveLength(7)
    expect(coreFamiliesForVertical(undefined)).toHaveLength(7)
  })

  it('ส่วนต่างระหว่างร้านขายของกับประเภทอื่นคือ 2 ตระกูล — ยอมรับโดยตั้งใจ', () => {
    const online = coreFamiliesForVertical('ONLINE_SALES').length
    const other = coreFamiliesForVertical('SERVICE_QUEUE').length
    expect(online - other).toBe(2)
  })

  it('หมวดประมูลไม่ถูกกรองด้วยประเภทร้าน (เป็นด่านคนละตัว)', () => {
    // การซ่อนหมวดประมูลตัดสินจาก "เคยมีกิจกรรมประมูลหรือยัง" ไม่ใช่จากประเภทร้าน
    // ถ้าวันหนึ่งมีคนย้ายมากรองที่นี่ เทสนี้จะแดงและบังคับให้กลับไปอ่าน FR-BDG-19
    expect(familiesForVertical('ONLINE_SALES')).toContain('AUCTION_HOST')
    expect(familiesForVertical('SERVICE_QUEUE')).toContain('AUCTION_BID')
  })
})

describe('[blocker] resolveSurface ต้องปลอดภัยเมื่อเจอค่าที่ไม่รู้จัก', () => {
  it('ค่าที่รู้จักคืนค่าเดิม', () => {
    expect(resolveSurface('EVIDENCE')).toBe('EVIDENCE')
    expect(resolveSurface('GOAL')).toBe('GOAL')
    expect(resolveSurface('COMMEMORATIVE')).toBe('COMMEMORATIVE')
  })

  it('ค่าที่ไม่รู้จัก ว่าง หรือ null คืน GOAL เสมอ ห้ามคืน EVIDENCE', () => {
    for (const bogus of ['', 'KEEPSAKE', 'evidence', 'PUBLIC', 'อื่น ๆ']) {
      expect(resolveSurface(bogus), `surface="${bogus}" ต้องตกไป GOAL`).toBe('GOAL')
    }
    expect(resolveSurface(null)).toBe('GOAL')
    expect(resolveSurface(undefined)).toBe('GOAL')
  })

  it('ห้ามมีคำว่า KEEPSAKE เป็นค่าที่ระบบยอมรับ', () => {
    // ค่าที่สามชื่อ COMMEMORATIVE ตาม BRD ที่ผ่านรีวิวแล้ว — KEEPSAKE เคยหลุดเข้ามาใน contract
    // ระหว่างทาง ค่าเดียวกันสองชื่อคือหนี้ที่จะถูกค้นพบตอนมีคนเขียนโค้ดตามเอกสารผิดฉบับ
    // ยืนยันปลายทางเป็น GOAL ไม่ใช่แค่ "ไม่เท่ากับ COMMEMORATIVE" — เงื่อนไขหลวมแบบนั้น
    // ยังผ่านตอนที่ fail-closed พัง (คืน EVIDENCE) ซึ่งเป็นบั๊กที่แย่กว่าเดิม
    expect(resolveSurface('KEEPSAKE')).toBe('GOAL')
    expect(Object.keys(BADGE_FAMILY_REGISTRY).every((k) => !k.includes('KEEPSAKE'))).toBe(true)
  })
})

describe('[blocker] ข้อบังคับของทะเบียน', () => {
  it('ตระกูลชนิดเหรียญสถานะ ต้องมีขนาดตัวอย่างขั้นต่ำครบทุกขั้น', () => {
    const missing: string[] = []
    for (const key of statusFamilies()) {
      const def = BADGE_FAMILY_REGISTRY[key]
      for (const tier of tiersOf(key)) {
        if (def.minSampleByTier?.[tier] === undefined) missing.push(`${key} ขั้น ${tier}`)
      }
    }
    expect(missing, `เหรียญสถานะที่ไม่มีขนาดตัวอย่างขั้นต่ำ: ${missing.join(' · ')}`).toEqual([])
  })

  it('ตระกูลชนิดเหรียญสถานะ ต้องมีคู่คอลัมน์ค่า+ตัวหารบน Shop จริง', () => {
    // ถ้าไม่มีด่านนี้ ใครประกาศตระกูลใหม่เป็น STATUS โดยลืมเพิ่มคอลัมน์
    // งานรายวันจะประเมินด้วยค่าที่ไม่มีอยู่ ⇒ เหรียญตกเป็น "ยังสรุปไม่ได้" ทุกวัน
    // โดยหน้าตาเหมือน "ยังไม่มีร้านไหนผ่านเกณฑ์" ทุกประการ ไม่มี error ไม่มีใครรายงาน
    const orphan = statusFamilies().filter((key) => !STATUS_FAMILY_METRIC_COLUMNS[key])
    expect(orphan, `ตระกูลสถานะที่ไม่มีคอลัมน์รองรับ: ${orphan.join(', ')}`).toEqual([])
  })

  it('ตระกูลชนิดเหรียญเหตุการณ์ ต้องไม่มีขนาดตัวอย่างขั้นต่ำ', () => {
    const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
    const wrong = keys.filter(
      (k) => BADGE_FAMILY_REGISTRY[k].nature === 'EVENT' && BADGE_FAMILY_REGISTRY[k].minSampleByTier !== undefined,
    )
    expect(wrong, `เหรียญเหตุการณ์ไม่ควรมีขนาดตัวอย่างขั้นต่ำ: ${wrong.join(', ')}`).toEqual([])
  })

  it('ทุกขั้นที่มี surface ต้องมีเกณฑ์คู่กัน และกลับกัน', () => {
    const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
    const bad: string[] = []
    for (const k of keys) {
      const def = BADGE_FAMILY_REGISTRY[k]
      const s = Object.keys(def.surfaceByTier).sort()
      const t = Object.keys(def.thresholdByTier).sort()
      if (s.join(',') !== t.join(',')) bad.push(`${k}: surface[${s}] vs threshold[${t}]`)
    }
    expect(bad, `ขั้นที่มีข้างเดียว: ${bad.join(' · ')}`).toEqual([])
  })

  it('ตระกูลยอดที่ลูกค้าจ่าย ห้ามขึ้นหน้าสาธารณะแม้แต่ขั้นเดียว', () => {
    const surfaces = Object.values(BADGE_FAMILY_REGISTRY.REVENUE_MILESTONE.surfaceByTier)
    expect(surfaces.every((s) => s === 'GOAL'), `ได้ ${surfaces.join(',')}`).toBe(true)
  })

  it('เหรียญที่ระลึกมีตระกูลเดียวและเป็น COMMEMORATIVE', () => {
    const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
    const commemorative = keys.filter((k) =>
      Object.values(BADGE_FAMILY_REGISTRY[k].surfaceByTier).includes('COMMEMORATIVE'),
    )
    expect(commemorative).toEqual(['FOUNDING_MEMBER'])
  })

  it('เหรียญบุคคลต้องไม่ผูกกับประเภทร้าน', () => {
    const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
    const wrong = keys.filter(
      (k) => BADGE_FAMILY_REGISTRY[k].ownerScope === 'USER' && BADGE_FAMILY_REGISTRY[k].verticals.length > 0,
    )
    expect(wrong, `เหรียญบุคคลที่ผูกประเภทร้าน: ${wrong.join(', ')}`).toEqual([])
  })

  it('ทุกตระกูลมีชื่อไทยที่ไม่ซ้ำกัน', () => {
    const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
    const labels = keys.map((k) => BADGE_FAMILY_REGISTRY[k].labelTH)
    expect(labels.every((l) => l.length > 0)).toBe(true)
    expect(new Set(labels).size, 'ชื่อไทยของตระกูลซ้ำกัน').toBe(labels.length)
  })
})

describe('[blocker] ขั้นของเหรียญที่ปล่อยไปแล้วห้ามขยับ (snapshot)', () => {
  it('ปักหมุดตระกูลและขั้นของทั้ง 31 ใบ', () => {
    // ตารางนี้คือสัญญากับร้านที่ถือเหรียญอยู่ — การขยับเลขคือการแก้ความหมายของเหรียญ
    // ที่เขาได้มาแล้ว โดยที่เขาไม่ได้ทำอะไรผิด (BR-BDG-09)
    const snapshot = defaultBadges
      .map((b) => {
        const m = resolveBadgeFamily(b.nameEN)!
        return `${b.nameEN}=${m.family}#${m.tier}`
      })
      .sort()

    expect(snapshot).toMatchInlineSnapshot(`
      [
        "2026_BADGE=FOUNDING_MEMBER#1",
        "3 Months Strong=SHOP_TENURE#1",
        "Active Bidder=AUCTION_BID#2",
        "Auction Closer 10=AUCTION_CLOSE#2",
        "Auction Completer=AUCTION_COMPLETE#1",
        "Auction Host 10=AUCTION_HOST#2",
        "Auction Pro 50=AUCTION_CLOSE#3",
        "Auction Watcher=AUCTION_ENGAGE#2",
        "Bid Cheerer=AUCTION_ENGAGE#1",
        "Bid Magnet=AUCTION_HYPE#1",
        "Century Club=ORDER_VOLUME#5",
        "Community Favorite=REVIEWER_COUNT#2",
        "First Auction Win=AUCTION_CLOSE#1",
        "First Auctioneer=AUCTION_HOST#1",
        "First Bidder=AUCTION_BID#1",
        "First Sale=ORDER_VOLUME#1",
        "First Winner=AUCTION_WIN#1",
        "Fully Verified=IDENTITY_VERIFIED#1",
        "Getting Noticed=REVIEWER_COUNT#1",
        "Getting Started=ORDER_VOLUME#2",
        "Highly Rated=REVIEW_RATING#2",
        "Perfect Rating=REVIEW_RATING#3",
        "Rising Seller=ORDER_VOLUME#3",
        "Same-Day Hero=SHIP_SPEED#2",
        "Speed Demon=SHIP_SPEED#1",
        "Spotless 100=NO_SELLER_CANCEL#2",
        "Trusted Seller 50=ORDER_VOLUME#4",
        "Veteran=SHOP_TENURE#3",
        "Well Rated=REVIEW_RATING#1",
        "Winner's Circle=AUCTION_WIN#2",
        "Zero Complaint=NO_SELLER_CANCEL#1",
      ]
    `)
  })
})
