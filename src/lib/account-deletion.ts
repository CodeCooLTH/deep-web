/**
 * account-deletion — ค่าคงที่ + type ของการลบบัญชีผู้ใช้
 *
 * ทำไมต้องมีฟีเจอร์นี้: App Store Guideline 5.1.1(v) บังคับว่าแอปที่สมัครบัญชีได้
 * ต้องให้ผู้ใช้ "เริ่มลบบัญชี" ได้จากในแอป — ลิงก์ไปหน้าที่เขียนว่า "ส่งอีเมลมาขอลบ" ไม่ผ่าน
 * (`deep-seller-app` เป็น WebView-first ปุ่มที่อยู่ในเว็บ seller จึงนับว่าอยู่ในแอปแล้ว)
 *
 * ไฟล์นี้ต้องเป็น pure module (ไม่ import prisma/fs) — client component ฝั่ง Paces และ Vuexy
 * import type/ค่าคงที่จากที่นี่ตรง ๆ ได้ pattern เดียวกับ src/lib/business-package.ts
 *
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md
 */

/**
 * ระยะเก็บข้อมูลก่อนล้าง PII — ตั้งเท่ากับ BUSINESS_DELETE_RETENTION_DAYS ของ Shop โดยตั้งใจ
 * ไม่ให้เกิดสภาพ "ร้านถูกล้างแล้วแต่ตัวเจ้าของยังอยู่" ซึ่งอ่านข้อมูลย้อนหลังแล้วงง
 */
export const ACCOUNT_DELETE_RETENTION_DAYS = 30

/** เหตุผลที่บัญชีถูกปิด — มิเรอร์รูปแบบ SHOP_DELETE_REASON (เผื่อ ADMIN_BANNED ในอนาคต) */
export const ACCOUNT_DELETE_REASON = {
  USER_DELETED: 'USER_DELETED',
} as const

export type AccountDeleteReason = (typeof ACCOUNT_DELETE_REASON)[keyof typeof ACCOUNT_DELETE_REASON]

/**
 * สถานะออเดอร์ที่ถือว่า "ค้าง" — ผู้ซื้ออาจจ่ายเงินแล้วแต่ยังไม่ได้ของ
 * ปล่อยให้ร้านหายไปตอนนี้คือทิ้งคู่ค้ากลางคัน จึงบล็อกการลบไว้ก่อน
 * (ค่าตรงกับ OrderStatus ใน src/lib/order-display.ts — Order.status เป็น String ไม่ใช่ enum ใน DB)
 */
export const BLOCKING_ORDER_STATUSES = ['PENDING', 'SHIPPED'] as const

/** ตัวขวางการลบ — ต้องจัดการให้เรียบร้อยก่อนถึงจะลบได้ */
export type DeletionBlocker = {
  code: 'PENDING_ORDERS'
  /** ข้อความไทยพร้อมตัวเลขจริง — Apple ยอมรับการบล็อกถ้าบอกชัดว่าต้องทำอะไรก่อน */
  message: string
  /** ปุ่มพาไปจัดการ (path เดียวกันทั้ง seller/buyer ไม่ได้ — ผู้เรียกเลือกเอง) */
  actionHref?: string
  actionLabel?: string
  count: number
}

/** คำเตือน — ลบได้ แต่ผู้ใช้ต้องรู้ก่อนว่าจะเสียอะไร */
export type DeletionWarning = {
  /**
   * PENDING_PURCHASES = ของที่ "สั่งซื้อไว้" แล้วยังไม่ได้รับ (คนละเรื่องกับ PENDING_ORDERS
   * ที่เป็น blocker ของฝั่งร้าน) — เป็นคำเตือนไม่ใช่ตัวบล็อกโดยตั้งใจ: ถ้าบล็อก ผู้ซื้อที่เจอ
   * ร้านเงียบ/ไม่ส่งของจะติดอยู่ในระบบตลอดไปโดยที่ตัวเองทำอะไรไม่ได้เลย ซึ่งขัดเจตนาของ
   * Guideline 5.1.1(v) ที่ต้องการให้ผู้ใช้ออกจากบริการได้ด้วยตัวเอง
   */
  code: 'WALLET_BALANCE' | 'BUSINESS_MEMBERS' | 'PENDING_PURCHASES'
  message: string
}

