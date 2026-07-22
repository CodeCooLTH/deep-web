/**
 * เพิ่มห้องพัก (feature 00017 Phase 1)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx (โครง gate + PageBreadcrumb เดียวกัน)
 *
 * IMPORTANT: gate ด้วย vertical เองที่ระดับหน้า — การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ (BR-LODG-03)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import RoomForm from '../components/RoomForm'

export const metadata: Metadata = { title: 'เพิ่มห้องพัก' }

export default async function NewRoomPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (active.shop.vertical !== 'LODGING') notFound()

  return (
    <>
      <PageBreadcrumb title="เพิ่มห้องพัก" subtitle="ห้องพัก" />
      <RoomForm />
    </>
  )
}
