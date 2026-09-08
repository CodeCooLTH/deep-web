/**
 * apple/product-ids — SSOT ของ "รหัสสินค้าใน App Store Connect ↔ tier ของเรา" (feature 00064)
 *
 * Pure module — ห้าม import service/prisma (ใช้ได้ทั้ง client และ server)
 *
 * ── 🛑 ไฟล์นี้เป็นสัญญากับของที่อยู่นอกรีโป ────────────────────────────────────
 *
 * รหัสพวกนี้ **เราเป็นคนตั้งเอง** แล้วต้องไปสร้างใน App Store Connect ให้ตรงกันเป๊ะ
 * ถ้าสะกดไม่ตรงแม้ตัวเดียว StoreKit จะคืนสินค้า **ว่างเปล่า** โดยไม่มี error บอก
 * — เป็นอาการที่ดีบักยากที่สุดของ IAP เพราะหน้าจอจะขึ้นว่า "ไม่มีแพ็กเกจให้เลือก"
 * ซึ่งหน้าตาเหมือน "ยังโหลดไม่เสร็จ" และเหมือน "ยังไม่ได้เซ็นสัญญา Paid Apps" ทุกประการ
 *
 * ⇒ เวลาสร้างใน ASC ให้ **ก็อปสตริงจากไฟล์นี้ไปวาง** อย่าพิมพ์เอง
 *
 * ── ทำไมไม่เก็บใน env ─────────────────────────────────────────────────────────
 *
 * รหัสสินค้าเป็นส่วนหนึ่งของ **สัญญาที่ผูกกับโค้ด** (tier ไหนให้โควตาเท่าไร) ไม่ใช่ความลับ
 * และไม่ใช่ค่าที่ต่างกันตามสภาพแวดล้อม — Sandbox กับ Production ใช้รหัสชุดเดียวกัน
 * เก็บใน env จะทำให้ค่าที่ต้องตรงกับโค้ดหลุดไปอยู่ที่ที่ tsc มองไม่เห็น
 */

import type { BusinessPackageTier } from '@/lib/business-package'

/**
 * รหัสสินค้าใน App Store Connect → tier ของเรา
 *
 * 🛑 ต้องอยู่ **subscription group เดียวกัน** ใน ASC ไม่งั้นผู้ใช้เปลี่ยน tier ไม่ได้
 * (ต้องยกเลิกแล้วซื้อใหม่ ซึ่งจะมีช่วงที่สิทธิ์ขาด)
 */
export const APPLE_PRODUCT_TO_TIER: Readonly<Record<string, BusinessPackageTier>> = {
  'com.deepthailand.seller.pkg.growth': 'GROWTH',
  'com.deepthailand.seller.pkg.pro': 'PRO',
  'com.deepthailand.seller.pkg.business': 'BUSINESS',
}

/** tier → รหัสสินค้า (ใช้ตอนบอกแอปว่าจะให้ StoreKit ไปถามราคาของอะไรบ้าง) */
export const TIER_TO_APPLE_PRODUCT: Readonly<Record<BusinessPackageTier, string>> = {
  GROWTH: 'com.deepthailand.seller.pkg.growth',
  PRO: 'com.deepthailand.seller.pkg.pro',
  BUSINESS: 'com.deepthailand.seller.pkg.business',
}

/** รายการรหัสทั้งหมด — ส่งให้ฝั่ง native ไปเรียก `getProducts()` */
export const ALL_APPLE_PRODUCT_IDS: readonly string[] = Object.keys(APPLE_PRODUCT_TO_TIER)

/**
 * แปลรหัสสินค้าเป็น tier — **fail-closed**
 *
 * 🛑 คืน `null` เมื่อไม่รู้จัก ห้ามเดาเป็น tier ต่ำสุด: รหัสที่ไม่รู้จักแปลว่า
 * "มีคนสร้างสินค้าใน ASC โดยไม่ได้แก้โค้ด" หรือ "ธุรกรรมมาจากที่อื่น" ทั้งสองกรณี
 * การให้สิทธิ์ไปก่อนคือการแจกของฟรีโดยไม่มีใครรู้ · ปฏิเสธแล้วมีคนบ่นยังแก้ทัน
 */
export function tierFromAppleProductId(productId: string | null | undefined): BusinessPackageTier | null {
  if (!productId) return null
  return APPLE_PRODUCT_TO_TIER[productId] ?? null
}

/** bundle id ของแอปผู้ขาย — ต้องตรงกับ `ios.bundleIdentifier` ใน deep-seller-app/app.config.ts */
export const SELLER_APP_BUNDLE_ID = 'com.deepthailand.seller'
