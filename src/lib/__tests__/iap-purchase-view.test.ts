/**
 * ตัดสินว่า "หน้าแพ็กเกจ" ต้องแสดงอะไร เมื่อเปิดจากในแอป iOS (feature 00064)
 *
 * ## ทางกลางที่เลือก (user เคาะ 2026-09-08)
 *
 * หน้าเดียวกันกับเว็บ แต่ **แหล่งราคาต่างกัน** — ในแอปราคามาจาก StoreKit (249/899/1,990)
 * บนเว็บมาจากกระเป๋าเงิน (159/599/1,299) · ไม่แยกหน้าจอเป็น native เพราะข้อมูล tier
 * (ชื่อ · โควตา · สิทธิ์) จะกลายเป็นสองชุดทันทีและวันหนึ่งจะไม่ตรงกัน
 *
 * ## 🛑 กฎที่แพงที่สุดในไฟล์นี้: TC-IAP-45
 *
 * *"ผู้ใช้ที่มีสิทธิ์จากกระเป๋าเงินอยู่ เปิดแอป → **ไม่เห็นปุ่มซื้อ**"*
 *
 * เขาจ่ายผ่านเว็บอยู่แล้ว ถ้าเห็นปุ่มซื้อแล้วกด = **จ่ายสองทางพร้อมกัน** ซึ่งเป็นสิ่งที่ทั้ง
 * ฟีเจอร์นี้สร้างมาเพื่อป้องกัน · เซิร์ฟเวอร์ปฏิเสธไว้อีกชั้น (`WALLET_SUBSCRIPTION_EXISTS`)
 * แต่ผู้ใช้จะเจอ error หลังจ่ายเงินไปแล้ว ซึ่งสายเกินไป ⇒ ต้องไม่โชว์ปุ่มตั้งแต่แรก
 *
 * 🛑 ด่านนี้ต้องมาก่อนการโหลดราคา — คนที่จ่ายผ่านกระเป๋าเงินต้องไม่เห็นปุ่มซื้อ **แม้ตอนที่
 * ถามราคาจาก StoreKit ไม่สำเร็จ** ไม่งั้นจอ error จะกลายเป็นทางลัดให้เห็นปุ่มซื้อ
 */
import { describe, expect, it } from 'vitest'

import { resolveAppPurchaseView } from '@/lib/iap-purchase-view'
import type { IapProduct } from '@/lib/iap-bridge-protocol'

const PRODUCTS: IapProduct[] = [
  { productId: 'com.deepthailand.seller.pkg.growth', displayName: 'Growth', displayPrice: '฿249' },
  { productId: 'com.deepthailand.seller.pkg.pro', displayName: 'Pro', displayPrice: '฿899' },
  { productId: 'com.deepthailand.seller.pkg.business', displayName: 'Business', displayPrice: '฿1,990' },
]
const okProducts = { ok: true as const, products: PRODUCTS }
const failed = { ok: false as const, reason: 'UNAVAILABLE' as const }

describe('นอกแอป — ต้องไม่แตะของเดิมเลย', () => {
  it('เว็บบนเบราว์เซอร์ → `web` เสมอ', () => {
    expect(resolveAppPurchaseView({ shell: 'web', subscription: null, products: okProducts })).toEqual({ kind: 'web' })
  })

  it('🛑 แอป Android ก็ `web` — Google Play ยังไม่ได้ทำ อย่าเผลอเปิดให้', () => {
    expect(
      resolveAppPurchaseView({ shell: 'android', subscription: null, products: okProducts }),
    ).toEqual({ kind: 'web' })
  })
})

describe('🛑 TC-IAP-45 — คนที่จ่ายผ่านกระเป๋าเงินอยู่แล้ว', () => {
  it('ใบ WALLET ที่ยังใช้งานอยู่ → `wallet` ไม่มีปุ่มซื้อ', () => {
    expect(
      resolveAppPurchaseView({
        shell: 'ios',
        subscription: { source: 'WALLET', status: 'ACTIVE', tier: 'GROWTH' },
        products: okProducts,
      }),
    ).toEqual({ kind: 'wallet', tier: 'GROWTH' })
  })

  it('🛑 ใบ WALLET ที่ถูกล็อก → ก็ยัง `wallet` — ซื้อทับ = จ่ายสองทาง', () => {
    expect(
      resolveAppPurchaseView({
        shell: 'ios',
        subscription: { source: 'WALLET', status: 'LOCKED_RENEWAL_FAILED', tier: 'PRO' },
        products: okProducts,
      }),
    ).toEqual({ kind: 'wallet', tier: 'PRO' })
  })

  it('🛑 ถามราคาไม่สำเร็จ → ยังต้องเป็น `wallet` ไม่ใช่จอ error ที่มีปุ่มซื้อ', () => {
    expect(
      resolveAppPurchaseView({
        shell: 'ios',
        subscription: { source: 'WALLET', status: 'ACTIVE', tier: 'GROWTH' },
        products: failed,
      }),
    ).toEqual({ kind: 'wallet', tier: 'GROWTH' })
  })
})

