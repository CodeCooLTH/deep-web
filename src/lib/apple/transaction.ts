/**
 * apple/transaction — แปล payload ที่ตรวจลายเซ็นแล้ว ให้เป็นของที่ระบบเราใช้ได้ (feature 00064)
 *
 * Pure module — ห้าม import service/prisma · รับ **payload ที่ผ่าน `verifyAppleJws` แล้วเท่านั้น**
 *
 * 🛑 "ลายเซ็นถูก" ยังไม่พอ — ธุรกรรมที่เซ็นถูกต้องอาจเป็นของ **แอปอื่น** ก็ได้
 * (ใบรับรองของ Apple ใบเดียวกันเซ็นให้ทุกแอปในโลก) ⇒ ต้องตรวจ `bundleId` ต่ออีกชั้น
 * ไฟล์นี้คือชั้นนั้น
 */

import type { BusinessPackageTier } from '@/lib/business-package'

import { SELLER_APP_BUNDLE_ID, tierFromAppleProductId } from './product-ids'

/** สภาพแวดล้อมที่ Apple บอกมากับธุรกรรม */
export type AppleEnvironment = 'Production' | 'Sandbox'

/** รูปร่างของ JWSTransactionDecodedPayload เท่าที่เราใช้จริง (Apple ส่งมามากกว่านี้) */
export interface AppleTransactionPayload {
  bundleId?: unknown
  productId?: unknown
  originalTransactionId?: unknown
  transactionId?: unknown
  /** epoch ms — Apple ส่งเป็นตัวเลข ไม่ใช่ ISO string */
  expiresDate?: unknown
  environment?: unknown
  /** `Auto-Renewable Subscription` สำหรับของเรา */
  type?: unknown
  /** `PURCHASED` | `FAMILY_SHARED` — ของที่แชร์มาจากครอบครัวไม่นับเป็นการซื้อของบัญชีนี้ */
  inAppOwnershipType?: unknown
  /** epoch ms — มีค่าเมื่อ Apple คืนเงิน/เพิกถอนแล้ว */
  revocationDate?: unknown
  revocationReason?: unknown
}

export type TransactionRejection =
  | 'BUNDLE_MISMATCH'      // ธุรกรรมของแอปอื่น
  | 'UNKNOWN_PRODUCT'      // productId ไม่อยู่ในรายการที่เรารู้จัก
  | 'NOT_SUBSCRIPTION'     // ไม่ใช่ auto-renewable subscription
  | 'FAMILY_SHARED'        // ได้มาจาก Family Sharing ไม่ใช่บัญชีนี้ซื้อเอง
  | 'NO_EXPIRY'            // ไม่มี expiresDate — subscription ต้องมีเสมอ
  | 'BAD_ENVIRONMENT'      // ค่า environment ไม่ใช่ 2 ค่าที่รู้จัก
  | 'MISSING_IDS'          // ไม่มี originalTransactionId

export interface AppleSubscriptionFacts {
  tier: BusinessPackageTier
  productId: string
  originalTransactionId: string
  transactionId: string | null
  environment: AppleEnvironment
  /** สิทธิ์หมดเมื่อไร — **มาจาก Apple เท่านั้น ห้ามคำนวณ +30 วันเอง** (BR-IAP-03) */
  expiresAt: Date
  /** Apple เพิกถอน/คืนเงินแล้วหรือยัง — มีค่า = ต้องถอนสิทธิ์ทันที */
  revokedAt: Date | null
}

