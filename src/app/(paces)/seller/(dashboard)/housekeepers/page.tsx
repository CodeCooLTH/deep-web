/**
 * แม่บ้าน (feature 00017 Phase 3, FR-LODG-19)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx (โครง gate + PageBreadcrumb เดียวกัน)
 * IMPORTANT: gate ด้วย vertical เองที่ระดับหน้า (BR-LODG-03)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { listHousekeepers } from '@/services/housekeeping.service'
import HousekeeperList from './components/HousekeeperList'

export const metadata: Metadata = { title: 'แม่บ้าน' }

export default async function HousekeepersPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (active.shop.vertical !== 'LODGING') notFound()

  const items = await listHousekeepers(active.shop.id)
  return (
    <>
      <PageBreadcrumb title="แม่บ้าน" />
      {/* name/phone เป็น PII ภายในร้าน — หน้านี้เป็นฝั่ง seller เท่านั้น ไม่มีทางไปฝั่งผู้จอง */}
      <HousekeeperList
        initial={items.map((h) => ({ id: h.id, name: h.name, phone: h.phone, isActive: h.isActive }))}
      />
    </>
  )
}
