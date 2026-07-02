/**
 * InventoryPage — S-16 (feature 00009 Deep Stock Pro), extend เป็น 2-package gate (BASIC/PRO)
 *
 * Base เดิม (S-12, feature 00003): docs/20 - Features/00003 - Inventory Add-on/SDS.md §5.1
 * Base ส่วนขยาย (S-16, feature 00009): docs/20 - Features/00009 - Deep Stock Pro/SDS.md §3.2
 *   call-site sync + UX-Design-Spec.md ส่วน S-16 (4 states)
 * ประกอบจาก component ที่ source มาจาก theme แล้ว:
 *   - PackageSelector (S-15) — แทน InventoryGate สำหรับ NOT_SUBSCRIBED/LOCKED (Base: pricing/page.tsx)
 *   - UpgradeToProCard (S-16 ใหม่ — Base: AdvanceWarningBanner.tsx โครงการ์ด + SubscribeButton.tsx confirm)
 *   - AdvanceWarningBanner (Base: WalletCard.tsx low-balance chip ขยายเป็น banner)
 *   - InventoryManagementTable (Base: theme/paces/Admin/TS/.../product-stocks/components/ProductStockTable.tsx +
 *     src/app/(paces)/seller/(dashboard)/wallet/components/WalletTransactionTable.tsx)
 *   - CsvImportModal (S-18, committed แล้ว) — เปิดจากปุ่ม "นำเข้า CSV" ใน PRO section
 * "no-shop" card: pattern เดียวกับ src/app/(paces)/seller/(fullscreen)/products/new-v2/page.tsx:40-60
 * page shell (session guard + PageBreadcrumb): pattern เดียวกับ .../wallet/page.tsx
 *
 * TFR-007 (gate ไม่ leak data): เมื่อ status !== 'ACTIVE' — return ก่อนถึง Promise.all
 * ด้านล่างเสมอ ไม่มี query stock/product เพิ่มเติมใด ๆ ในสาขานี้
 *
 * InventoryGate.tsx (S-12 เดิม) — deleted (spec Open Q1: dead-code, แทนที่ด้วย PackageSelector
 * เต็มรูปแล้ว ไม่มี import ที่อื่นเหลือ นอกจาก page.tsx นี้ที่แก้ไปแล้ว)
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Icon as IconifyIcon } from '@iconify/react'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { prisma } from '@/lib/prisma'
import { getBalance } from '@/services/wallet.service'
import {
  getEntitlementInfo,
  shouldWarnAdvance,
} from '@/services/inventory-entitlement.service'
import {
  PACKAGE_PRICE,
  PACKAGE_LABEL_TH,
  type EntitlementStatus,
  type InventoryPackage,
} from '@/lib/inventory-addon'
import { formatDateTime } from '@/lib/format-date'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import PackageSelector from './components/PackageSelector'
import UpgradeToProCard from './components/UpgradeToProCard'
import AdvanceWarningBanner from './components/AdvanceWarningBanner'
import InventoryManagementTable, {
  type InventoryProductRow,
} from './components/InventoryManagementTable'
import InventoryProTools from './components/InventoryProTools'

export const metadata: Metadata = { title: 'จัดการสต็อก' }

export default async function InventoryPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  let shop: { id: string } | null = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) {
    // ไม่มีร้าน — pattern เดียวกับ products/new-v2/page.tsx:40-60
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <IconifyIcon
          icon="tabler:building-store"
          width={64}
          height={64}
          className="text-warning mx-auto mb-4"
        />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">เปิดร้านก่อนนะคะ ถึงจะจัดการสต็อกได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <IconifyIcon icon="tabler:plus" width={18} height={18} />
          เปิดร้าน
        </Link>
      </div>
    )
  }

  // fail-closed (TFR-007) — error ใด ๆ ระหว่าง resolve entitlement ถือว่า NOT_SUBSCRIBED
  // (SDS §3.2 — ใช้ getEntitlementInfo แทน getEntitlementStatus เดิม เพื่อได้ package ในควอรี่เดียว
  // สำหรับ branch ACTIVE ด้านล่าง; branch นี้ (NOT_SUBSCRIBED/LOCKED) ไม่ต้องใช้ package)
  let status: EntitlementStatus = 'NOT_SUBSCRIBED'
  try {
    status = (await getEntitlementInfo(shop.id)).status
  } catch {
    status = 'NOT_SUBSCRIBED'
  }

  if (status !== 'ACTIVE') {
    // ⚠️ TFR-007 — ห้าม query stock/product เพิ่มเติมในสาขานี้ (gate ไม่ leak data)
    let lockedAt: string | null = null
    if (status === 'LOCKED') {
      try {
        const row = await prisma.inventoryEntitlement.findUnique({
          where: { shopId: shop.id },
          select: { lockedAt: true },
        })
        lockedAt = row?.lockedAt ? formatDateTime(row.lockedAt) : null
      } catch {
        lockedAt = null
      }
    }
    // S-15/S-16: PackageSelector แทน InventoryGate เดิม — mode ผูกกับ status
    // (NOT_SUBSCRIBED → subscribe, LOCKED → reactivate + banner ในตัว component เอง)
    return (
      <>
        <PageBreadcrumb title="จัดการสต็อก" trail={[{ label: 'การขาย' }]} />
        <PackageSelector mode={status === 'LOCKED' ? 'reactivate' : 'subscribe'} lockedAt={lockedAt} />
      </>
    )
  }

  // ACTIVE — โหลด entitlement (สำหรับ warn banner + package) + balance + รายการสินค้า PHYSICAL พร้อมกัน
  // SDS §3.2 call-site: select เพิ่ม package: true
  const [entitlement, balance, products] = await Promise.all([
    prisma.inventoryEntitlement.findUnique({
      where: { shopId: shop.id },
      select: { status: true, package: true, nextRenewalAt: true },
    }),
    getBalance(shop.id).catch(() => 0),
    prisma.product.findMany({
      where: { shopId: shop.id, type: 'PHYSICAL', isActive: true },
      select: { id: true, name: true, images: true, stockQty: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  // fail-closed เพิ่มเติม — ถ้า package หาย (ไม่ควรเกิดเพราะ ACTIVE row ต้องมี package เสมอ) ถือเป็น BASIC
  const activePackage: InventoryPackage = (entitlement?.package as InventoryPackage) ?? 'BASIC'
  const isPro = activePackage === 'PRO'

  // SDS §3.2 call-site: shouldWarnAdvance({status, package, nextRenewalAt}, balance)
  const warn = shouldWarnAdvance(
    entitlement
      ? { status: entitlement.status as EntitlementStatus, package: activePackage, nextRenewalAt: entitlement.nextRenewalAt }
      : null,
    balance,
  )

  // serialize ก่อนข้าม RSC boundary — Date→string (formatDateTime), images(Json)→image (string|null)
  const rows: InventoryProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    image: Array.isArray(p.images) && p.images.length > 0 ? (p.images[0] as string) : null,
    stockQty: p.stockQty,
    updatedAt: formatDateTime(p.updatedAt),
  }))

  return (
    <>
      <PageBreadcrumb title="จัดการสต็อก" trail={[{ label: 'การขาย' }]} />

      {/* badge แพ็กเกจปัจจุบัน — Base markup: admin/(dashboard)/topups/[id]/page.tsx:253-258
          (badge span ใน card-header pattern) ปรับมาแปะเดี่ยวใต้ breadcrumb แทนใน card-header
          เพราะหน้านี้ไม่มี card-header ครอบทั้งหน้า */}
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`badge inline-flex items-center gap-1 ${
            // Pro badge ใช้ warning token แทน gold (Paces ไม่มี gold token) — UX-Design-Spec.md
            // §Design Decision #5 + S-16: bg-warning/15 text-warning + icon crown
            isPro ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'
          }`}
        >
          {isPro && <Icon icon="crown" className="size-3.5" aria-hidden="true" />}
          {PACKAGE_LABEL_TH[activePackage]}
        </span>
      </div>

      {warn && entitlement && (
        <AdvanceWarningBanner
          nextRenewalAt={formatDateTime(entitlement.nextRenewalAt)}
          shortfall={PACKAGE_PRICE[activePackage] - balance}
        />
      )}

      {/* BASIC ACTIVE → การ์ดโปรโมทอัพเกรด / PRO ACTIVE → เครื่องมือ Pro (CSV export/import) */}
      {!isPro && <UpgradeToProCard />}
      {isPro && <InventoryProTools />}

      <InventoryManagementTable products={rows} isPro={isPro} />
    </>
  )
}
