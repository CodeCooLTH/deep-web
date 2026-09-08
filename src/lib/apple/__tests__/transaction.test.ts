import { describe, expect, it } from 'vitest'

import { readAppleSubscription, type AppleTransactionPayload } from '@/lib/apple/transaction'
import {
  ALL_APPLE_PRODUCT_IDS,
  APPLE_PRODUCT_TO_TIER,
  SELLER_APP_BUNDLE_ID,
  TIER_TO_APPLE_PRODUCT,
  tierFromAppleProductId,
} from '@/lib/apple/product-ids'
import { BUSINESS_PACKAGE_TIER_CONFIG } from '@/lib/business-package'

const EXPIRES = Date.UTC(2026, 9, 1)

/** ธุรกรรมที่ถูกต้องทุกอย่าง — แต่ละเทสค่อยทำให้พังทีละจุด */
const good = (over: Partial<AppleTransactionPayload> = {}): AppleTransactionPayload => ({
  bundleId: SELLER_APP_BUNDLE_ID,
  productId: 'com.deepthailand.seller.pkg.growth',
  originalTransactionId: '2000000123',
  transactionId: '2000000124',
  expiresDate: EXPIRES,
  environment: 'Production',
  type: 'Auto-Renewable Subscription',
  inAppOwnershipType: 'PURCHASED',
  ...over,
})

/**
 * ด่าน — "ลายเซ็นถูก" ยังไม่พอที่จะให้สิทธิ์ (feature 00064)
 *
 * 🛑 ใบรับรองของ Apple ใบเดียวกัน **เซ็นให้ทุกแอปในโลก** ⇒ ธุรกรรมที่ลายเซ็นถูกต้องสมบูรณ์
 * อาจเป็นของแอปอื่นก็ได้ · คนที่ซื้ออะไรก็ได้ในแอปไหนก็ได้ แล้วเอา JWS นั้นมายิงใส่เรา
 * จะได้ Business Package ฟรีถ้าเราไม่ตรวจ `bundleId`
 */
