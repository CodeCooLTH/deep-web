// Constants สำหรับ Business Account & Packages (feat 00008)
// Pure module — ห้าม import จาก service/prisma ใด ๆ (client-safe)
// SSOT: docs/20 - Features/00008 - Business Account & Packages/SRS.md §10

export type BusinessPackageTier = 'GROWTH' | 'PRO' | 'BUSINESS'
export type BusinessPackageStatusApp = 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED_RENEWAL_FAILED'

export const BUSINESS_PACKAGE_TIER_CONFIG: Record<BusinessPackageTier, {
  priceBaht: number; maxBusinesses: number | null; maxAdminsPerBusiness: number | null; label: string
}> = {
  GROWTH:   { priceBaht: 159,  maxBusinesses: 1,    maxAdminsPerBusiness: 1,    label: 'Growth' },
  PRO:      { priceBaht: 599,  maxBusinesses: 3,    maxAdminsPerBusiness: 3,    label: 'Pro' },
  BUSINESS: { priceBaht: 1299, maxBusinesses: null, maxAdminsPerBusiness: null, label: 'Business' },
}
export const TIER_ORDER: Record<BusinessPackageTier, number> = { GROWTH: 1, PRO: 2, BUSINESS: 3 }

/**
 * "จ่ายแล้วได้อะไร" ของแต่ละ tier — **SSOT เดียวทั้งเว็บและในแอป** (Hard Rule 16)
 *
 * 🛑 ย้ายมาจาก `PackageTierGrid.tsx` (เคยเป็นฟังก์ชันในไฟล์นั้นไฟล์เดียว) เพราะ Apple ตีกลับ
 * 2026-09-24 ด้วย **Guideline 3.1.2(c)**: *"The app uses auto-renewable subscriptions, but it
 * does not clearly describe what the user will receive for the price."*
 *
 * จอขายแพ็กเกจในแอป (`IapSubscribeClient`) แสดงแค่ **ชื่อ + ราคา + ปุ่ม** เพราะคำบรรยายชุดนี้
 * ถูกขังอยู่ในคอมโพเนนต์ของฝั่งเว็บ ⇒ ผู้ซื้อในแอปไม่มีทางรู้ว่าสามแพ็กเกจต่างกันตรงไหน
 *
 * ⇒ ห้ามก็อปข้อความไปเขียนซ้ำที่จออื่น ให้เรียกตัวนี้ — ไม่งั้นวันที่โควตาเปลี่ยน
 * สองจอจะบอกผู้ใช้คนละเรื่องโดยไม่มี gate ไหนฟ้อง (ทั้งคู่เป็นสตริงที่ "ถูก" ในตัวเอง)
 *
 * รับเป็นตัวเลขโควตา ไม่ใช่ tier เพราะการ์ด **Free** ในกริดฝั่งเว็บเป็น pseudo tier
 * ที่ไม่มีแถวใน `BUSINESS_PACKAGE_TIER_CONFIG` (0 ธุรกิจ) แต่ต้องใช้คำชุดเดียวกัน
 */
export function tierQuotaFeatures(
  maxBusinesses: number | null,
  maxAdminsPerBusiness: number | null,
): string[] {
  if (maxBusinesses === 0) {
    return ['ใช้ Personal shop ได้ตามปกติ (ฟรีตลอดไป)', 'สร้าง Business account ไม่ได้']
  }
  return [
    `สร้างได้ ${maxBusinesses === null ? 'ไม่จำกัด' : maxBusinesses} ธุรกิจ`,
    `${maxAdminsPerBusiness === null ? 'ไม่จำกัด' : maxAdminsPerBusiness} ผู้ดูแลต่อธุรกิจ`,
    'Product/Order/Wallet แยกเป็นของตัวเอง',
  ]
}

/** คำบรรยายสิทธิ์ของ tier ที่ขายจริง — ตัวช่วยของ `tierQuotaFeatures` สำหรับผู้เรียกที่ถือ tier อยู่แล้ว */
export function featuresForTier(tier: BusinessPackageTier): string[] {
  const c = BUSINESS_PACKAGE_TIER_CONFIG[tier]
  return tierQuotaFeatures(c.maxBusinesses, c.maxAdminsPerBusiness)
}

export const BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS = 30
export const BUSINESS_PACKAGE_ADVANCE_WARNING_DAYS = 3
export const BUSINESS_LOCK_GRACE_DAYS = 30      // LOCKED_GRACE → SOFT_DELETED
export const BUSINESS_DELETE_RETENTION_DAYS = 30 // SOFT_DELETED → PURGED

export const GRACE_ELIGIBLE_LOCK_REASONS = ['RENEWAL_FAILED', 'OWNER_CANCELLED_PACKAGE'] as const

export const SHOP_LOCK_REASON = {
  RENEWAL_FAILED: 'RENEWAL_FAILED',
  OWNER_CANCELLED_PACKAGE: 'OWNER_CANCELLED_PACKAGE',
  QUOTA_EXCEEDED_BUSINESS_COUNT: 'QUOTA_EXCEEDED_BUSINESS_COUNT',
  QUOTA_EXCEEDED_ADMIN_COUNT: 'QUOTA_EXCEEDED_ADMIN_COUNT',
} as const

export const SHOP_DELETE_REASON = {
  OWNER_DELETED: 'OWNER_DELETED',
  PACKAGE_LAPSED: 'PACKAGE_LAPSED',
} as const

export const WALLET_REASON_BUSINESS = {
  BUSINESS_PACKAGE_SUBSCRIPTION: 'BUSINESS_PACKAGE_SUBSCRIPTION',
} as const

export const WALLET_DESC_BUSINESS = {
  SUBSCRIBE: 'สมัคร Business Package',
  RENEW: 'ต่ออายุ Business Package (รายเดือน)',
  UPGRADE: 'อัพเกรด Business Package',
  REACTIVATE: 'เปิดใช้ Business Package อีกครั้ง',
} as const
