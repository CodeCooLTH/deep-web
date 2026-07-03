/**
 * Movement history page — /inventory/movements/[productId] (S-19, feature 00009 Deep Stock Pro)
 *
 * Base:
 *   - session guard + breadcrumb shell ← src/app/(paces)/seller/(dashboard)/inventory/page.tsx (โครง "ไม่มีร้าน" +
 *     PageBreadcrumb pattern; ancestor theme: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx)
 *   - back-link ← src/app/(paces)/admin/(dashboard)/topups/[id]/page.tsx:107-116
 *     (next/link ตรง ๆ บน <a> — ห้าม component={Link}, ancestor theme: .../issue-tracker/components/IssueDetailModal.tsx)
 *   - mini-header (thumbnail+ชื่อ+stockQty) ← .../inventory/components/InventoryManagementTable.tsx:64-87
 *     (คอลัมน์ "สินค้า" thumbnail+name cell, ancestor theme: .../product-stocks/components/ProductStockTable.tsx)
 *   - gate card (PRO-gate) ← .../inventory/components/InventoryGate.tsx (ตัด feature list + subscribe CTA
 *     เหลือ title/subtitle/back-link) — ancestor theme: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 *     (card > card-body p-7.5 text-center)
 *
 * PRO-gate (TFR-DSP-09 / API.md §4.5): isProActive(shop.id) เช็คก่อนเสมอ — ถ้า false
 * return gate card ทันที ไม่ query product/movement ต่อ (data-leak guard เดียวกับ TFR-007 ใน inventory/page.tsx)
 *
 * Ownership guard: product.findUnique แล้วเช็ค shopId===shop.id ด้วยตัวเอง (ไม่ WHERE compound
 * เพราะต้อง notFound() แยกจาก "ไม่มีร้าน" — กัน leak ชื่อ/รูปสินค้าของร้านอื่นผ่าน 404 ปกติ)
 *
 * Next.js 16: params เป็น Promise → await
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { isProActive } from '@/services/inventory-entitlement.service'
import { getStockMovementHistory } from '@/services/inventory-stock.service'
import { prisma } from '@/lib/prisma'
import MovementHistoryTable, { type MovementRow } from './MovementHistoryTable'

export const metadata: Metadata = { title: 'ประวัติการเคลื่อนไหว' }

type PageProps = {
  params: Promise<{ productId: string }>
}

export default async function MovementHistoryPage({ params }: PageProps) {
  const { productId } = await params

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
    // ไม่มีร้าน — pattern เดียวกับ inventory/page.tsx
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon icon="building-store" width={64} height={64} className="text-warning mx-auto mb-4" />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">เปิดร้านก่อนนะคะ ถึงจะดูประวัติการเคลื่อนไหวสต็อกได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <Icon icon="plus" width={18} height={18} />
          เปิดร้าน
        </Link>
      </div>
    )
  }

  // fail-closed — error ใด ๆ ระหว่าง resolve entitlement ถือว่าไม่ใช่ PRO (เหมือน TFR-007 fail-closed pattern)
  let pro = false
  try {
    pro = await isProActive(shop.id)
  } catch {
    pro = false
  }

  if (!pro) {
    // ⚠️ PRO-gate — ห้าม query product/movement เพิ่มเติมในสาขานี้ (data-leak guard)
    return (
      <>
        <PageBreadcrumb title="ประวัติการเคลื่อนไหว" trail={[{ label: 'จัดการสต็อก', href: '/inventory' }]} />
        <div className="card mx-auto max-w-md">
          <div className="card-body p-7.5 text-center">
            <Icon icon="lock" width={48} height={48} className="text-warning mx-auto mb-4" />
            <h3 className="mb-1.25 text-xl font-bold">ประวัติการเคลื่อนไหวสต็อกเป็นฟีเจอร์ Pro</h3>
            <p className="text-default-400 mb-6">อัพเกรดเป็น Deep Stock Pro เพื่อดูประวัติ</p>
            <Link
              href="/inventory"
              className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
            >
              <Icon icon="arrow-left" width={18} height={18} />
              กลับไปหน้าจัดการสต็อก
            </Link>
          </div>
        </div>
      </>
    )
  }

  // Ownership check — เช็คเองแทน WHERE compound เพื่อแยก 404 กรณี "ไม่ใช่ของร้านนี้" (กัน leak)
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, images: true, stockQty: true, shopId: true },
  })
  if (!product || product.shopId !== shop.id) notFound()

  const history = await getStockMovementHistory(shop.id, product.id, { take: 20 })
  // serialize ก่อนข้าม RSC boundary — Date → ISO string (cursor ใช้ต่อกับ API เดิม, format ที่ client)
  const rows: MovementRow[] = history.items.map((m) => ({
    id: m.id,
    delta: m.delta,
    resultingQty: m.resultingQty,
    source: m.source,
    note: m.note,
    actorUserId: m.actorUserId,
    createdAt: m.createdAt.toISOString(),
  }))

  const image = Array.isArray(product.images) && product.images.length > 0 ? (product.images[0] as string) : null

  return (
    <>
      <PageBreadcrumb title="ประวัติการเคลื่อนไหว" trail={[{ label: 'จัดการสต็อก', href: '/inventory' }]} />

      {/* back-link — next/link ตรง ๆ บน <a> (ห้าม component={Link} ใน RSC — HR2) */}
      <div className="mb-4">
        <Link
          href="/inventory"
          className="text-default-500 hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <Icon icon="arrow-left" className="text-base" />
          กลับหน้าจัดการสต็อก
        </Link>
      </div>

      {/* mini-header — thumbnail + ชื่อสินค้า + stockQty ปัจจุบัน */}
      <div className="card mb-4">
        <div className="card-body flex items-center gap-4">
          <div className="size-14 shrink-0">
            {image ? (
              <Image src={image} alt={product.name} width={56} height={56} className="size-14 rounded-lg object-cover" />
            ) : (
              <div className="bg-default-100 flex size-14 items-center justify-center rounded-lg">
                <Icon icon="package" className="text-default-300 size-6" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-dark truncate text-lg font-semibold">{product.name}</h4>
            <p className="text-default-500 text-sm">
              คงเหลือปัจจุบัน: {product.stockQty !== null ? product.stockQty : '—'} ชิ้น
            </p>
          </div>
        </div>
      </div>

      <MovementHistoryTable
        productId={product.id}
        initialItems={rows}
        initialNextCursor={history.nextCursor}
      />
    </>
  )
}
