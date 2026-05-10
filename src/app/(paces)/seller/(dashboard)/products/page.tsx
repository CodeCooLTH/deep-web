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
import type { ProductRow } from './components/data'
import StatStrip from '../_shared/StatStrip'
import type { StatStripItem } from '../_shared/StatStrip'

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
        <PageBreadcrumb title="สินค้า" trail={[{ label: 'Business' }]} />
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
  const productRows: ProductRow[] = products.map((p: any) => {
    const soldEntries = orders
      .filter((o: any) => o.status === 'COMPLETED')
      .flatMap((o: any) => (Array.isArray(o.items) ? o.items : []))
      .filter((i: any) => i.productId === p.id)
    const totalSold = soldEntries.reduce((s: number, i: any) => s + (i.qty ?? 1), 0)

    const productReviews = orders
      .filter(
        (o: any) =>
          o.status === 'COMPLETED' && o.review && Array.isArray(o.items)
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
    }
  })

  // --- Derive stats ---
  const completedOrders = orders.filter((o: any) => o.status === 'COMPLETED')

  const totalRevenue = completedOrders
    .flatMap((o: any) => (Array.isArray(o.items) ? o.items : []))
    .reduce((sum: number, i: any) => sum + Number(i.price ?? 0) * (i.qty ?? 1), 0)

  // Best-seller by totalSold
  const topProduct = productRows.reduce<{ name: string; sales: number } | null>((best, p) => {
    if (!best || p.totalSold > best.sales) return { name: p.name, sales: p.totalSold }
    return best
  }, null)

  const allRatings = productRows.flatMap((p) =>
    Array(p.reviews).fill(p.rating)
  )
  const avgRating =
    allRatings.length > 0
      ? allRatings.reduce((a: number, b: number) => a + b, 0) / allRatings.length
      : 0
  const productCount = products.length
  const totalOrderCount = orders.length
  const topSoldQty = topProduct?.sales ?? 0
  const avgRatingRounded = Math.round(avgRating * 10) / 10

  const stripItems: StatStripItem[] = [
    { title: 'สินค้าทั้งหมด', value: productCount,      change: 0, icon: 'package',       iconClass: 'bg-primary/15 text-primary' },
    { title: 'ออเดอร์',       value: totalOrderCount,   change: 0, icon: 'shopping-cart', iconClass: 'bg-secondary/15 text-secondary' },
    { title: 'รายได้',        value: totalRevenue,      change: 0, icon: 'cash',          iconClass: 'bg-success/15 text-success',  prefix: '฿' },
    { title: 'ขายดี',         value: topSoldQty,        change: 0, icon: 'trending-up',   iconClass: 'bg-warning/15 text-warning' },
    { title: 'เรตติ้งเฉลี่ย', value: avgRatingRounded,  change: 0, icon: 'star',          iconClass: 'bg-info/15 text-info',        suffix: '/5' },
  ]

  return (
    <>
      <PageBreadcrumb title="สินค้า" trail={[{ label: 'Business' }]} />
      <div className="mb-base">
        <StatStrip items={stripItems} />
      </div>
      <ProductsListing products={productRows} />
    </>
  )
}
