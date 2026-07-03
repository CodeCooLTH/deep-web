/**
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx (RSC detail pattern)
 *
 * Batch E#11 — detail console `/seller/auctions/[id]` (static render, ยังไม่ realtime — #12 เติม subscribe)
 * - ownership scope ที่ `getSellerAuctionDetail` (findFirst WHERE id AND shop.userId ที่ query — ไม่ใช่
 *   post-check) → คืน null ทั้งกรณี "ไม่พบ" และ "ไม่ใช่เจ้าของ" → notFound() เดียวกันทั้งคู่
 *   (กัน enumeration ตาม feedback_rsc_dal_authz)
 * - pass เฉพาะ `SellerAuctionDTO` (primitive ล้วน, mapper ทำที่ server แล้ว) เข้า client component
 *   ห้าม pass Prisma row ดิบ (feedback_rsc_pii_neutralize_at_source / SDS §8.3)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getSellerAuctionDetail } from '@/services/auction.service'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import AuctionConsoleClient from './components/AuctionConsoleClient'

export const metadata: Metadata = { title: 'รายละเอียดประมูล' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AuctionDetailPage({ params }: PageProps) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/auctions')

  // ownership scope อยู่ใน service (WHERE id AND shop.userId=shopUserId) — ไม่ใช่ post-check ที่นี่
  const auction = await getSellerAuctionDetail(id, user.id)
  if (!auction) notFound()

  return (
    <>
      <div className="hidden lg:block">
        <PageBreadcrumb title="รายละเอียดประมูล" trail={[{ label: 'การประมูล', href: '/auctions' }]} />
      </div>

      <AuctionConsoleClient auction={auction} />
    </>
  )
}