describe('คนที่ซื้อผ่าน Apple ไปแล้ว', () => {
  it('ใบ APPLE_IAP ที่ใช้งานอยู่ → `apple` (จัดการ/กู้คืน ไม่ใช่ซื้อใหม่)', () => {
    expect(
      resolveAppPurchaseView({
        shell: 'ios',
        subscription: { source: 'APPLE_IAP', status: 'ACTIVE', tier: 'PRO' },
        products: okProducts,
      }),
    ).toEqual({ kind: 'apple', tier: 'PRO', products: PRODUCTS })
  })

  it('ใบ APPLE_IAP ที่ถูกล็อก → ยัง `apple` · ต้องเปลี่ยน tier / กู้คืนได้', () => {
    expect(
      resolveAppPurchaseView({
        shell: 'ios',
        subscription: { source: 'APPLE_IAP', status: 'LOCKED_RENEWAL_FAILED', tier: 'GROWTH' },
        products: okProducts,
      }),
    ).toMatchObject({ kind: 'apple', tier: 'GROWTH' })
  })
})

describe('คนที่ยังไม่มีแพ็กเกจ', () => {
  it('ได้ราคาครบ → `buy` พร้อมสินค้าจาก StoreKit', () => {
    expect(
      resolveAppPurchaseView({ shell: 'ios', subscription: null, products: okProducts }),
    ).toEqual({ kind: 'buy', products: PRODUCTS })
  })

  it('🛑 ถามราคาไม่ได้ → `unavailable` **ห้ามใช้ราคาที่เราเขียนไว้แทน**', () => {
    /* ราคาเว็บคือ 159/599/1,299 แต่ในแอปคือ 249/899/1,990 — เอาราคาเว็บมาโชว์ =
       ผู้ใช้เห็น 159 แล้วโดนตัดจริง 249 · Apple ก็ตรวจข้อนี้ตรง ๆ (TC-IAP-40) */
    expect(
      resolveAppPurchaseView({ shell: 'ios', subscription: null, products: failed }),
    ).toEqual({ kind: 'unavailable', reason: 'UNAVAILABLE' })
  })

  it('ราคายังโหลดไม่เสร็จ → `loading` ไม่ใช่ `unavailable`', () => {
    expect(
      resolveAppPurchaseView({ shell: 'ios', subscription: null, products: null }),
    ).toEqual({ kind: 'loading' })
  })

  it('🛑 StoreKit คืนรายการว่าง → `unavailable` ไม่ใช่ `buy` ที่ว่างเปล่า', () => {
    /* รายการว่าง = สินค้ายังไม่ผ่านรีวิว หรือรหัสสะกดไม่ตรง — จอที่มีหัวข้อแต่ไม่มีอะไรให้กด
       ทำให้ผู้ใช้ (และคนตรวจของ Apple) คิดว่าแอปพัง */
    expect(
      resolveAppPurchaseView({ shell: 'ios', subscription: null, products: { ok: true, products: [] } }),
    ).toEqual({ kind: 'unavailable', reason: 'UNAVAILABLE' })
  })
})

describe('🛑 ลำดับการตัดสินใจห้ามสลับ', () => {
  it('สถานะบัญชีต้องมาก่อนสถานะราคาเสมอ', () => {
    /* ถ้าเช็กราคาก่อน คนที่จ่ายผ่านกระเป๋าเงินจะตกไปอยู่ `loading`/`unavailable`
       ซึ่งเป็นจอที่ **มีปุ่มลองใหม่** — กดแล้ววนไปเจอปุ่มซื้อได้ */
    for (const products of [null, failed, okProducts]) {
      expect(
        resolveAppPurchaseView({
          shell: 'ios',
          subscription: { source: 'WALLET', status: 'ACTIVE', tier: 'GROWTH' },
          products,
        }).kind,
      ).toBe('wallet')
    }
  })
})
