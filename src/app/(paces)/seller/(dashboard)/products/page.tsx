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
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { getShopByUserId } from '@/services/shop.service'
import { getProductsByShop } from '@/services/product.service'
import { getOrdersByShop } from '@/services/order.service'
import Link from 'next/link'
import type { Metadata } from 'next'
import ProductsListing from './components/ProductsListing'
import ProductStats from './components/ProductStats'
import type { ProductRow } from './components/data'
import type { StatType } from './components/ProductStats'

export const metadata: Metadata = { title: 'สินค้า' }

export default async function ProductsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  // --- Shop guard ---
  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) {
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

  // --- Fetch products + orders ---
  let products: any[] = []
  let orders: any[] = []
  try {
    products = await getProductsByShop(shop.id)
  } catch {
    products = []
  }
  try {
    orders = await getOrdersByShop(shop.id)
  } catch {
    orders = []
  }

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
      image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : '',
      price: Number(p.price ?? 0),
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
      <PageBreadcrumb title="สินค้า" trail={[{ label: 'การขาย' }]} />

      <div className="mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-5">
        {statData.map((stat, idx) => (
          <ProductStats key={idx} stat={stat} />
        ))}
      </div>

      <ProductsListing products={productRows} />
    </>
  )
}