/** ผลของ preflight — GET /api/account/delete คืนรูปนี้ตรง ๆ */
export type DeletionPreflight = {
  canDelete: boolean
  blockers: DeletionBlocker[]
  warnings: DeletionWarning[]
  /**
   * ข้อความที่ผู้ใช้ต้องพิมพ์ให้ตรง = ชื่อที่แสดงของเจ้าของบัญชี
   *
   * server เป็นคนบอกเสมอ client ไม่เดาเอง — ทั้งสองฝั่ง (ผู้ขาย /account, ผู้ซื้อ
   * /settings/profile) เป็นหน้าของ "ตัวคน" ทั้งคู่ จึงใช้เกณฑ์เดียวกัน
   * (เคยมีโหมดพิมพ์ "ชื่อร้าน" ตอนปุ่มอยู่ที่ /shop — ถอดออกแล้ว 2026-08-04 พร้อมกับย้ายหน้า
   *  เพราะหน้า /account ห้ามแสดงชื่อร้าน การให้พิมพ์สิ่งที่ไม่ได้แสดงไว้ที่ไหนเลยคือการ
   *  บังคับให้ผู้ใช้ออกไปหาเอง)
   */
  confirmLabel: string
}

/** โค้ด error ของ POST — client map เป็นข้อความไทยเอง */
export const ACCOUNT_DELETE_ERROR = {
  CONFIRM_MISMATCH: 'CONFIRM_MISMATCH',
  HAS_BLOCKERS: 'HAS_BLOCKERS',
  ALREADY_DELETED: 'ALREADY_DELETED',
  NOT_FOUND: 'NOT_FOUND',
} as const

export type AccountDeleteErrorCode =
  (typeof ACCOUNT_DELETE_ERROR)[keyof typeof ACCOUNT_DELETE_ERROR]

/**
 * บัญชีนี้ถูกปิดไปแล้วหรือยัง — ใช้ร่วมกันทุกจุดใน lib/auth.ts
 *
 * 🛑 ทุก provider ต้องเรียกตัวนี้ ห้ามเขียนเงื่อนไขเองซ้ำ — กติกาแตกเป็นหลายชุดเมื่อไหร่
 * จะมีทางเข้าที่ลืมปิดเสมอ (มีทางเข้า 6 ทาง: phone-otp, seller/buyer/admin-credentials,
 * mobile-ticket, OAuth)
 *
 * ตรวจแค่ deletedAt ไม่ต้องดู purgedAt — purgedAt เป็น subset ของ deletedAt เสมอ
 * (ล้าง PII ได้ก็ต่อเมื่อถูกปิดไปแล้ว) เช็คตัวเดียวจึงครอบทั้งสองสถานะ
 */
export function isDeletedUser(user: { deletedAt: Date | null } | null | undefined): boolean {
  return !!user?.deletedAt
}

/**
 * username สำหรับบัญชีที่ถูกล้างแล้ว — ต้อง unique เพราะ User.username เป็น @unique
 *
 * ใช้ 8 ตัวแรกของ uuid: ชนกันได้ยากมาก และยังสาวกลับไปหาแถวต้นทางได้ถ้าต้องสอบสวนย้อนหลัง
 * (ทั้ง id เต็มจะยาวเกิน 30 ตัวที่ UI อื่นคาดไว้)
 */
export function purgedUsername(userId: string): string {
  return `deleted_${userId.slice(0, 8)}`
}

/** displayName สำหรับบัญชีที่ถูกล้างแล้ว — คู่ค้ายังเห็นว่ามีคนอยู่ตรงนั้น แต่ไม่รู้ว่าใคร */
export const PURGED_DISPLAY_NAME = 'ผู้ใช้ที่ลบบัญชี'
