// pricing.test.ts — [blocker] ด่านกันเก็บเงินด้วยราคาที่ยังไม่มีมติ (feature 00060 · T4)

import { describe, expect, it, afterEach, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  INSPECTION_MONTHLY_PRICE_BAHT,
  INSPECTION_PRICING_IS_DRAFT,
  INSPECTION_SETUP_FEE_BAHT,
  INSPECTION_TERMS_PATH,
  InspectionPricingDraftError,
  assertInspectionPricingDecided,
  renewChargeBaht,
  subscribeChargeBaht,
  upgradeChargeBaht,
} from './pricing'

const withNodeEnv = (value: string, fn: () => void) => {
  vi.stubEnv('NODE_ENV', value)
  try {
    fn()
  } finally {
    vi.unstubAllEnvs()
  }
}

describe('[blocker] ราคาที่ยังไม่เคาะต้องเรียกเก็บบนของจริงไม่ได้', () => {
  afterEach(() => {
    expect(process.env.NODE_ENV).not.toBe('production')
  })

  it('🛑 mutation: ถอด `assertInspectionPricingDecided` หรือทำให้มันไม่ throw → เคสนี้ต้องแดง', () => {
    withNodeEnv('production', () => {
      expect(() => assertInspectionPricingDecided()).toThrow(InspectionPricingDraftError)
    })
  })

  it('นอก production ต้องผ่าน — dev/เทสต้องเดินเส้นทางเก็บเงินให้ครบเพื่อพิสูจน์ว่ามันถูก', () => {
    withNodeEnv('test', () => {
      expect(() => assertInspectionPricingDecided()).not.toThrow()
    })
  })

  it('ธงร่างยังเป็น true — วันที่เคาะราคาแล้วเทสข้อนี้จะแดงเพื่อเตือนให้ทบทวนทั้งไฟล์', () => {
    // 🛑 นี่ไม่ใช่เทสที่ "ยืนยันว่ายังไม่เสร็จ" แต่เป็นตัวบังคับให้การปลดล็อกราคาเป็นการกระทำ
    //    ที่ตั้งใจและมองเห็นได้ใน diff ไม่ใช่ผลข้างเคียงของงานอื่น
    expect(INSPECTION_PRICING_IS_DRAFT).toBe(true)
  })
})

describe('[blocker] เวอร์ชันเงื่อนไขต้องอ่านย้อนหลังได้จริง', () => {
  it('🛑 mutation: เปลี่ยน INSPECTION_TERMS_PATH ให้ชี้ไฟล์ที่ไม่มี → เคสนี้ต้องแดง', () => {
    // เวอร์ชันที่ย้อนกลับไปอ่านข้อความไม่ได้ = ไม่มีเวอร์ชัน ⇒ ตอนร้านทักท้วงเรื่องค่าตรวจ
    // เราจะตอบไม่ได้ว่า "วันนั้นเขาเห็นอะไร" ซึ่งเป็นเหตุผลทั้งหมดที่คอลัมน์นั้นมีอยู่
    expect(existsSync(join(process.cwd(), INSPECTION_TERMS_PATH))).toBe(true)
  })
})

describe('สูตรค่าใช้จ่าย', () => {
  it('สมัคร = ค่าเดือน + ค่าแรกเข้า · ต่ออายุ = ค่าเดือนอย่างเดียว', () => {
    expect(subscribeChargeBaht(4)).toBe(INSPECTION_MONTHLY_PRICE_BAHT[4] + INSPECTION_SETUP_FEE_BAHT[4])
    expect(renewChargeBaht(4)).toBe(INSPECTION_MONTHLY_PRICE_BAHT[4])
    // 🛑 ค่าแรกเข้าเก็บครั้งเดียวตลอด — ถ้าต่ออายุเก็บด้วย ร้านขั้น 4 จะถูกเก็บ ฿3,900 ทุกเดือน
    expect(renewChargeBaht(4)).not.toBe(subscribeChargeBaht(4))
  })

  it('🛑 mutation: ให้ upgradeChargeBaht คืนค่าเดือนเต็มของขั้นใหม่ → เคสนี้ต้องแดง', () => {
    // อัปเกรดกลางรอบต้องไม่เก็บค่าเดือนซ้ำกับที่จ่ายไปแล้ว — เก็บเฉพาะส่วนต่าง
    expect(upgradeChargeBaht(2, 3)).toBe(
      INSPECTION_MONTHLY_PRICE_BAHT[3] - INSPECTION_MONTHLY_PRICE_BAHT[2],
    )
    expect(upgradeChargeBaht(2, 3)).not.toBe(INSPECTION_MONTHLY_PRICE_BAHT[3])
  })

  it('อัปเกรดเข้าขั้น 4 ต้องบวกค่าแรกเข้าที่ยังไม่เคยจ่าย', () => {
    expect(upgradeChargeBaht(3, 4)).toBe(
      INSPECTION_MONTHLY_PRICE_BAHT[4] - INSPECTION_MONTHLY_PRICE_BAHT[3] + INSPECTION_SETUP_FEE_BAHT[4],
    )
  })

  it('🛑 mutation: ถอด Math.max ทิ้ง แล้วปล่อยให้ผลลบหักล้างกัน → เคสนี้ต้องแดง', () => {
    // ถ้าอนาคตมีขั้นที่ค่าเดือนถูกลงแต่มีค่าแรกเข้า การหักล้างจะทำให้เก็บเงินติดลบ
    // (deductCredit ปฏิเสธ amount<=0 ⇒ อัปเกรดฟรีเงียบ ๆ)
    expect(upgradeChargeBaht(4, 4)).toBe(0)
    expect(upgradeChargeBaht(4, 3)).toBe(0)
  })
})
