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
