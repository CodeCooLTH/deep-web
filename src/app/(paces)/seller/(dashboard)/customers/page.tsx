/**
 * Customers list — ลูกค้าของร้าน (ผู้ที่เคยสั่งซื้อ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/page.tsx
 *
 * เปลี่ยน: ดึง customers จาก orders จริง (ไม่ใช้ demo data)
 * ตัด: StatStrip (เป็นของ S20), AddCustomerModal (seller ไม่ add customers เอง)
 *
 * dedupe (S-1, 00014-ext): เดิม group ด้วย raw buyerUserId/contact ตรง ๆ ทำให้ลูกค้าคนเดียวกันที่
 * พิมพ์เบอร์ต่าง format กันในแต่ละออเดอร์โผล่เป็นคนละแถว — ย้ายมาใช้ `makeCustomerRowKey`
 * (`@/lib/customer-row-key`) ซึ่งให้ `customerId` (Customer กลางจาก feature 00014) ชนะก่อนเสมอ
 *
 * ยอดขาย (S-3, SSOT): เดิมเช็คสถานะยืนยันเดี่ยว ๆ + ผลรวมจาก items (ไม่รวม VAT/discount/
 * shipping) ทำให้ตัวเลขไม่ตรงกับ dashboard/รายงานยอดขายที่ใช้ `countsAsRevenue` + `totalAmount`
 * อยู่แล้ว — เปลี่ยนมาใช้ทั้งสองตัวนี้เพื่อให้เลขตรงกันทุกหน้าจอ
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { getServerSession } from 'next-auth'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { makeCustomerRowKey } from '@/lib/customer-row-key'
import { countsAsRevenue } from '@/lib/order-revenue'
import type { Metadata } from 'next'
import type { CustomerRow } from './components/data'
import CustomerTable from './components/CustomerTable'

export const metadata: Metadata = { title: 'ลูกค้า' }

/** PDPA masking: แสดงแค่ 4 ตัวท้าย ปิดส่วนที่เหลือ */
function maskContact(c: string | null | undefined): string {
  if (!c || c.length <= 4) return c ?? '—'
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

export default async function CustomersPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  if (!active) {
    return (
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon icon="building-store" className="size-16 text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะดูลูกค้าได้</p>
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

  const shop = active.shop

  let orders: any[] = []
  try {
    orders = await prisma.order.findMany({
      where: { shopId: shop.id },
      select: {
        createdAt: true,
        customerId: true,
        buyerUserId: true,
        buyerContact: true,
        buyerName: true,
        status: true,
        totalAmount: true,
        // เฉพาะ field ที่ countsAsRevenue (@/lib/order-revenue) ต้องใช้ตัดสิน SHIPPED+ขนส่งรับของแล้ว
        shipments: { select: { status: true, isDryRun: true, carrierStatus: true } },
        buyer: { select: { id: true, username: true, displayName: true, avatar: true, deletedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  } catch {
    orders = []
  }

  // รวม orders เป็น customer rows — group by opaque key (ไม่ใช้ raw contact เป็น key)
  const map = new Map<string, CustomerRow>()
  for (const o of orders) {
    // PDPA fix: key ต้องไม่ใช่ raw contact — customerId (SSOT 00014) > buyerUserId > hash contact
    const key = makeCustomerRowKey(o.customerId, o.buyerUserId, o.buyerContact)
    const existing = map.get(key)
    const orderTotal = Number(o.totalAmount)
    const isCompleted = countsAsRevenue(o)
    if (existing) {
      existing.totalOrders += 1
      if (isCompleted) existing.totalSpent += orderTotal
      // อัปเดต lastOrder ถ้าใหม่กว่า
      const oTime = new Date(o.createdAt).getTime()
      if (oTime > existing.lastOrderRaw) {
        existing.lastOrderRaw = oTime
        // แปลง Date → ISO string เพื่อส่ง RSC → client component ได้อย่างปลอดภัย
        existing.lastOrderISO = new Date(o.createdAt).toISOString()
      }
    } else {
      // user ที่ soft-delete แล้ว (deletedAt ตั้งแล้วยังไม่ purge) ต้อง render เป็น guest-like —
      // ไม่มีลิงก์ /u/{username} เพราะ findByUsername กัน deletedAt ที่ต้นทางแล้ว ลิงก์จะ 404
      const isReg = !!o.buyer && !o.buyer.deletedAt
      // registered → displayName; guest → ชื่อที่ seller กรอกตอนสร้างออเดอร์ (o.buyerName);
      // ไม่ได้กรอกชื่อ → fallback label "ลูกค้าทั่วไป" + initial '?'
      const typedName = o.buyerName?.trim() || ''
      const name = isReg ? (o.buyer?.displayName ?? 'สมาชิก') : (typedName || 'ลูกค้าทั่วไป')
      const initial = isReg
        ? (name.charAt(0).toUpperCase() || '?')
        : (typedName ? typedName.charAt(0).toUpperCase() : '?')
      map.set(key, {
        key,
        displayName: name,
        initial,
        contact: maskContact(o.buyerContact),
        isRegistered: isReg,
        username: isReg ? (o.buyer?.username ?? null) : null,
        totalOrders: 1,
        totalSpent: isCompleted ? orderTotal : 0,
        // แปลง Date → ISO string เพื่อส่ง RSC → client component ได้อย่างปลอดภัย
        lastOrderISO: new Date(o.createdAt).toISOString(),
        lastOrderRaw: new Date(o.createdAt).getTime(),
      })
    }
  }

  const customers = Array.from(map.values()).sort((a, b) => b.lastOrderRaw - a.lastOrderRaw)

  return (
    <>
      <PageBreadcrumb title="ลูกค้า" subtitle="ร้านค้า" />
      <CustomerTable customers={customers} />
    </>
  )
}
