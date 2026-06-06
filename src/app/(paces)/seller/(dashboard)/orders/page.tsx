/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 *
 * Adaptations:
 * - stat cards: ใช้ OrdersStatCard (จาก theme) แทน StatStrip (shared — task S20 จะ handle ทีหลัง)
 * - data fetching: getOrdersByShop (SafePay service) + getShopByUserId
 * - Date boundary: createdAt → .toISOString() ก่อนส่งผ่าน RSC→client boundary
 * - "no shop" guard เก็บไว้ (ไม่มีใน theme แต่จำเป็นสำหรับ seller ที่ยังไม่ตั้งร้าน)
 * - maskContact ใช้ซ่อน buyer contact (PDPA-lite)
 * - productId → productImagesById lookup ถูก stripped: ไม่มีคอลัมน์รูปภาพในหน้า list แล้ว
 * - StatStrip import ลบออก — ไม่แก้ไขไฟล์ _shared/StatStrip.tsx
 */

import { authOptions } from '@/lib/auth'
import { getOrdersByShop } from '@/services/order.service'
import { getShopByUserId } from '@/services/shop.service'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'
import type { OrderRow, OrderStatType, OrderItemRow } from './components/data'
import OrdersList from './components/OrdersList'
import OrdersStatCard from './components/OrdersStatCard'

export const metadata: Metadata = { title: 'ออเดอร์' }

function maskContact(c: string | null | undefined): string {
  if (!c || c.length <= 4) return c ?? '—'
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const sp = await searchParams

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) {
    return (
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon icon="building-store" className="size-16 text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะดูออเดอร์ได้</p>
        <Link
          href="/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="plus" />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  let rawOrders: any[] = []
  try {
    // ดึงทุก order ของร้าน — client component ทำ status filter เอง
    rawOrders = await getOrdersByShop(shop.id)
  } catch {
    rawOrders = []
  }

  // แปลง rawOrder → OrderRow, Date → ISO string ที่ RSC boundary (ห้ามส่ง Date object ข้าม boundary)
  const orders: OrderRow[] = rawOrders.map((o: any) => ({
    id: (o.publicToken ?? o.id).slice(0, 8),
    publicToken: o.publicToken ?? o.id,
    buyer: maskContact(o.buyerContact),
    orderType: o.type ?? 'PHYSICAL',
    total: Number(o.totalAmount ?? 0),
    status: o.status,
    // ISO string — client component จะ format เป็นภาษาไทย
    createdAtISO: o.createdAt ? new Date(o.createdAt).toISOString() : '',
    // Phase A Unit A: buyer identity (null = guest ยังไม่ register)
    // buyerContact ยัง mask อยู่ใน field `buyer` ด้านบน — ไม่ลด PII boundary
    buyerName: o.buyer?.displayName ?? null,
    buyerUsername: o.buyer?.username ?? null,
    // F2: map OrderItem → OrderItemRow; imageUrl = /api/files/{images[0]} ถ้า product มีรูป
    // Decimal.price → Number เพื่อกัน serialization error ที่ RSC boundary
    items: (o.items ?? []).map((item: any): OrderItemRow => {
      const images = item.product?.images
      const firstImageId = Array.isArray(images) && images.length > 0 ? images[0] : null
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: Number(item.price),
        imageUrl: firstImageId ? `/api/files/${firstImageId}` : null,
      }
    }),
  }))

  // คำนวณค่า stat card จาก orders ที่ fetch มา
  const totalCount     = orders.length
  const pendingCount   = orders.filter((o) => o.status === 'PENDING').length
  const activeCount    = orders.filter((o) => o.status === 'SHIPPED').length
  const completedCount = orders.filter((o) => o.status === 'CONFIRMED').length
  const cancelledCount = orders.filter((o) => o.status === 'CANCELLED').length

  // stat card data ตาม OrderStatType (theme format)
  const orderStatData: OrderStatType[] = [
    { title: 'ออเดอร์ทั้งหมด', value: totalCount,     change: 0, icon: 'shopping-cart',   className: 'bg-info' },
    { title: 'รอดำเนินการ',    value: pendingCount,   change: 0, icon: 'hourglass',       className: 'bg-warning' },
    { title: 'จัดส่งแล้ว',    value: activeCount,    change: 0, icon: 'truck-delivery',  className: 'bg-primary' },
    { title: 'สำเร็จแล้ว',    value: completedCount, change: 0, icon: 'check',           className: 'bg-success' },
    { title: 'ยกเลิก',        value: cancelledCount, change: 0, icon: 'x',               className: 'bg-danger' },
  ]

  const activeStatus = sp.status ?? 'all'

  return (
    <>
      <PageBreadcrumb title="คำสั่งซื้อ" trail={[{ label: 'การขาย' }]} />

      {/* Stat cards — 5 columns (theme grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-5) */}
      <div className="mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-5">
        {orderStatData.map((item, idx) => (
          <OrdersStatCard item={item} key={idx} />
        ))}
      </div>

      <OrdersList orders={orders} activeStatus={activeStatus} />
    </>
  )
}
