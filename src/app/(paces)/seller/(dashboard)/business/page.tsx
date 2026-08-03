/**
 * BusinessPackagePage — package matrix (surface หลักของ feat 00008) — P3-2
 *
 * Base: docs/superpowers/specs/2026-07-02-00008-business-ui-design-spec.md §1
 * ประกอบจาก component ที่ source มาจาก theme แล้ว (ดู Base line ของแต่ละไฟล์เอง):
 *   - QuotaUsageCard (Base: theme .../ui/progress/page.tsx progress bar +
 *     .../settings/ConnectedAccountsClient.tsx:254 list row)
 *   - PackageTierGrid (Base: theme .../pages/pricing/page.tsx grid 4 card +
 *     .../inventory/components/InventoryGate.tsx text-4xl adaptation)
 *   - AdvanceWarningBanner / LockedStateBanner (Base: .../inventory/components/AdvanceWarningBanner.tsx,
 *     LockedStateBanner คือของเดิมที่ P3-1 commit ไว้แล้ว)
 * page shell (session guard + PageBreadcrumb): pattern เดียวกับ .../inventory/page.tsx และ
 * .../business/create/page.tsx (breadcrumb label "ธุรกิจ" ตรงกับที่ create/page.tsx ลิงก์กลับมา)
 *
 * ต่างจาก InventoryPage (feature 00003 gate-only page): หน้านี้ "ไม่ใช่" entitlement gate — ต้อง
 * render matrix เสมอทุก status (NOT_SUBSCRIBED/ACTIVE/LOCKED) ไม่มีสาขา early-return ที่ซ่อนทั้งหน้า
 * (ต่าง TFR-007 ของ inventory ที่ gate ทั้งหน้าเมื่อไม่ ACTIVE) — ปุ่ม action ต่างหากที่ disabled ตาม state
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPersonalShop } from '@/lib/shop-context'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { getBalance } from '@/services/wallet.service'
import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  BUSINESS_PACKAGE_ADVANCE_WARNING_DAYS,
  type BusinessPackageTier,
  type BusinessPackageStatusApp,
} from '@/lib/business-package'
import { formatDate } from '@/lib/format-date'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import LockedStateBanner from './components/LockedStateBanner'
import AdvanceWarningBanner from './components/AdvanceWarningBanner'
import QuotaUsageCard, { type QuotaBusinessItem } from './components/QuotaUsageCard'
import PackageTierGrid from './components/PackageTierGrid'
import type { DowngradeBusinessItem } from './components/DowngradeButton'

export const metadata: Metadata = { title: 'ธุรกิจ' }

const DAY_MS = 24 * 60 * 60 * 1000

export default async function BusinessPackagePage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  const ownerId = user.id as string

  // 1. personal shop (สำหรับหักเงิน/คำนวณ advance-warning) — fail-closed: หาไม่ได้ = balance 0
  let personalShop: { id: string } | null = null
  try {
    personalShop = await getPersonalShop(ownerId)
  } catch {
    personalShop = null
  }

  // 2. subscription status — ไม่มี row = NOT_SUBSCRIBED (FREE pseudo-state)
  let subscription: Awaited<ReturnType<typeof getSubscriptionStatus>> = null
  try {
    subscription = await getSubscriptionStatus(ownerId)
  } catch {
    subscription = null
  }
  const statusApp: BusinessPackageStatusApp = subscription ? (subscription.status as BusinessPackageStatusApp) : 'NOT_SUBSCRIBED'
  const currentTier: BusinessPackageTier | null = subscription ? (subscription.tier as BusinessPackageTier) : null

  // 3. balance ของ personal shop — ใช้คำนวณ advance-warning เท่านั้น (ไม่ leak เลขไปที่อื่น)
  let balance = 0
  if (personalShop) {
    try {
      balance = await getBalance(personalShop.id)
    } catch {
      balance = 0
    }
  }

  // 4. businesses ที่ user เป็นสมาชิก (owner หรือ admin) — มิเรอร์ GET /api/business/context §4.1
  let businesses: QuotaBusinessItem[] = []
  try {
    const memberships = await prisma.shopMember.findMany({
      where: { userId: ownerId, shop: { kind: 'BUSINESS', deletedAt: null } },
      select: {
        role: true,
        shop: { select: { id: true, shopName: true, packageLockedAt: true, createdAt: true } },
      },
      orderBy: { shop: { createdAt: 'asc' } },
    })
    businesses = memberships.map((m) => ({
      shopId: m.shop.id,
      shopName: m.shop.shopName,
      role: m.role as 'OWNER' | 'ADMIN',
      locked: m.shop.packageLockedAt !== null,
    }))
  } catch {
    businesses = []
  }

  // owned เท่านั้น (kind=BUSINESS, deletedAt=null รวม LOCKED) — ใช้กับ quota + cancel/downgrade
  // มิเรอร์ TFR-006 ข้อ 2 (create/page.tsx count logic) ไม่ใช่แค่ unlocked
  const ownedBusinesses: DowngradeBusinessItem[] = businesses
    .filter((b) => b.role === 'OWNER')
    .map((b) => ({ shopId: b.shopId, shopName: b.shopName, locked: b.locked }))
  const ownedCount = ownedBusinesses.length

  const currentQuotaConfig = currentTier ? BUSINESS_PACKAGE_TIER_CONFIG[currentTier] : null
  const maxBusinesses = currentQuotaConfig ? currentQuotaConfig.maxBusinesses : 0 // Free = 0 (Design Spec Constants)
  const canCreate = statusApp === 'ACTIVE' && (maxBusinesses === null || ownedCount < maxBusinesses)

  // advance-warning — เฉพาะ ACTIVE + ใกล้รอบต่ออายุ + ยอดเงินไม่พอ (Design Spec §1 ข้อ 2)
  let showAdvanceWarning = false
  let advanceNextRenewalAt = ''
  let advanceShortfall = 0
  if (statusApp === 'ACTIVE' && subscription && currentQuotaConfig) {
    const daysUntilRenewal = Math.ceil((subscription.nextRenewalAt.getTime() - Date.now()) / DAY_MS)
    if (daysUntilRenewal <= BUSINESS_PACKAGE_ADVANCE_WARNING_DAYS && balance < currentQuotaConfig.priceBaht) {
      showAdvanceWarning = true
      advanceNextRenewalAt = formatDate(subscription.nextRenewalAt)
      advanceShortfall = currentQuotaConfig.priceBaht - balance
    }
  }

  return (
    <>
      <PageBreadcrumb title="ธุรกิจ" />

      {/* ─── 1. Locked banner (subscription-level) ────────────────────────── */}
      {statusApp === 'LOCKED_RENEWAL_FAILED' && subscription && currentQuotaConfig && (
        <LockedStateBanner
          lockReason="RENEWAL_FAILED"
          packageLockedAt={subscription.lockedAt}
          tierPrice={currentQuotaConfig.priceBaht}
          level="subscription"
        />
      )}

      {/* ─── 2. Advance-warning banner ──────────────────────────────────────── */}
      {showAdvanceWarning && (
        <AdvanceWarningBanner nextRenewalAt={advanceNextRenewalAt} shortfall={advanceShortfall} />
      )}

      {/* ─── 3. Quota-usage card ───────────────────────────────────────────── */}
      <QuotaUsageCard
        ownedCount={ownedCount}
        maxBusinesses={maxBusinesses}
        businesses={businesses}
        canCreate={canCreate}
      />

      {/* ─── 4. Tier grid (Free/Growth/Pro/Business) ──────────────────────── */}
      <PackageTierGrid statusApp={statusApp} currentTier={currentTier} ownedBusinesses={ownedBusinesses} />
    </>
  )
}
