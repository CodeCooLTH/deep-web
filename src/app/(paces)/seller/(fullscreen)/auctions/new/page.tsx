/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 * (page shell pattern เดียวกับ src/app/(paces)/seller/(fullscreen)/products/new-v2/page.tsx)
 *
 * Page shell: auth guard + shop lookup + L2 check (server-side, ตรงกับ POST /api/seller/auctions
 * route guard — client แค่ shortcut, server เช็คซ้ำเสมอ) + product list (สำหรับ select เชื่อมสินค้า)
 * แล้ว render AuctionForm mode="create"
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getMaxVerificationLevel } from '@/services/verification.service'
import { getProductsByShop } from '@/services/product.service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import Icon from '@/components/wrappers/Icon'
import AuctionForm from '@/app/(paces)/seller/(fullscreen)/auctions/components/AuctionForm'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import LockedStateBanner from '@/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner'

export const metadata: Metadata = { title: 'สร้างรายการประมูล' }

export default async function NewAuctionPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  if (!active) {
    return (
      <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
        <Icon icon="building-store" width={64} height={64} className="text-warning mx-auto mb-4" />
        <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">เปิดร้านก่อนนะคะ ถึงจะสร้างรายการประมูลได้</p>
        <Link
          href="/shop"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          <Icon icon="plus" width={18} height={18} />
          เปิดร้าน
        </Link>
      </div>
    )
  }

  const shop = active.shop

  // Business ถูก package lock (read-only) — ห้ามสร้างรายการประมูลใหม่
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

  // L2 guard (SDS §4.1 — เช็คซ้ำที่ POST /api/seller/auctions เสมอ นี่คือ shortcut ฝั่ง UI เท่านั้น)
  const maxLevel = await getMaxVerificationLevel(user.id)
  const hasL2 = maxLevel >= 2

  // สินค้าในร้าน — สำหรับ select "เชื่อมโยงสินค้า" (ไม่บังคับ) — cap 200 กันร้านที่มีสินค้าเยอะผิดปกติ
  const products = await getProductsByShop(shop.id, 200)
  const productOptions = products.map((p) => ({ id: p.id, name: p.name }))

  return (
    <>
      <FullscreenPageHeader title="สร้างรายการประมูล" />
      <AuctionForm mode="create" products={productOptions} hasL2={hasL2} />
    </>
  )
}