describe('[blocker] ตรวจธุรกรรมของ Apple ก่อนให้สิทธิ์', () => {
  it('🛑 ธุรกรรมปกติ → ผ่าน และแปลงค่าครบถูกต้อง', () => {
    const r = readAppleSubscription(good())
    expect(r.ok, r.ok ? '' : `ถูกปฏิเสธ: ${r.reason}`).toBe(true)
    if (!r.ok) return
    expect(r.facts.tier).toBe('GROWTH')
    expect(r.facts.originalTransactionId).toBe('2000000123')
    expect(r.facts.environment).toBe('Production')
    /* 🛑 Apple ส่ง epoch **มิลลิวินาที** — ตีเป็นวินาทีจะเพี้ยนไปราว 50 ปี */
    expect(r.facts.expiresAt.getTime()).toBe(EXPIRES)
    expect(r.facts.revokedAt).toBeNull()
  })

  it('🛑 ธุรกรรมของแอปอื่น (bundleId ไม่ตรง) → ปฏิเสธ', () => {
    for (const bad of ['com.example.other', 'com.deepthailand.buyer', '', null, undefined]) {
      const r = readAppleSubscription(good({ bundleId: bad }))
      expect(r.ok, `bundleId=${String(bad)} ต้องถูกปฏิเสธ`).toBe(false)
      if (!r.ok) expect(r.reason).toBe('BUNDLE_MISMATCH')
    }
  })

  it('🛑 bundleId ต้องตรงกับแอปผู้ขายจริง ไม่ใช่ค่าที่พิมพ์เอง', () => {
    /* ปักหมุดค่าไว้ — ต้องตรงกับ `ios.bundleIdentifier` ใน deep-seller-app/app.config.ts
       ถ้าวันหนึ่งย้ายไปบัญชี developer ใหม่แล้วเปลี่ยน bundle id ต้องมาแก้ที่นี่ด้วย */
    expect(SELLER_APP_BUNDLE_ID).toBe('com.deepthailand.seller')
  })

  it('🛑 productId ที่ไม่รู้จัก → ปฏิเสธ ไม่ใช่เดาเป็น tier ต่ำสุด', () => {
    /* เดาให้ = แจกของฟรีเมื่อมีคนสร้างสินค้าใน ASC โดยไม่แก้โค้ด */
    for (const bad of ['com.deepthailand.seller.pkg.unknown', 'random', '', null, undefined]) {
      expect(tierFromAppleProductId(bad), `${String(bad)} ต้องไม่ได้ tier`).toBeNull()
      const r = readAppleSubscription(good({ productId: bad }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('UNKNOWN_PRODUCT')
    }
  })

  it('🛑 Family Sharing → ปฏิเสธ (1 การสมัครห้ามเปิดสิทธิ์ให้ 6 บัญชี)', () => {
    const r = readAppleSubscription(good({ inAppOwnershipType: 'FAMILY_SHARED' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('FAMILY_SHARED')
  })

  it('🛑 ไม่ใช่ auto-renewable subscription → ปฏิเสธ', () => {
    const r = readAppleSubscription(good({ type: 'Consumable' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('NOT_SUBSCRIPTION')
  })

  it('🛑 ไม่มี expiresDate → ปฏิเสธ (subscription ต้องมีวันหมดอายุเสมอ)', () => {
    /* ปล่อยผ่าน = ได้ nextRenewalAt ที่ไม่มีความหมาย แล้วสิทธิ์จะไม่มีวันหมด */
    for (const bad of [undefined, null, 0, -1, 'ไม่ใช่ตัวเลข', NaN]) {
      const r = readAppleSubscription(good({ expiresDate: bad }))
      expect(r.ok, `expiresDate=${String(bad)} ต้องถูกปฏิเสธ`).toBe(false)
      if (!r.ok) expect(r.reason).toBe('NO_EXPIRY')
    }
  })

  it('🛑 environment ต้องเป็น Production หรือ Sandbox เท่านั้น', () => {
    const r = readAppleSubscription(good({ environment: 'Staging' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('BAD_ENVIRONMENT')
  })

  it('🛑 Sandbox ต้อง **ผ่าน** — คนตรวจของ Apple ซื้อผ่าน Sandbox เสมอ', () => {
    /**
     * 🛑 ปฏิเสธ Sandbox = คนตรวจกดซื้อไม่สำเร็จ = ถูกตีกลับ และเราจะทดสอบเอง
     * ผ่าน TestFlight ก็ไม่ได้ด้วย · ความเสี่ยง (ซื้อฟรีใน Sandbox) รับไว้อย่างรู้ตัว
     * และทอนด้วยการบันทึก `appleEnvironment` ไว้ทุกแถวเพื่อตรวจย้อนหลัง
     */
    const r = readAppleSubscription(good({ environment: 'Sandbox' }))
    expect(r.ok, 'Sandbox ต้องผ่าน ไม่งั้นรีวิวไม่ผ่าน').toBe(true)
    if (r.ok) expect(r.facts.environment).toBe('Sandbox')
  })

  it('🛑 มี revocationDate → ต้องอ่านออกมาได้ (เอาไปถอนสิทธิ์)', () => {
    const revoked = Date.UTC(2026, 8, 15)
    const r = readAppleSubscription(good({ revocationDate: revoked }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.facts.revokedAt?.getTime()).toBe(revoked)
  })

  it('🛑 ไม่มี originalTransactionId → ปฏิเสธ (ไม่มีกุญแจให้จับคู่ webhook)', () => {
    const r = readAppleSubscription(good({ originalTransactionId: undefined }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('MISSING_IDS')
  })
})

describe('[blocker] รหัสสินค้าต้องครบและตรงกันสองทาง', () => {
  it('🛑 ทุก tier ต้องมีรหัสสินค้า และแมปกลับได้ตรงกัน', () => {
    /* ตกไปตัวเดียว = tier นั้นซื้อในแอปไม่ได้เลย โดยที่ tsc ไม่ฟ้อง (Record บังคับคีย์ครบ
       แต่ไม่ได้บังคับว่าค่าที่ใส่ต้องแมปกลับมาได้) */
    for (const tier of Object.keys(BUSINESS_PACKAGE_TIER_CONFIG) as (keyof typeof BUSINESS_PACKAGE_TIER_CONFIG)[]) {
      const pid = TIER_TO_APPLE_PRODUCT[tier]
      expect(pid, `tier ${tier} ไม่มีรหัสสินค้า`).toBeTruthy()
      expect(tierFromAppleProductId(pid), `${pid} แมปกลับไม่ได้ tier เดิม`).toBe(tier)
    }
  })

  it('🛑 รหัสห้ามซ้ำกัน และต้องครบเท่ากันทั้งสองตาราง', () => {
    const ids = Object.values(TIER_TO_APPLE_PRODUCT)
    expect(new Set(ids).size, 'มีรหัสซ้ำ = สอง tier ชี้สินค้าเดียวกัน').toBe(ids.length)
    expect(new Set(ALL_APPLE_PRODUCT_IDS)).toEqual(new Set(Object.keys(APPLE_PRODUCT_TO_TIER)))
    expect(ids.length).toBe(Object.keys(APPLE_PRODUCT_TO_TIER).length)
  })
})
