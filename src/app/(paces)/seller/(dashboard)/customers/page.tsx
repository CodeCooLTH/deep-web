/**
 * Customers list — ลูกค้าของร้าน (ผู้ที่เคยสั่งซื้อ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/page.tsx
 *
 * เปลี่ยน: ดึง customers จาก orders จริง (ไม่ใช้ demo data)
 * ตัด: StatStrip (เป็นของ S20), AddCustomerModal (seller ไม่ add customers เอง)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShopByUserId } from '@/services/shop.service'
import { getServerSession } from 'next-auth'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { createHash } from 'crypto'
import type { Metadata } from 'next'
import type { CustomerRow } from './components/data'
import CustomerTable from './components/CustomerTable'

export const metadata: Metadata = { title: 'ลูกค้า' }

/** PDPA masking: แสดงแค่ 4 ตัวท้าย ปิดส่วนที่เหลือ */
function maskContact(c: string | null | undefined): string {
  if (!c || c.length <= 4) return c ?? '—'
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

/**
 * สร้าง row key ที่ไม่สามารถย้อนกลับเป็น raw contact ได้
 * — registered buyer: ใช้ buyerUserId โดยตรง (ไม่มี PII)
 * — guest buyer: SHA-256 ของ raw contact → 16 hex chars (server-side เท่านั้น)
 * ค่านี้ใช้แค่เพื่อ Map grouping (dedupe) และ React list identity
 * ไม่มีข้อมูลส่วนตัวข้ามไปยัง RSC payload
 */
function makeRowKey(buyerUserId: string | null | undefined, contact: string | null | undefined): string {
  if (buyerUserId) return buyerUserId
  if (!contact) return 'guest-unknown'
  return 'g-' + createHash('sha256').update(contact).digest('hex').slice(0, 16)
}

export default async function CustomersPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  let shop: { id: string } | null = null
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

  let orders: any[] = []
  try {
    orders = await prisma.order.findMany({
      where: { shopId: shop.id },
      include: {
        items: true,
        buyer: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  } catch {
    orders = []
  }

  // รวม orders เป็น customer rows — group by hashed key (ไม่ใช้ raw contact เป็น key)
  const map = new Map<string, CustomerRow>()
  for (const o of orders) {
    // PDPA fix: key ต้องไม่ใช่ raw contact — ใช้ userId หรือ hash ที่ย้อนกลับไม่ได้แทน
    const key = makeRowKey(o.buyerUserId, o.buyerContact)
    const existing = map.get(key)
    const itemTotal = o.items.reduce(
      (s: number, i: any) => s + Number(i.price ?? 0) * (i.qty ?? 1),
      0
    )
    const isCompleted = o.status === 'CONFIRMED'
    if (existing) {
      existing.totalOrders += 1
      if (isCompleted) existing.totalSpent += itemTotal
      // อัปเดต lastOrder ถ้าใหม่กว่า
      const oTime = new Date(o.createdAt).getTime()
      if (oTime > existing.lastOrderRaw) {
        existing.lastOrderRaw = oTime
        // แปลง Date → ISO string เพื่อส่ง RSC → client component ได้อย่างปลอดภัย
        existing.lastOrderISO = new Date(o.createdAt).toISOString()
      }
    } else {
      const isReg = !!o.buyer
      // guest: ใช้ label "ลูกค้าทั่วไป" (ไม่ใช่เบอร์ masked ซ้ำกับ contact) + initial เป็น '?'
      // (เลี่ยง bullet '•' จาก masked contact) — registered ใช้ชื่อจริง + อักษรแรก
      const name = isReg ? (o.buyer?.displayName ?? 'สมาชิก') : 'ลูกค้าทั่วไป'
      const initial = isReg ? (name.charAt(0).toUpperCase() || '?') : '?'
      map.set(key, {
        key,
        displayName: name,
        initial,
        contact: maskContact(o.buyerContact),
        isRegistered: isReg,
        username: o.buyer?.username ?? null,
        totalOrders: 1,
        totalSpent: isCompleted ? itemTotal : 0,
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
