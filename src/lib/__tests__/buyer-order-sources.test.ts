/**
 * [blocker] meta-test ของ helper อ่านซอร์สหน้าคำสั่งซื้อผู้ซื้อ — feature 00068 TD-006
 *
 * fail-closed: .tsx ใหม่ใน `o/[token]/` ที่ไม่ถูกจัดเข้า allow-list หรือ excluded ⇒ แดง
 * (กันการ์ดย่อยตัวใหม่หลุดจากด่านสแกนซอร์สเงียบ ๆ)
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BUYER_ORDER_DIR, BUYER_ORDER_EXCLUDED, BUYER_ORDER_FILES } from './helpers/buyer-order-sources'

describe('[blocker] buyer-order-sources', () => {
  it('ทุก .tsx ในโฟลเดอร์ต้องอยู่ใน allow-list หรือ excluded อย่างใดอย่างหนึ่ง', () => {
    const tsx = readdirSync(BUYER_ORDER_DIR).filter((f) => f.endsWith('.tsx'))
    expect(tsx.length).toBeGreaterThan(0)
    const unclassified = tsx.filter((f) => !BUYER_ORDER_FILES.includes(f) && !(f in BUYER_ORDER_EXCLUDED))
    expect(unclassified, 'จัดไฟล์เหล่านี้เข้า BUYER_ORDER_FILES หรือ BUYER_ORDER_EXCLUDED (พร้อมเหตุผล)').toEqual([])
    const both = BUYER_ORDER_FILES.filter((f) => f in BUYER_ORDER_EXCLUDED)
    expect(both, 'อยู่ทั้งสองลิสต์ไม่ได้').toEqual([])
  })

  it('ทุกชื่อในสองลิสต์ต้องมีไฟล์จริง และ excluded ต้องมีเหตุผล', () => {
    for (const f of [...BUYER_ORDER_FILES, ...Object.keys(BUYER_ORDER_EXCLUDED)]) {
      expect(existsSync(join(BUYER_ORDER_DIR, f)), `${f} ไม่มีไฟล์จริง`).toBe(true)
    }
    for (const [f, why] of Object.entries(BUYER_ORDER_EXCLUDED)) {
      expect(why.trim().length, `${f} ต้องมีเหตุผล`).toBeGreaterThan(5)
    }
    expect(BUYER_ORDER_FILES).toContain('OrderDetailMobile.tsx')
  })
})
