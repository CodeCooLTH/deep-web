/**
 * โต๊ะแชท (00077 Chat Desk) — ภาพรวมการตอบแชทของร้านแบบฉาก 3D / รายการ 2D · เจ้าของร้านเท่านั้น (X7)
 *
 * Base (โครงหน้า: breadcrumb → เนื้อหา):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 * Base (การ์ด/เวที/ตัวกรอง/แถบเครื่องมือ): ดูหัวไฟล์ใน ./components/*
 *
 * ── สิ่งที่หน้านี้รับผิดชอบ ──────────────────────────────────────────────
 * ด่านสิทธิ์ (listAccessibleShopIds 'X7' ในหน้าเอง ไม่พึ่ง layout) · แปลง searchParams · ส่ง prop ที่ serialize ได้ลง client
 * ตัวเลข/ห้องมาจาก GET /api/chat-desk/snapshot ที่ client ดึงเอง — ไม่มีข้อมูลร้านใน HTML ถ้าไม่ผ่านด่าน
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { parseDeskFilters } from '@/lib/chat-desk/filters'
import { pickDeskShop } from '@/lib/chat-desk/owner-scope'
import { sessionUserId } from '@/lib/session-user'
import { listAccessibleShopIds } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { listDeskShopOptions } from '@/services/chat-desk.service'
import NoPermissionCard from '../_shared/NoPermissionCard'
import SellerErrorState from '../_shared/SellerErrorState'
import DeskPageClient from './components/DeskPageClient'

export const metadata: Metadata = { title: 'โต๊ะแชท' }

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function ChatDeskPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) return null

  // literal 'X7' ต้องอยู่ที่นี่ — ทะเบียน route-capabilities + ตัวสแกนบังคับ (SDS TD-02) · ว่าง = ไม่ใช่เจ้าของร้านไหนเลย
  const owned = await listAccessibleShopIds(userId, 'X7')
  if (owned.length === 0) {
    return (
      <>
        <PageBreadcrumb title="โต๊ะแชท" subtitle="แชท" />
        <NoPermissionCard capability="X7" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }

  let shops
  try {
    shops = await listDeskShopOptions(owned)
  } catch (e) {
    console.error('[chat-desk] listDeskShopOptions failed', e)
    return (
      <>
        <PageBreadcrumb title="โต๊ะแชท" subtitle="แชท" />
        <SellerErrorState title="โหลดโต๊ะแชทไม่สำเร็จ" message="ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว แชทของคุณยังอยู่ครบ ลองใหม่ได้เลย" retryHref="/chat-desk" />
      </>
    )
  }

  const ids = shops.map((s) => s.id)
  const active = (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null
  // ขอร้านที่ไม่ใช่ของตน = ตกไปร้านตั้งต้น (หน้านี้ไม่ใช่ API — ไม่มีอะไรรั่วเพราะ prop มีเฉพาะร้านของเจ้าของ)
  const shopId = pickDeskShop(ids, first(sp.shop), active) ?? pickDeskShop(ids, null, active) ?? ids[0]
  const v = first(sp.view)

  return (
    <DeskPageClient
      ownerShops={shops}
      initialShopId={shopId}
      initialFilters={parseDeskFilters(sp)}
      initialView={v === '2d' || v === '3d' ? v : null}
    />
  )
}
