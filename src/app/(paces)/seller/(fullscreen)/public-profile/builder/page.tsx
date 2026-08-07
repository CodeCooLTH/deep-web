/**
 * ตัวจัดหน้าร้าน (feature 00035, Task 7) — `/public-profile/builder`
 *
 * Server Component: auth guard (OWNER/ADMIN ของร้าน active — TFR-001) + SSR ดึง initial state
 * ครบชุด (layout + blocks + visible tab keys + library หน้าแรก) ส่งลง <BuilderClient> เป็น prop
 * เดียว ไม่มี client-side fetch ซ้ำตอน mount (TFR-001 postcondition)
 *
 * Base: src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx (โครง page.tsx ของหน้า fullscreen —
 *   resolve session→requireActiveShop→fallback card เมื่อไม่มี shop)
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/page.tsx (การคำนวณ publicUrl ข้าม
 *   subdomain ที่ถูกต้อง — proxy.ts เติม /seller นำหน้าทุก path ของ subdomain นี้ ห้ามใช้ path เปล่า
 *   ชี้ /u,/b ตรง ๆ, และ pattern resolve PERSONAL→username vs BUSINESS→slug)
 */
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { toFileUrl } from '@/lib/file-url'
import { prisma } from '@/lib/prisma'
import { applyTabOrder, computeVisibleTabKeys } from '@/lib/profile-tab-keys'
import { requireActiveShop } from '@/lib/shop-context'
import Icon from '@/components/wrappers/Icon'
import { getPinnedProducts } from '@/services/pin.service'
import { getProductsByShop } from '@/services/product.service'
import { getPublicRooms } from '@/services/room.service'
import { listServiceResources } from '@/services/service-resource.service'
import { getShopProfileStats } from '@/services/shop.service'
import {
  getBuilderLibrary,
  getShopPageLayout,
  listShopPageBlocks,
} from '@/services/shop-page-layout.service'
import { getShopVideos } from '@/services/shop-video.service'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'

import BuilderClient from './components/BuilderClient'
import { blockViewToDraftBlock } from './lib/draft'
import type { BuilderDraft, PreviewPanelHeaderData } from './types'

export const metadata: Metadata = { title: 'ตัวจัดหน้าร้าน' }

