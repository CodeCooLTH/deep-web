/**
 * CategoriesPage — หน้าหมวดหมู่สินค้าของร้านค้า (read-only, ประเภทคงที่)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/page.tsx
 *
 * Adapted:
 * - หมวดหมู่ SafePay เป็น FIXED product types (PHYSICAL/DIGITAL/SERVICE) ไม่ใช่ DB-managed CRUD
 * - ดึงข้อมูล products + orders ของร้านจริงจาก service layer
 * - คำนวณ productCount, activeCount, orderCount, revenue แยกตาม type
 * - ไม่มี AddCategoryModal (sellers ไม่สามารถสร้าง/แก้ไขหมวดหมู่เอง)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getProductsByShop } from '@/services/product.service'
import { getOrdersByShop } from '@/services/order.service'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import CategoryTable from './components/CategoryTable'
import type { CategoryRow } from './components/data'

export const metadata: Metadata = { title: 'หมวดหมู่สินค้า' }

const FIXED_CATEGORIES: Array<Pick<CategoryRow, 'key' | 'label' | 'description' | 'icon' | 'iconClass'>> = [
  {
    key: 'PHYSICAL',
    label: 'สินค้าจับต้องได้',
    description: 'สินค้ารูปธรรมที่จัดส่งผ่านขนส่ง',
    icon: 'package',
    iconClass: 'bg-primary/15 text-primary',
  },
  {
    key: 'DIGITAL',
    label: 'สินค้าดิจิทัล',
    description: 'ไฟล์ดาวน์โหลด, license, คอนเทนต์ออนไลน์',
    icon: 'cloud-download',
    iconClass: 'bg-info/15 text-info',
  },
  {
    key: 'SERVICE',
    label: 'บริการ',
    description: 'บริการที่ขายผ่านการนัดหมาย',
    icon: 'tool',
    iconClass: 'bg-success/15 text-success',
  },
]

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/shop')
  const shop = active.shop

  const [products, orders] = await Promise.all([
    getProductsByShop(shop.id).catch(() => []),
    getOrdersByShop(shop.id).catch(() => []),
  ])

  const rows: CategoryRow[] = FIXED_CATEGORIES.map((c) => {
    const ofType = products.filter((p: any) => p.type === c.key)
    const activeOfType = ofType.filter((p: any) => p.isActive)
    const orderMatches = orders.filter(
      (o: any) =>
        Array.isArray(o.items) && o.items.some((i: any) => ofType.find((p: any) => p.id === i.productId)),
    )
    const revenue = orders
      .filter((o: any) => o.status === 'CONFIRMED' && Array.isArray(o.items))
      .reduce((sum: number, o: any) => {
        const typed = o.items.filter((i: any) => ofType.find((p: any) => p.id === i.productId))
        const add = typed.reduce((s: number, i: any) => s + Number(i.price ?? 0) * (i.qty ?? 1), 0)
        return sum + add
      }, 0)

    return {
      key: c.key,
      label: c.label,
      description: c.description,
      icon: c.icon,
      iconClass: c.iconClass,
      productCount: ofType.length,
      activeCount: activeOfType.length,
      orderCount: orderMatches.length,
      revenue,
    }
  })

  return (
    <>
      <PageBreadcrumb title="หมวดหมู่สินค้า" trail={[{ label: 'การขาย' }]} />
      <CategoryTable rows={rows} />
    </>
  )
}
