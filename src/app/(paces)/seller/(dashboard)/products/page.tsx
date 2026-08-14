/**
 * /seller/products — หน้า listing สินค้าของร้านค้า
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/page.tsx
 * เปลี่ยน:
 *   - ใช้ ProductStats (sourced from theme) แทน StatStrip shared
 *   - statData คำนวณจาก products จริง (count by type)
 *   - fetch products + orders จาก service layer (getProductsByShop, getOrdersByShop)
 *   - createdAt แปลงเป็น ISO string ที่ server boundary ก่อนส่ง props ข้าม RSC→client
 *   - UI copy ภาษาไทย
 *   - feature 00013 Pin Products: เรียก getPinState(shop.id) พร้อมกับ products/orders (Promise.allSettled)
 *     ส่ง pinnedAt ต่อแถว + pinSlots/pinnedCount aggregate ให้ ProductsListing
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getProductsByShop } from '@/services/product.service'
import { getOrdersByShop } from '@/services/order.service'
import { getPinState } from '@/services/pin.service'
import Link from 'next/link'
import type { Metadata } from 'next'
import ProductsListing from './components/ProductsListing'
import ProductStats from './components/ProductStats'
import type { ProductRow } from './components/data'
import type { StatType } from './components/ProductStats'
import { fileUrlOf } from '@/lib/file-url'

export const metadata: Metadata = { title: 'สินค้า' }

export default async function ProductsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  // --- Active shop guard (Phase 4: Personal หรือ Business ตาม context ที่สลับ) ---
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  if (!active) {
    return (
      <>
        <PageBreadcrumb title="สินค้า" trail={[{ label: 'การขาย' }]} />
        <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
          <Icon icon="building-store" className="size-16 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">ยังไม่มีร้านค้า</h2>
          <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะเพิ่มสินค้าได้</p>
          <Link
            href="/shop"
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold"
          >
            <Icon icon="plus" />
            สร้างร้านค้า
          </Link>
        </div>
      </>
    )
  }

  const shop = active.shop

  // --- Fetch products + orders + pin state แบบขนาน (Promise.allSettled — ล้มเหลวอันหนึ่งไม่กระทบอันอื่น) ---
  let products: any[] = []
  let orders: any[] = []
  // fallback ตาม Shop.pinSlots @default(1) — ร้านทุกร้านเริ่มมี 1 free slot (BR-PIN-01)
  let pinState: { pinSlots: number; pinnedCount: number } = { pinSlots: 1, pinnedCount: 0 }

  const [productsResult, ordersResult, pinStateResult] = await Promise.allSettled([
    getProductsByShop(shop.id),
    getOrdersByShop(shop.id),
    getPinState(shop.id),
  ])
  if (productsResult.status === 'fulfilled') products = productsResult.value
  if (ordersResult.status === 'fulfilled') orders = ordersResult.value
  if (pinStateResult.status === 'fulfilled') pinState = pinStateResult.value

  // --- Derive ProductRow data ---
  // createdAt แปลงเป็น ISO string ที่ server boundary — ห้ามส่ง Date object ข้าม RSC→client
  const productRows: ProductRow[] = products.map((p: any) => {
    const soldEntries = orders
      .filter((o: any) => o.status === 'CONFIRMED')
      .flatMap((o: any) => (Array.isArray(o.items) ? o.items : []))
      .filter((i: any) => i.productId === p.id)
    const totalSold = soldEntries.reduce((s: number, i: any) => s + (i.qty ?? 1), 0)

    const productReviews = orders
      .filter(
        (o: any) =>
          o.status === 'CONFIRMED' && o.review && Array.isArray(o.items),
      )
      .filter((o: any) => o.items.some((i: any) => i.productId === p.id))
      .map((o: any) => o.review!.rating as number)

    return {
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      // guard: ถ้า images[0] เป็น full URL (seed picsum / CDN) → ใช้ตรง; ไม่งั้น wrap /api/files/ (storage key)
      image: Array.isArray(p.images) && p.images.length > 0
        ? fileUrlOf(String(p.images[0]))
        : '',
      price: Number(p.price ?? 0),
      // Decimal → number ที่ server boundary (ข้ามเส้น RSC ดิบไม่ได้); null คงเป็น null ไม่แปลงเป็น 0
      cost: p.cost == null ? null : Number(p.cost),
      type: (p.type as ProductRow['type']) ?? 'PHYSICAL',
      isActive: p.isActive ?? true,
      totalSold,
      reviews: productReviews.length,
      rating:
        productReviews.length > 0
          ? productReviews.reduce((a: number, b: number) => a + b, 0) / productReviews.length
          : 0,
      // Date → ISO string ที่ server boundary ก่อนข้าม RSC→client boundary
      createdAt: (p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt)).toISOString(),
      // feature 00013 Pin Products — pinnedAt: Date|null จาก Prisma → ISO string|null ที่ server boundary
      pinnedAt: p.pinnedAt ? (p.pinnedAt instanceof Date ? p.pinnedAt : new Date(p.pinnedAt)).toISOString() : null,
    }
  })

  // --- Derive ProductStats data (count by type) ---
  const countByType = (type: ProductRow['type']) => productRows.filter((p) => p.type === type).length
  const activeCount = productRows.filter((p) => p.isActive).length

  const statData: StatType[] = [
    {
      title: 'สินค้าทั้งหมด',
      value: productRows.length,
      change: 0,
      icon: 'package',
      iconClassName: 'bg-primary/15 text-primary',
      bulletClassName: 'text-primary',
      metric: 'เปิดขาย',
      metricValue: String(activeCount),
    },
    {
      title: 'สินค้าจับต้องได้',
      value: countByType('PHYSICAL'),
      change: 0,
      icon: 'box',
      iconClassName: 'bg-secondary/15 text-secondary',
      bulletClassName: 'text-secondary',
      metric: 'ประเภท PHYSICAL',
      metricValue: String(countByType('PHYSICAL')),
    },
    {
      title: 'ดิจิทัล',
      value: countByType('DIGITAL'),
      change: 0,
      icon: 'device-laptop',
      iconClassName: 'bg-info/15 text-info',
      bulletClassName: 'text-info',
      metric: 'ประเภท DIGITAL',
      metricValue: String(countByType('DIGITAL')),
    },
    {
      title: 'บริการ',
      value: countByType('SERVICE'),
      change: 0,
      icon: 'tools',
      iconClassName: 'bg-success/15 text-success',
      bulletClassName: 'text-success',
      metric: 'ประเภท SERVICE',
      metricValue: String(countByType('SERVICE')),
    },
    {
      title: 'สมาชิก/รอบ',
      value: countByType('SUBSCRIPTION'),
      change: 0,
      icon: 'repeat',
      iconClassName: 'bg-warning/15 text-warning',
      bulletClassName: 'text-warning',
      metric: 'ประเภท SUBSCRIPTION',
      metricValue: String(countByType('SUBSCRIPTION')),
    },
  ]

  return (
    <>
      {/* breadcrumb + stat cards = desktop เท่านั้น; mobile = list สะอาดตาม mockup v10 (ไม่มี stat) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="สินค้า" trail={[{ label: 'การขาย' }]} />

        <div className="mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-5">
          {statData.map((stat, idx) => (
            <ProductStats key={idx} stat={stat} />
          ))}
        </div>
      </div>

      <ProductsListing products={productRows} pinSlots={pinState.pinSlots} pinnedCount={pinState.pinnedCount} />
    </>
  )
}