export type TransactionResult =
  | { ok: true; facts: AppleSubscriptionFacts }
  | { ok: false; reason: TransactionRejection }

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Apple ส่งเวลาเป็น epoch **มิลลิวินาที** ไม่ใช่วินาที — ตีความผิดจะเพี้ยนไป 50 ปี */
function asEpochMs(v: unknown): Date | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * ตรวจว่าธุรกรรมนี้ใช้เปิดสิทธิ์ในระบบเราได้ไหม แล้วสกัดเฉพาะข้อมูลที่ต้องใช้
 *
 * ── 🛑 เรื่อง environment (Sandbox vs Production) ────────────────────────────
 *
 * **เรารับทั้งสองค่า** และบันทึกไว้ว่าเป็นอันไหน — ไม่ปฏิเสธ Sandbox
 *
 * เหตุผลที่ห้ามปฏิเสธ Sandbox: **คนตรวจของ App Review ซื้อผ่าน Sandbox เสมอ**
 * และ TestFlight ก็ใช้ Sandbox ⇒ ปฏิเสธเมื่อไหร่ = คนตรวจกดซื้อไม่สำเร็จ = ถูกตีกลับ
 * (และเราจะทดสอบเองก่อนปล่อยก็ไม่ได้ด้วย)
 *
 * ความเสี่ยงที่รับไว้อย่างรู้ตัว: การซื้อใน Sandbox ไม่เสียเงินจริง ⇒ คนที่มีบัญชีทดสอบ
 * ของ Apple เปิดสิทธิ์ฟรีได้ · ที่ทอนความเสี่ยงลง: subscription ของ Sandbox หมดอายุเร็วมาก
 * (1 เดือนจริง = ไม่กี่นาที) และเราเก็บ `appleEnvironment` ไว้ทุกแถว ⇒ ตรวจสอบย้อนหลังได้ด้วย
 *
 *     SELECT * FROM "BusinessPackageSubscription" WHERE "appleEnvironment" = 'Sandbox';
 *
 * ถ้าวันหนึ่งเจอการใช้ในทางที่ผิด ให้เพิ่มด่านที่ service ไม่ใช่ที่นี่ — ที่นี่ทำหน้าที่
 * "แปลของที่ Apple ส่งมา" ไม่ใช่ "ตัดสินนโยบาย"
 */
export function readAppleSubscription(payload: AppleTransactionPayload): TransactionResult {
  /* 🛑 ด่านนี้ต้องมาก่อนทุกอย่าง — ใบรับรองของ Apple ใบเดียวกันเซ็นให้ทุกแอปในโลก
     ลายเซ็นถูกต้องจึงไม่ได้แปลว่าเป็นธุรกรรมของแอปเรา */
  if (asString(payload.bundleId) !== SELLER_APP_BUNDLE_ID) {
    return { ok: false, reason: 'BUNDLE_MISMATCH' }
  }

  const env = asString(payload.environment)
  if (env !== 'Production' && env !== 'Sandbox') return { ok: false, reason: 'BAD_ENVIRONMENT' }

  /* `type` ไม่มีมาในบาง payload เก่า — ถ้ามีต้องเป็น subscription เท่านั้น
     (ของเราขายแบบเดียว ถ้าวันหนึ่งขายของแบบซื้อขาด ต้องมาแก้ตรงนี้อย่างตั้งใจ) */
  const type = asString(payload.type)
  if (type !== null && type !== 'Auto-Renewable Subscription') {
    return { ok: false, reason: 'NOT_SUBSCRIPTION' }
  }

  /* 🛑 Family Sharing: คนในครอบครัวที่ได้สิทธิ์ต่อมา ไม่ใช่คนที่จ่ายเงิน
     ปล่อยผ่าน = 1 การสมัครเปิดสิทธิ์ให้ได้ถึง 6 บัญชี Deep */
  const ownership = asString(payload.inAppOwnershipType)
  if (ownership !== null && ownership !== 'PURCHASED') {
    return { ok: false, reason: 'FAMILY_SHARED' }
  }

  const productId = asString(payload.productId)
  const tier = tierFromAppleProductId(productId)
  if (!productId || !tier) return { ok: false, reason: 'UNKNOWN_PRODUCT' }

  const originalTransactionId = asString(payload.originalTransactionId)
  if (!originalTransactionId) return { ok: false, reason: 'MISSING_IDS' }

  const expiresAt = asEpochMs(payload.expiresDate)
  if (!expiresAt) return { ok: false, reason: 'NO_EXPIRY' }

  return {
    ok: true,
    facts: {
      tier,
      productId,
      originalTransactionId,
      transactionId: asString(payload.transactionId),
      environment: env,
      expiresAt,
      revokedAt: asEpochMs(payload.revocationDate),
    },
  }
}
