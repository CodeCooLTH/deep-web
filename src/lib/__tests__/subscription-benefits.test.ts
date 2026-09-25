/**
 * [blocker] จอขายแพ็กเกจในแอปต้องบอกว่า "จ่ายแล้วได้อะไร" (2026-09-25)
 *
 * ## ที่มา — Apple ตีกลับ 2026-09-24 · Guideline 3.1.2(c)
 *
 * > *"The app uses auto-renewable subscriptions, but it does not clearly describe
 * >  what the user will receive for the price."*
 *
 * รีวิวบน iPad Air 11" (M3) · ภาพหน้าจอที่เขาแนบมาคือจอแพ็กเกจที่มีแค่
 * **ชื่อ + ราคา + ปุ่มสมัคร** ⇒ ผู้ซื้อแยกไม่ออกว่า Growth / Pro / Business ต่างกันตรงไหน
 *
 * 🛑 ของที่ขาดไม่ใช่ "ยังไม่ได้เขียน" — คำบรรยายชุดนี้ **มีอยู่แล้ว** ตั้งแต่ feature 00008
 * แต่ถูกขังไว้ในฟังก์ชันภายในของ `PackageTierGrid.tsx` (กริดฝั่งเว็บ) จอในแอปจึงไม่มีทางเรียกใช้
 * ⇒ ย้ายเป็น SSOT ที่ `lib/business-package` แล้วให้ทั้งสองจอเรียกตัวเดียวกัน (Hard Rule 16)
 *
 * เทสนี้จึงคุม 2 เรื่องคู่กัน: **คำถูก** และ **จอในแอปเรียกใช้จริง** — เพราะโค้ดที่ถูกทุกบรรทัด
 * แต่ไม่มีใครเรียก คือรูปร่างของบั๊กเดิมเป๊ะ ๆ
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  featuresForTier,
  tierQuotaFeatures,
  type BusinessPackageTier,
} from '@/lib/business-package'

const IAP_SCREEN =
  'src/app/(paces)/seller/(dashboard)/business/subscribe/components/IapSubscribeClient.tsx'
const WEB_GRID = 'src/app/(paces)/seller/(dashboard)/business/components/PackageTierGrid.tsx'

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์พวกนี้อ้างชื่อฟังก์ชัน/ข้อความในคำอธิบายบั๊กของตัวเอง */
function code(rel: string): string {
  return readFileSync(rel, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const TIERS: BusinessPackageTier[] = ['GROWTH', 'PRO', 'BUSINESS']

describe('[blocker] คำบรรยายสิทธิ์ต้องตรงกับโควตาจริงของ tier', () => {
  it('🛑 ทุก tier ต้องบอกจำนวนธุรกิจและผู้ดูแลตามค่าใน SSOT', () => {
    for (const tier of TIERS) {
      const c = BUSINESS_PACKAGE_TIER_CONFIG[tier]
      const features = featuresForTier(tier)
      const expectShops = c.maxBusinesses === null ? 'ไม่จำกัด' : String(c.maxBusinesses)
      const expectAdmins = c.maxAdminsPerBusiness === null ? 'ไม่จำกัด' : String(c.maxAdminsPerBusiness)
      /**
       * 🛑 ต้องเช็ก **รายบรรทัด** ไม่ใช่ `features.join(' ')`
       *
       * ร่างแรกเช็คจากก้อนที่ต่อกัน แล้ว mutation พิสูจน์ว่าจับไม่ได้: พอเปลี่ยนบรรทัดจำนวนธุรกิจ
       * เป็นข้อความคงที่ ("สร้างได้หลายธุรกิจ") เทสยังเขียว เพราะเลข `1` ของ GROWTH ไปแมตช์เอา
       * บรรทัด "1 ผู้ดูแลต่อธุรกิจ" แทน — คนละบรรทัดกับที่ตั้งใจตรวจ
       */
      const shopLine = features.find((f) => f.includes('ธุรกิจ') && !f.includes('ผู้ดูแล'))
      const adminLine = features.find((f) => f.includes('ผู้ดูแล'))
      expect(shopLine, `${tier}: ไม่มีบรรทัดบอกจำนวนธุรกิจ`).toBeDefined()
      expect(adminLine, `${tier}: ไม่มีบรรทัดบอกจำนวนผู้ดูแล`).toBeDefined()
      expect(shopLine!, `${tier}: บรรทัดธุรกิจไม่ได้บอกจำนวนจริง (${expectShops})`).toContain(expectShops)
      expect(adminLine!, `${tier}: บรรทัดผู้ดูแลไม่ได้บอกจำนวนจริง (${expectAdmins})`).toContain(expectAdmins)
      expect(features.length, `${tier}: ต้องมีอย่างน้อย 2 ข้อ ไม่งั้นบอกไม่พอว่าได้อะไร`).toBeGreaterThanOrEqual(2)
    }
  })

  /**
   * 🛑 ตัวที่จับ "คืนค่าคงที่ให้ทุก tier" — ถ้าไม่มีเคสนี้ การเปลี่ยนฟังก์ชันให้คืนข้อความ
   * เดียวกันหมดจะยังเขียว ทั้งที่ผู้ซื้อกลับมาแยกสามแพ็กเกจไม่ออกเหมือนก่อนแก้
   */
  it('🛑 สามแพ็กเกจต้องบรรยายไม่เหมือนกัน', () => {
    const sets = TIERS.map((t) => featuresForTier(t).join('|'))
    expect(new Set(sets).size, `ได้คำเหมือนกัน: ${sets[0]}`).toBe(TIERS.length)
  })

  it('การ์ด Free (0 ธุรกิจ) ใช้คำคนละชุด — ไม่ใช่ "สร้างได้ 0 ธุรกิจ"', () => {
    const free = tierQuotaFeatures(0, null)
    expect(free.join(' ')).not.toContain('สร้างได้ 0')
    expect(free.join(' ')).toContain('Personal shop')
  })
})

describe('[blocker] จอในแอปต้องเรียกใช้จริง ไม่ใช่แค่มีฟังก์ชัน', () => {
  it('🛑 IapSubscribeClient ต้องเรนเดอร์สิทธิ์จาก SSOT', () => {
    const src = code(IAP_SCREEN)
    expect(src, 'ไม่ได้ import จาก SSOT').toMatch(/featuresForTier/)
    expect(
      src,
      'เรียกแล้วต้องเอามาเรนเดอร์ด้วย — import เฉย ๆ คือบั๊กเดิมที่ Apple ตีกลับ',
    ).toMatch(/featuresForTier\(tier\)\.map\(/)
  })

  it('🛑 การ์ดต้องรู้จัก tier ของตัวเอง (ไม่งั้นเรนเดอร์สิทธิ์ไม่ได้)', () => {
    const src = code(IAP_SCREEN)
    expect(src).toMatch(/tier=\{tier\}/)
  })

  it('🛑 ห้ามก็อปข้อความสิทธิ์ไปเขียนซ้ำในจอ — ต้องมาจาก SSOT ที่เดียว (HR16)', () => {
    const src = code(IAP_SCREEN)
    for (const phrase of ['ผู้ดูแลต่อธุรกิจ', 'สร้างได้', 'Personal shop']) {
      expect(src, `พบข้อความสิทธิ์ฝังในจอ: ${phrase}`).not.toContain(phrase)
    }
  })

  it('🛑 กริดฝั่งเว็บต้องเลิกถือคำของตัวเอง — ไม่งั้นสองจอ drift จากกันได้', () => {
    const src = code(WEB_GRID)
    expect(src, 'ยังประกาศฟังก์ชันคำบรรยายเองอยู่').not.toMatch(/function quotaFeatures\s*\(/)
    expect(src).toMatch(/tierQuotaFeatures\(/)
  })
})
