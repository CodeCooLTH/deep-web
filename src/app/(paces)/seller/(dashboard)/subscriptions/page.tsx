/**
 * SubscriptionsPage — หน้ารวมศูนย์ "แพ็กเกจของฉัน" (Task 3, S-5..S-11)
 *
 * Base (page shell + Section A data-fetch + component order): src/app/(paces)/seller/(dashboard)/business/page.tsx
 *   — session guard, getPersonalShop/getSubscriptionStatus/getBalance/shopMember query,
 *   LockedStateBanner → AdvanceWarningBanner(business) → QuotaUsageCard → PackageTierGrid ลำดับเป๊ะ.
 *   ต่างจาก business/page.tsx ตรงที่หน้านี้ดึง `businesses[]`/`ownedBusinesses[]` เอง (aggregator
 *   Task 1 คืนแค่ summary ตัวเลข ไม่มีรายชื่อ/role — QuotaUsageCard/PackageTierGrid ต้องการ list เต็ม)
 * Base (Section B การ์ดต่อร้าน + action state matrix): src/app/(paces)/seller/(dashboard)/inventory/page.tsx
 *   — badge แพ็กเกจ (isPro→bg-warning/15+crown / BASIC→bg-primary/15), AdvanceWarningBanner(inventory),
 *   PackageSelector(mode+lockedAt)/UpgradeToProCard ตาม entitlementStatus, no-shop empty card (70-91)
 * Base (SwitchShopButton wiring): Task 2 (src/layouts/.../UserDropdownDetailed.tsx handleSwitch pattern)
 *
 * S-7 (Change Log 2026-07-04 #1): ร้าน active ใช้ PackageSelector + UpgradeToProCard (ไม่ใช่
 * SubscribeButton/ReactivateButton เดิมที่ broken/orphaned) — mirror inventory/page.tsx เป๊ะ
 * D-1 (REVISED): จัดการได้เฉพาะร้าน active เท่านั้น (resolve จาก session.activeShopId/PERSONAL
 * ฝั่ง server) — ร้านอื่นอ่านอย่างเดียว + ปุ่มสลับร้าน (S-8)
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { resolveActiveShopContext } from '@/lib/shop-context'
import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  BUSINESS_PACKAGE_ADVANCE_WARNING_DAYS,
  type BusinessPackageTier,
  type BusinessPackageStatusApp,
} from '@/lib/business-package'
import { PACKAGE_LABEL_TH, type EntitlementStatus, type InventoryPackage } from '@/lib/inventory-addon'
import { formatDate, formatDateTime } from '@/lib/format-date'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { getSellerSubscriptionOverview } from '@/services/subscription-overview.service'
import SwitchShopButton from './components/SwitchShopButton'

// Section A — reuse component เดิม 100% (business/page.tsx)
import LockedStateBanner from '../business/components/LockedStateBanner'
import BusinessAdvanceWarningBanner from '../business/components/AdvanceWarningBanner'
import QuotaUsageCard, { type QuotaBusinessItem } from '../business/components/QuotaUsageCard'
import PackageTierGrid from '../business/components/PackageTierGrid'
import type { DowngradeBusinessItem } from '../business/components/DowngradeButton'

// Section B — reuse component เดิม 100% (inventory/page.tsx)
import PackageSelector from '../inventory/components/PackageSelector'
import UpgradeToProCard from '../inventory/components/UpgradeToProCard'
import InventoryAdvanceWarningBanner from '../inventory/components/AdvanceWarningBanner'

export const metadata: Metadata = { title: 'แพ็กเกจของฉัน' }

const DAY_MS = 24 * 60 * 60 * 1000

// badge แพ็กเกจต่อร้าน (Section B) — Base logic: inventory/page.tsx:170-181 (isPro→warning+crown / BASIC→primary)
// ขยายครอบ NOT_SUBSCRIBED/LOCKED ตาม Design Spec §3 Section B
function packageBadge(
  status: EntitlementStatus,
  pkg: InventoryPackage | null,
): { className: string; label: string; icon?: string } {
  if (status === 'LOCKED') {
    return { className: 'badge bg-danger/15 text-danger', label: 'ถูกล็อก' }
  }
  if (status === 'NOT_SUBSCRIBED' || !pkg) {
    return { className: 'badge bg-default-100 text-default-500', label: 'ยังไม่สมัคร' }
  }
  if (pkg === 'PRO') {
    return {
      className: 'badge bg-warning/15 text-warning inline-flex items-center gap-1',
      label: PACKAGE_LABEL_TH.PRO,
      icon: 'crown',
    }
  }
  return { className: 'badge bg-primary/15 text-primary', label: PACKAGE_LABEL_TH.BASIC }
}

export default async function SubscriptionsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  const ownerId = user.id as string

  // ── Section B data — aggregator (Task 1) ──────────────────────────────────
  const overview = await getSellerSubscriptionOverview(ownerId)

  const personalShopId = overview.shops.find((s) => s.kind === 'PERSONAL')?.shopId ?? null
  // ใช้ resolveActiveShopContext (backend semantics) แทน naive `?? personalShopId` — จัดการ activeShopId
  // ที่ stale (ชี้ shop ถูกลบ/หลุด membership → fallback Personal) กัน edge-case ที่ไม่มีการ์ดไหน active
  const activeCtx = await resolveActiveShopContext({
    user: { id: ownerId, activeShopId: (user.activeShopId as string | null | undefined) ?? null },
  })
  const activeShopId: string | null = activeCtx?.shopId ?? personalShopId

  // lockedAt เฉพาะร้าน active ที่ LOCKED (query เดี่ยว ตรง pattern inventory/page.tsx:106-115 — ไม่ query
  // ทุกร้านเพราะ lockedAt ใช้แค่ใน PackageSelector ของร้าน active เท่านั้น)
  const activeRow = overview.shops.find((s) => s.shopId === activeShopId)
  let activeLockedAt: string | null = null
  if (activeRow && activeRow.entitlementStatus === 'LOCKED') {
    try {
      const row = await prisma.inventoryEntitlement.findUnique({
        where: { shopId: activeRow.shopId },
        select: { lockedAt: true },
      })
      activeLockedAt = row?.lockedAt ? formatDateTime(row.lockedAt) : null
    } catch {
      activeLockedAt = null
    }
  }

  // ── Section A data — mirror business/page.tsx เป๊ะ (aggregator ไม่มี list/role/lockedAt ที่ต้องใช้ที่นี่) ──
  let subscription: Awaited<ReturnType<typeof getSubscriptionStatus>> = null
  try {
    subscription = await getSubscriptionStatus(ownerId)
  } catch {
    subscription = null
  }
  const statusApp: BusinessPackageStatusApp = subscription ? (subscription.status as BusinessPackageStatusApp) : 'NOT_SUBSCRIBED'
  const currentTier: BusinessPackageTier | null = subscription ? (subscription.tier as BusinessPackageTier) : null

  const balance = overview.businessPackage.personalWalletBalance // เท่ากับ getBalance(personalShop.id) — reuse ค่าที่ aggregator คำนวณแล้ว กัน query ซ้ำ

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

  const ownedBusinesses: DowngradeBusinessItem[] = businesses
    .filter((b) => b.role === 'OWNER')
    .map((b) => ({ shopId: b.shopId, shopName: b.shopName, locked: b.locked }))
  const ownedCount = ownedBusinesses.length

  const currentQuotaConfig = currentTier ? BUSINESS_PACKAGE_TIER_CONFIG[currentTier] : null
  const maxBusinesses = currentQuotaConfig ? currentQuotaConfig.maxBusinesses : 0
  const canCreate = statusApp === 'ACTIVE' && (maxBusinesses === null || ownedCount < maxBusinesses)

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
      <PageBreadcrumb title="แพ็กเกจของฉัน" />

      {/* ─── Section A · Business Package (ระดับเจ้าของ) ──────────────────────── */}
      <h5 className="text-dark mb-3 text-lg font-semibold">ธุรกิจ (Business Package)</h5>

      {/* แถวยอดกระเป๋าร้านส่วนตัว — เพิ่มใหม่ตาม Design Spec §3 (Business Package หักจากกระเป๋านี้อัตโนมัติ) */}
      <div className="bg-default-50 mb-4 flex items-center justify-between px-4 py-2.5 rounded-lg text-sm">
        <span>ยอดกระเป๋าร้านส่วนตัว (หักค่าแพ็กเกจอัตโนมัติ)</span>
        <span className="font-semibold">฿{balance.toLocaleString('th-TH')}</span>
      </div>

      {statusApp === 'LOCKED_RENEWAL_FAILED' && subscription && currentQuotaConfig && (
        <LockedStateBanner
          lockReason="RENEWAL_FAILED"
          packageLockedAt={subscription.lockedAt}
          tierPrice={currentQuotaConfig.priceBaht}
          level="subscription"
        />
      )}

      {showAdvanceWarning && (
        <BusinessAdvanceWarningBanner nextRenewalAt={advanceNextRenewalAt} shortfall={advanceShortfall} />
      )}

      <QuotaUsageCard
        ownedCount={ownedCount}
        maxBusinesses={maxBusinesses}
        businesses={businesses}
        canCreate={canCreate}
      />

      <PackageTierGrid statusApp={statusApp} currentTier={currentTier} ownedBusinesses={ownedBusinesses} />

      {/* ─── Section B · Stock Pro รายร้าน ──────────────────────────────────── */}
      <h5 className="text-dark mb-3 mt-6 text-lg font-semibold">สต๊อกสินค้า (Stock Pro รายร้าน)</h5>

      {overview.shops.length === 0 ? (
        // empty state — Base: inventory/page.tsx:70-91
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="building-store" className="text-warning mx-auto mb-4 size-16" aria-hidden="true" />
          <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
          <p className="text-default-400 mb-6">เปิดร้านก่อนนะคะ ถึงจะจัดการสต็อกได้</p>
          <Link
            href="/shop"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
          >
            <Icon icon="plus" className="size-4.5" aria-hidden="true" />
            เปิดร้าน
          </Link>
        </div>
      ) : (
        <div className="space-y-base">
          {overview.shops.map((shop) => {
            const isActive = shop.shopId === activeShopId
            const badge = packageBadge(shop.entitlementStatus, shop.package)

            return (
              <div key={shop.shopId} className="card">
                <div className="card-header flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{shop.shopName}</span>
                    {shop.kind === 'PERSONAL' ? (
                      <span className="badge bg-default-100 text-default-500">ส่วนตัว</span>
                    ) : (
                      <span className="badge bg-primary/15 text-primary inline-flex items-center gap-1">
                        <Icon icon="building-store" className="size-3" aria-hidden="true" />
                        ธุรกิจ
                      </span>
                    )}
                  </div>

                  {isActive ? (
                    <span className="badge bg-success/15 text-success inline-flex items-center gap-1">
                      <Icon icon="check" className="size-3" aria-hidden="true" />
                      กำลังใช้งาน
                    </span>
                  ) : (
                    <SwitchShopButton shopId={shop.shopId} shopName={shop.shopName} />
                  )}
                </div>

                <div className="card-body">
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                    <span className={badge.className}>
                      {badge.icon && <Icon icon={badge.icon} className="size-3" aria-hidden="true" />}
                      {badge.label}
                    </span>
                    <span className="text-default-500">
                      ต่ออายุ: {shop.nextRenewalAt ? formatDate(shop.nextRenewalAt) : '—'}
                    </span>
                    <span className="text-default-500">ยอดกระเป๋า: ฿{shop.walletBalance.toLocaleString('th-TH')}</span>
                  </div>

                  {shop.warnAdvance && shop.nextRenewalAt && (
                    <InventoryAdvanceWarningBanner
                      nextRenewalAt={formatDateTime(shop.nextRenewalAt)}
                      shortfall={shop.shortfall}
                    />
                  )}

                  {isActive && shop.entitlementStatus !== 'ACTIVE' && (
                    <PackageSelector
                      mode={shop.entitlementStatus === 'LOCKED' ? 'reactivate' : 'subscribe'}
                      lockedAt={shop.entitlementStatus === 'LOCKED' ? activeLockedAt : null}
                    />
                  )}

                  {isActive && shop.entitlementStatus === 'ACTIVE' && shop.package === 'BASIC' && <UpgradeToProCard />}

                  {isActive && (
                    <div className="mt-3">
                      <Link href="/inventory" className="text-primary text-sm font-medium hover:underline">
                        จัดการสต๊อก →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
