/**
 * หน้ารวมติดตามลูกค้า `/follow-ups` — กระดาน 5 คอลัมน์ + ปฏิทิน (feature 00066 พื้นผิว c, FR-ACT-08)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/projects/kanban/page.tsx (โครงหน้า: breadcrumb → เนื้อหา)
 *   แนวทางหน้าพี่น้องเดียวกัน: src/app/(paces)/seller/(dashboard)/queues/page.tsx (breadcrumb เฉพาะเดสก์ท็อป)
 *
 * หน้านี้เป็น server component ทำแค่: ตัดสินตัวตน/ขอบเขตร้าน · หาตัวเลือกตัวกรอง (คนในทีม + แท็ก) ·
 * รับเคส push ของร้านอื่น (E7) — ข้อมูลรายการโหลดฝั่ง client ผ่าน GET /api/follow-ups/board
 * เพื่อให้เปลี่ยนตัวกรอง/เดือนได้โดยไม่ต้อง refetch RSC ทั้งหน้า
 *
 * 🛑 "มี session" ≠ "รู้ว่าเป็นใคร" — sessionUserId() เท่านั้น (session-exists-is-not-identity.md)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { resolveChatScope } from '@/lib/chat-scope'
import { todayThaiIsoDate } from '@/lib/date-range'
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'
import { listAccessibleShopIds } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { getT } from '@/i18n/server'
import { getShopTags } from '@/services/chat-crm.service'
import { listAssignees } from '@/services/customer-follow-up.service'
import SellerErrorState from '../_shared/SellerErrorState'
import NoPermissionCard from '../_shared/NoPermissionCard'
import FollowUpShopAutoSwitch from './components/FollowUpShopAutoSwitch'
import FollowUpsClient from './components/FollowUpsClient'

// ชื่อแท็บผันตามภาษาที่เลือก จึงเป็น generateMetadata ไม่ใช่ค่าคงที่
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).followUps.title }
}

type SearchParams = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null)

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (userId === null) return null // layout redirect guard จัดการคนที่ไม่ได้ล็อกอิน

  const scope = await resolveChatScope({
    user: { id: userId, activeShopId: (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null },
  }, 'X2')
  // resolve ร้านไม่ได้ = ไม่ใช่สมาชิก/ร้านหาย → notFound (ไม่บอกว่ามีอยู่) ห้าม fallback ไป PERSONAL เงียบ ๆ
  if (!scope) notFound()

  // 00071 S-13 — ร้าน active ไม่ถือ X2 (ผู้ดูแลบิล/ฝ่ายช่าง) → การ์ดไม่มีสิทธิ์ ไม่ใช่ 404 เงียบ (BRD FR-RP-02)
  if (!scope.activeHasCap) {
    const t = await getT()
    return (
      <>
        <div className="hidden lg:block">
          <PageBreadcrumb title={t.followUps.title} />
        </div>
        <NoPermissionCard capability="X2" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }

  // E7 — push ของอีกร้าน: ?shopId=X ที่ผู้ใช้เข้าถึงได้แต่ไม่อยู่ในขอบเขตตอนนี้ → สลับร้านให้
  // ไม่ใช่ notFound ทั้งที่มีสิทธิ์เต็ม (payload push เป็นของแอป แก้ที่เว็บได้ทันที)
  const shopParam = one(sp.shopId)
  if (shopParam && !scope.shopIds.includes(shopParam)) {
    const allowed = new Set(await listAccessibleShopIds(userId, 'X2'))
    // ไม่มีสิทธิ์ = notFound เหมือน "ไม่มีร้านนี้" (ไม่รั่วว่ามีอยู่)
    if (!allowed.has(shopParam)) notFound()
    // 🛑 กันวน: สลับได้รอบเดียว — ?switched=1 แล้วยังไม่เข้าขอบเขต = สลับไม่สำเร็จจริง ตกหน้า error
    if (one(sp.switched) === '1') {
      const t = await getT()
      return <SellerErrorState title={t.followUps.switchFailed} retryHref="/follow-ups" />
    }
    const shop = await prisma.shop.findUnique({
      where: { id: shopParam },
      select: { shopName: true, logo: true, kind: true },
    })
    if (!shop) notFound()
    // ปลายทางหลังสลับ = หน้านี้เดิม (คง filter เดิม ไม่คง switched ของรอบก่อน)
    const rest = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'switched') rest.set(k, v)
    rest.set('switched', '1')
    return (
      <FollowUpShopAutoSwitch
        landingPath={`/follow-ups?${rest.toString()}`}
        shopId={shopParam}
        shopName={shop.shopName}
        logo={shop.logo}
        kind={shop.kind}
      />
    )
  }

  const t = await getT()
  const [assignees, allTags] = await Promise.all([listAssignees(scope.shopIds), getShopTags(scope.shopIds)])

  return (
    <>
      {/* breadcrumb เดสก์ท็อปเท่านั้น — มือถือมีชื่อหน้าใน SellerMobileHeader แล้ว (ท่าเดียวกับ /queues) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title={t.followUps.title} />
      </div>
      <FollowUpsClient
        userId={userId}
        todayKey={todayThaiIsoDate()}
        // null = ไม่มีร้าน BUSINESS ในขอบเขต → ไม่มีตัวเลือกคน (PERSONAL คนเดียว — AC-ACT-07)
        assignees={assignees}
        allTags={allTags}
        shopId={shopParam}
      />
    </>
  )
}
