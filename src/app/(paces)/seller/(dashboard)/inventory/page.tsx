/**
 * InventoryPage — S-12 (feature 00003 Inventory Add-on), ชิ้นสุดท้าย: integrate ทุก component
 *
 * Base: docs/20 - Features/00003 - Inventory Add-on/SDS.md §5.1 (pseudocode เต็มของ InventoryPage)
 * ประกอบจาก component ที่ source มาจาก theme แล้ว (S-12 ก่อนหน้า, commit 2dae2f9/b17dcfc):
 *   - InventoryGate (Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx +
 *     src/app/(paces)/seller/(dashboard)/wallet/components/WalletCard.tsx:42-52)
 *   - AdvanceWarningBanner (Base: WalletCard.tsx low-balance chip ขยายเป็น banner)
 *   - InventoryManagementTable (Base: theme/paces/Admin/TS/.../product-stocks/components/ProductStockTable.tsx +
 *     src/app/(paces)/seller/(dashboard)/wallet/components/WalletTransactionTable.tsx)
 * "no-shop" card: pattern เดียวกับ src/app/(paces)/seller/(fullscreen)/products/new-v2/page.tsx:40-60
 * page shell (session guard + PageBreadcrumb): pattern เดียวกับ .../wallet/page.tsx
 *
 * TFR-007 (gate ไม่ leak data): เมื่อ status !== 'ACTIVE' — return ก่อนถึง Promise.all
 * ด้านล่างเสมอ ไม่มี query stock/product เพิ่มเติมใด ๆ ในสาขานี้
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { prisma } from '@/lib/prisma'
import { getBalance } from '@/services/wallet.service'
import {
  getEntitlementStatus,
  shouldWarnAdvance,
} from '@/services/inventory-entitlement.service'
import { INVENTORY_ADDON_PRICE, type EntitlementStatus } from '@/lib/inventory-addon'
import { formatDateTime } from '@/lib/format-date'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import InventoryGate from './components/InventoryGate'
import AdvanceWarningBanner from './components/AdvanceWarningBanner'
import InventoryManagementTable, {
  type InventoryProductRow,
} from './components/InventoryManagementTable'

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
        <Icon
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
          <Icon icon="tabler:plus" width={18} height={18} />
          เปิดร้าน
        </Link>
      </div>
    )
  }

  // fail-closed (TFR-007) — error ใด ๆ ระหว่าง resolve entitlement ถือว่า NOT_SUBSCRIBED
  let status: EntitlementStatus = 'NOT_SUBSCRIBED'
  try {
    status = await getEntitlementStatus(shop.id)
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
    return (
      <>
        <PageBreadcrumb title="จัดการสต็อก" trail={[{ label: 'การขาย' }]} />
        <InventoryGate status={status} lockedAt={lockedAt} />
      </>
    )
  }

  // ACTIVE — โหลด entitlement (สำหรับ warn banner) + balance + รายการสินค้า PHYSICAL พร้อมกัน
  const [entitlement, balance, products] = await Promise.all([
    prisma.inventoryEntitlement.findUnique({
      where: { shopId: shop.id },
      select: { status: true, nextRenewalAt: true },
    }),
    getBalance(shop.id).catch(() => 0),
    prisma.product.findMany({
      where: { shopId: shop.id, type: 'PHYSICAL', isActive: true },
      select: { id: true, name: true, images: true, stockQty: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const warn = shouldWarnAdvance(
    entitlement ? { status: entitlement.status as EntitlementStatus, nextRenewalAt: entitlement.nextRenewalAt } : null,
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
      {warn && entitlement && (
        <AdvanceWarningBanner
          nextRenewalAt={formatDateTime(entitlement.nextRenewalAt)}
          shortfall={INVENTORY_ADDON_PRICE - balance}
        />
      )}
      <InventoryManagementTable products={rows} />
    </>
  )
}