export default async function ShopPageBuilderPage() {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )

  // (fullscreen)/layout.tsx guard แล้วว่า session/active ต้องมี — defensive fallback ซ้ำเพราะหน้านี้
  // deep-link ตรงเข้ามาได้ (TFR-001 error case)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!active?.shop || !userId) redirect('/dashboard')

  const shop = active.shop

  // (fullscreen)/layout.tsx เช็คเฉพาะ BUSINESS ที่ไม่มี slug (redirect ไป /business/{id}/onboarding)
  // — เช็คนี้ครอบทุก kind ตาม TFR-001 ตรง ๆ (PERSONAL ที่หลุด onboarding มาได้ด้วย edge case ใด ๆ)
  if (!shop.slug) redirect('/onboarding')

  const isLodging = shop.vertical === 'LODGING'
  const isServiceQueue = shop.vertical === 'SERVICE_QUEUE'

  // ── SSR initial state ครบชุด (TFR-001 postcondition) — query ชุดเดียวกับที่ /u,/b ใช้จริง ──────
  const [layout, blocks, library, videos, rooms, services, pinnedProducts, otherProducts, stats, owner, verifiedCount] =
    await Promise.all([
      getShopPageLayout(shop.id),
      listShopPageBlocks(shop.id),
      getBuilderLibrary({ shopId: shop.id, actorUserId: userId }),
      getShopVideos(shop.id),
      isLodging ? getPublicRooms(shop.id) : Promise.resolve([]),
      isServiceQueue ? listServiceResources(shop.id, { activeOnly: true }) : Promise.resolve([]),
      getPinnedProducts(shop.id),
      getProductsByShop(shop.id, undefined, { excludePinned: true }),
      getShopProfileStats(shop.id),
      active.kind === 'PERSONAL'
        ? prisma.user.findUnique({ where: { id: shop.userId }, select: { username: true, avatar: true } })
        : Promise.resolve(null),
      prisma.verificationRecord.count({ where: { userId: shop.userId, status: 'APPROVED' } }),
    ])

  const visibleTabKeys = computeVisibleTabKeys({
    hasVideos: videos.length > 0,
    isLodging,
    hasRooms: rooms.length > 0,
    // getShopAvailability() (room.service.ts:249) ไม่เคยคืน null เมื่อ isLodging จริง — เทียบเท่ากับ
    // isLodging เป๊ะ (ดูที่มาของเงื่อนไขนี้ใน ShopProfile.tsx: hasAvailability = data.availability!=null
    // และ availability = isLodging ? getShopAvailability(...) : null) ไม่ต้อง query ซ้ำเพื่อบูลีนนี้
    hasAvailability: isLodging,
    isServiceQueue,
    hasServices: services.length > 0,
    hasItems: !isLodging && pinnedProducts.length + otherProducts.length > 0,
    hasReviews: stats.ratingDistribution != null && stats.avgRating != null,
  })
  const orderedTabKeys = applyTabOrder(visibleTabKeys, layout.tabOrder)

  // ── URL ข้ามซับโดเมน — pattern เดียวกับ (dashboard)/public-profile/page.tsx ─────────────────
  const host = (await headers()).get('host') ?? ''
  const rootHost = host.replace(/^seller\./, '')
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'

  const handle = active.kind === 'PERSONAL' ? (owner?.username ?? null) : shop.slug
  const pathPrefix = active.kind === 'PERSONAL' ? 'u' : 'b'

  if (!handle) {
    return (
      <>
        <FullscreenPageHeader title="ตัวจัดหน้าร้าน" backHref="/public-profile" />
        <div className="card mx-auto mt-8 max-w-2xl p-10 text-center">
          <Icon icon="link-off" width={48} height={48} className="text-warning mx-auto mb-4" />
          <h2 className="text-dark mb-2 text-xl font-bold">ร้านยังไม่มีชื่อผู้ใช้/ลิงก์สำหรับหน้าร้าน</h2>
          <p className="text-default-500 mb-6">ตั้งค่าได้ที่หน้าตั้งค่าร้านค้าก่อนใช้ตัวจัดหน้าร้าน</p>
          <a href="/shop" className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2">
            ตั้งค่าร้านค้า
          </a>
        </div>
      </>
    )
  }

  const publicUrl = `${proto}://${rootHost}/${pathPrefix}/${handle}`
  // TFR-008/SDS TD-003 — query param มีผลแค่เปิด BuilderPreviewBridge (ฟัง postMessage) ไม่ใช่ประตู
  // bypass สิทธิ์ใด ๆ (การเห็นเนื้อหาจริงเมื่อ unpublished มาจาก canAccessShop โดยตรงอยู่แล้ว)
  const canvasSrc = `${publicUrl}?builderDraft=1`

  const avatarRaw = active.kind === 'PERSONAL' ? (owner?.avatar ?? null) : shop.logo
  const initialDraft: BuilderDraft = {
    tabOrder: orderedTabKeys,
    blocks: blocks.map(blockViewToDraftBlock),
  }
  const headerData: PreviewPanelHeaderData = {
    shopName: shop.shopName,
    username: handle,
    avatarUrl: toFileUrl(avatarRaw),
    isVerified: verifiedCount > 0,
    completedOrders: stats.completedOrders,
    completionRate: stats.completionRate,
    avgRating: stats.avgRating,
  }

  return (
    <BuilderClient
      publicUrl={publicUrl}
      handlePrefix={`${rootHost}/${pathPrefix}/`}
      handle={handle}
      canvasSrc={canvasSrc}
      initialDraft={initialDraft}
      initialIsPublished={layout.isPublished}
      visibleTabKeys={visibleTabKeys}
      initialLibrary={library}
      header={headerData}
    />
  )
}
