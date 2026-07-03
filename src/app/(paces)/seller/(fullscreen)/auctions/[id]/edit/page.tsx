/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 * (page shell pattern เดียวกับ src/app/(paces)/seller/(fullscreen)/products/[id]/edit/page.tsx —
 * server component fetch ผ่าน service ตรง ๆ (RSC DAL, ไม่ผ่าน fetch('/api/...')) แล้วส่ง prop
 * เข้า client form — ownership scope ที่ WHERE clause ของ getSellerAuctionDetail กัน RSC PII leak)
 *
 * Page shell: auth guard + shop lookup + auction lookup (ownership scope ใน service เอง —
 * getSellerAuctionDetail คืน null ทั้งกรณีไม่พบ/ไม่ใช่เจ้าของ → notFound() เหมือนกันทั้งคู่ ตาม
 * API.md §4.3 — ตั้งใจไม่บอกว่า id นั้นมีอยู่จริงไหม)
 *
 * เฉพาะ status draft/scheduled เท่านั้นที่แก้ได้ (TFR-002/API.md §4.4) — status อื่น
 * แสดง banner "แก้ไขไม่ได้ในสถานะนี้" + CTA กลับ แทนฟอร์ม
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getSellerAuctionDetail } from '@/services/auction.service'
import { getProductsByShop } from '@/services/product.service'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import Icon from '@/components/wrappers/Icon'
import AuctionForm from '@/app/(paces)/seller/(fullscreen)/auctions/components/AuctionForm'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import LockedStateBanner from '@/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner'

export const metadata: Metadata = { title: 'แก้ไขรายการประมูล' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditAuctionPage({ params }: PageProps) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  if (!active) {
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon icon="building-store-off" width={64} height={64} className="text-warning mx-auto mb-4" />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะแก้ไขรายการประมูลได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <Icon icon="plus" width={18} height={18} />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  const shop = active.shop

  // Business ถูก package lock (read-only) — ห้ามแก้ไขรายการประมูล
  if (active.locked) {
    return (
      <div className="mx-auto max-w-2xl">
        <LockedStateBanner
          lockReason={active.lockReason ?? ''}
          packageLockedAt={shop.packageLockedAt}
          level="shop"
        />
      </div>
    )
  }

  // ownership scope อยู่ใน WHERE clause ของ service เอง (feedback_rsc_dal_authz) — คืน null
  // ทั้งกรณีไม่พบและไม่ใช่เจ้าของ → notFound() เหมือนกัน (API.md §4.3 ตั้งใจไม่แยก 403/404)
  const auction = await getSellerAuctionDetail(id, user.id)
  if (!auction) notFound()

  const editable = auction.status === 'draft' || auction.status === 'scheduled'

  if (!editable) {
    return (
      <>
        <FullscreenPageHeader title="แก้ไขรายการประมูล" subtitle={auction.title} />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="lock" width={64} height={64} className="text-warning mx-auto mb-4" />
          <h2 className="text-dark mb-2 text-xl font-bold">แก้ไขไม่ได้ในสถานะนี้</h2>
          <p className="text-default-400 mb-6">
            รายการประมูลนี้เปิดรับการเสนอราคาแล้ว (หรือจบไปแล้ว) จึงแก้ไขไม่ได้อีก
          </p>
          <Link
            href="/auctions"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
          >
            <Icon icon="arrow-left" width={18} height={18} />
            กลับไปรายการประมูล
          </Link>
        </div>
      </>
    )
  }

  const products = await getProductsByShop(shop.id, 200)
  const productOptions = products.map((p) => ({ id: p.id, name: p.name }))

  return (
    <>
      <FullscreenPageHeader title="แก้ไขรายการประมูล" subtitle={auction.title} />
      <AuctionForm mode="edit" products={productOptions} auction={auction} />
    </>
  )
}
