import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { getBalance } from '@/services/wallet.service'
import { shouldWarnAdvance } from '@/services/inventory-entitlement.service'
import { PACKAGE_PRICE, type EntitlementStatus, type InventoryPackage } from '@/lib/inventory-addon'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'

export interface ShopSubscriptionRow {
  shopId: string
  shopName: string
  kind: 'PERSONAL' | 'BUSINESS'
  logo: string | null
  entitlementStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'
  package: 'BASIC' | 'PRO' | null
  nextRenewalAt: Date | null
  walletBalance: number
  warnAdvance: boolean // shouldWarnAdvance ผลลัพธ์ (ACTIVE เท่านั้น)
  shortfall: number // PACKAGE_PRICE[pkg] - balance (>0 = ขาด); 0 ถ้าไม่ ACTIVE
}
export interface BusinessPackageSummary {
  status: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED_RENEWAL_FAILED'
  tier: 'GROWTH' | 'PRO' | 'BUSINESS' | null
  nextRenewalAt: Date | null
  ownedBusinessCount: number
  maxBusinesses: number | null // null = unlimited (Business tier); จาก TIER_CONFIG
  personalWalletBalance: number
}
export interface SellerSubscriptionOverview {
  businessPackage: BusinessPackageSummary
  shops: ShopSubscriptionRow[] // ทุกร้านที่ user เป็นเจ้าของ (userId), deletedAt:null
}

/**
 * getSellerSubscriptionOverview — aggregator รวม Business Package (ระดับเจ้าของ) + Stock Pro
 * รายร้าน + wallet balance + คำนวณ warnAdvance/shortfall สำหรับหน้า /seller/subscriptions
 */
export async function getSellerSubscriptionOverview(userId: string): Promise<SellerSubscriptionOverview> {
  const [sub, shops, ownedBusinessCount] = await Promise.all([
    getSubscriptionStatus(userId),
    prisma.shop.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        shopName: true,
        kind: true,
        logo: true,
        inventoryEntitlement: { select: { status: true, package: true, nextRenewalAt: true } },
      },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    }),
    // นับเฉพาะร้าน BUSINESS ที่ user เป็น "เจ้าของ" (Shop.userId) — ตรงกับ canonical quota
    // count ใน business/create/page.tsx. ห้ามใช้ shopMember.count (จะรวมร้านที่ user เป็น
    // ADMIN ของคนอื่น → โควตาพองผิด ไม่ sync กับ gate สร้างธุรกิจ)
    prisma.shop.count({ where: { userId, kind: 'BUSINESS', deletedAt: null } }),
  ])

  const rows: ShopSubscriptionRow[] = await Promise.all(
    shops.map(async (s): Promise<ShopSubscriptionRow> => {
      const ent = s.inventoryEntitlement
      const status: EntitlementStatus = ent ? (ent.status as EntitlementStatus) : 'NOT_SUBSCRIBED'
      const pkg = (ent?.package ?? null) as InventoryPackage | null
      const balance = await getBalance(s.id)
      const warnAdvance =
        status === 'ACTIVE' && pkg != null
          ? shouldWarnAdvance({ status, package: pkg, nextRenewalAt: ent!.nextRenewalAt }, balance)
          : false
      const shortfall = status === 'ACTIVE' && pkg != null ? Math.max(0, PACKAGE_PRICE[pkg] - balance) : 0
      return {
        shopId: s.id,
        shopName: s.shopName,
        kind: s.kind as 'PERSONAL' | 'BUSINESS',
        logo: s.logo,
        entitlementStatus: status,
        package: pkg,
        nextRenewalAt: ent?.nextRenewalAt ?? null,
        walletBalance: balance,
        warnAdvance,
        shortfall,
      }
    }),
  )

  // Business Package หักจากกระเป๋าร้าน PERSONAL ของเจ้าของ — reuse balance ที่คำนวณใน rows
  // แล้ว (ร้าน PERSONAL อยู่ใน shops เสมอเพราะ userId ตรง) กัน getBalance ซ้ำ round-trip
  const personalWalletBalance = rows.find((r) => r.kind === 'PERSONAL')?.walletBalance ?? 0

  const tier = (sub?.tier ?? null) as BusinessPackageTier | null
  const businessPackage: BusinessPackageSummary = {
    status: sub ? (sub.status as 'ACTIVE' | 'LOCKED_RENEWAL_FAILED') : 'NOT_SUBSCRIBED',
    tier,
    nextRenewalAt: sub?.nextRenewalAt ?? null,
    ownedBusinessCount,
    maxBusinesses: tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].maxBusinesses : null,
    personalWalletBalance,
  }

  return { businessPackage, shops: rows }
}
