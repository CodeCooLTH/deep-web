/**
 * subscription-source — "ใครเป็นคนเก็บเงินและต่ออายุใบนี้" (feature 00064)
 *
 * Pure module — ห้าม import service/prisma (client-safe เหมือน `business-package.ts`)
 *
 * ── ทำไมต้องมีไฟล์นี้ ──────────────────────────────────────────────────────────
 *
 * ก่อนหน้านี้ `BusinessPackageSubscription` มีเจ้าของการต่ออายุคนเดียวคือ **เรา** —
 * cron เดินทุกวัน หยิบใบที่ `nextRenewalAt <= now` แล้ว `deductCredit()` จากกระเป๋าเงินร้าน
 * ตั้งแต่เปิด In-App Purchase บน iOS จะมีใบที่ **Apple เป็นคนเก็บเงินและต่ออายุให้**
 *
 * 🛑 ถ้าไม่แยกสองอย่างนี้ออกจากกัน ผู้ขายที่จ่ายผ่าน Apple จะถูก **เก็บเงินสองต่อ**
 * (Apple ตัดบัตร + cron หักกระเป๋า) หรือถูก `LOCKED_RENEWAL_FAILED` ทั้งที่จ่ายเงินแล้ว
 * เพราะกระเป๋าเงินว่าง ซึ่งจะไปล็อกร้าน business ทุกร้านของเขาพร้อมกัน
 * (`lockAllBusinessShops`) — นี่คือความเสียหายที่ร้ายแรงที่สุดของฟีเจอร์นี้ ดู BRD BR-IAP-02
 *
 * ── ทำไมเป็น `String` ไม่ใช่ enum ของ Prisma ────────────────────────────────────
 *
 * แพตเทิร์นเดียวกับ `tier` ในตารางเดียวกัน และ `Order.status` / `WalletTransaction.type`
 * ทั้งโปรเจกต์ — เพิ่มช่องทางจ่ายเงินใหม่ (เช่น Google Play) จะได้ไม่ต้อง `ALTER TYPE`
 * บนฐาน prod ที่มีข้อมูลลูกค้าจริง
 */

export const SUBSCRIPTION_SOURCE = {
  /** จ่ายด้วยเครดิตในระบบ (`SellerWallet`) — เราเป็นคนเก็บเงินและต่ออายุเอง */
  WALLET: 'WALLET',
  /** จ่ายผ่าน In-App Purchase บน iOS — **Apple** เป็นคนเก็บเงินและต่ออายุ */
  APPLE_IAP: 'APPLE_IAP',
} as const

export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCE)[keyof typeof SUBSCRIPTION_SOURCE]

/**
 * ใบนี้ให้ "เรา" หักเงินจากกระเป๋าและขยับรอบบิลเองได้ไหม
 *
 * 🛑 **fail-closed** — ค่าที่อ่านไม่ออก (คอลัมน์ว่าง · ค่าจากฟีเจอร์ในอนาคตที่โค้ดรุ่นนี้ยังไม่รู้จัก)
 * ต้องตอบ `false` ไม่ใช่ `true` เพราะเดาผิดสองทางเสียหายไม่เท่ากันเลย:
 *
 *   เดาผิดเป็น false → ใบนั้นไม่ถูกต่ออายุ เห็นได้จากรายงาน แก้ตามทีหลังได้
 *   เดาผิดเป็น true  → **หักเงินลูกค้าซ้ำ + ล็อกร้านเขาทั้งหมด** กู้คืนความเชื่อมั่นไม่ได้
 *
 * (คนละทิศกับ `resolveAppShell` ที่ fail-closed ไปทาง 'ios' — ที่นั่นเดาผิดแล้วเสียแค่
 *  "ต้องไปเติมเงินที่เว็บ" ที่นี่เดาผิดแล้วเงินลูกค้าหาย หลักเดียวกันคือเลือกทางที่พังเบากว่า)
 */
export function isWalletBilled(source: string | null | undefined): boolean {
  return source === SUBSCRIPTION_SOURCE.WALLET
}

/**
 * ใบนี้ Apple เป็นคนดูแลรอบบิลไหม
 *
 * ไม่ใช่ `!isWalletBilled()` โดยตั้งใจ — ค่าที่อ่านไม่ออกต้องตอบ **false ทั้งคู่**
 * ("ไม่รู้ว่าใครดูแล" ไม่เท่ากับ "Apple ดูแล") ถ้าเขียนเป็น negation ของกันและกัน
 * ค่าขยะจะกลายเป็น "ของ Apple" แล้วหลุดไปเข้าเส้นทาง webhook ที่ไม่ควรแตะมัน
 */
export function isAppleBilled(source: string | null | undefined): boolean {
  return source === SUBSCRIPTION_SOURCE.APPLE_IAP
}

/** ข้อความ error ที่ service โยนเมื่อมีคนพยายามจัดการใบของ Apple ผ่านเส้นทางกระเป๋าเงิน */
export const MANAGED_BY_APPLE = 'MANAGED_BY_APPLE'
