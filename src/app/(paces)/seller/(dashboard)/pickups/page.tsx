/**
 * เรียกรถ (feature 00087) — รายการคำขอเรียกรถของร้าน (iShip + Flash) พร้อมสถานะ + ปุ่มเรียก/ยกเลิก
 *
 * Base: customers/page.tsx (gatePage + NoPermissionCard + การ์ด error "ลองใหม่")
 *       theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *
 * อ่านจาก ShipmentPickup อย่างเดียว ไม่ยิงขนส่งตอนเปิดหน้า (BRD BR-2) · สถานะอัปเดตจาก webhook เดิม
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { requireActiveShop } from '@/lib/shop-context'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import { courierLabel } from '@/lib/iship/courier'
import { parsePickupFilter } from '@/lib/shipping/pickup-list-view'
import { getConnection, getSettings } from '@/services/iship.service'
import { getFlashConnection, getFlashSettings } from '@/services/flash.service'
import { listShopPickups } from '@/services/pickup-list.service'
import PickupsClient from './PickupsClient'

export const metadata: Metadata = { title: 'เรียกรถ' }

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>
}

export default async function PickupsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const gate = await gatePage(session, 'S1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="เรียกรถ" />
        <NoPermissionCard capability="S1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  // ร้านที่ไม่ขายของออนไลน์ไม่มีพัสดุ = ไม่มีรถให้เรียก (เมนูซ่อนอยู่แล้ว ตรงนี้คือด่านจริง)
  if (!active || active.shop.vertical !== 'ONLINE_SALES') notFound()
  const shopId = active.shop.id
  const isOwner = active.role === 'OWNER'

  const filter = parsePickupFilter(sp.status)
  const page = Number(sp.page) || 1

  let list
  try {
    list = await listShopPickups(shopId, { filter, page })
  } catch (e) {
    console.error('[pickups/page] listShopPickups failed', e)
    return (
      <>
        <PageBreadcrumb title="เรียกรถ" />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="alert-triangle" className="text-warning mx-auto mb-4 size-16" />
          <h2 className="text-dark mb-2 text-xl font-bold">โหลดรายการเรียกรถไม่สำเร็จ</h2>
          <p className="text-default-600 mb-6">ข้อมูลคำขอของคุณยังอยู่ครบ ลองใหม่อีกครั้งได้เลย</p>
          <Link
            href="/pickups"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white">
            <Icon icon="refresh" />
            ลองใหม่
          </Link>
        </div>
      </>
    )
  }

  // ?page= เกินหน้าสุดท้าย → ไปหน้าสุดท้าย (ไม่งั้นจะขึ้น "ยังไม่เคยเรียกรถ" ทั้งที่มีคำขอ)
  if (list.rows.length === 0 && list.total > 0) {
    const last = Math.ceil(list.total / list.pageSize)
    redirect(`/pickups?${new URLSearchParams({ ...(filter !== 'all' ? { status: filter } : {}), page: String(last) })}`)
  }

  // ขนส่งที่เรียกรถได้ตอนนี้ — เชื่อมอยู่และ key ไม่ถูกปฏิเสธ (ส่งเฉพาะข้อมูลที่โมดัลต้องใช้ ไม่มี token)
  const ishipConn = await getConnection(shopId).catch(() => null)
  const ishipCourierCode =
    ishipConn?.connected && ishipConn.status !== 'TOKEN_INVALID'
      ? await getSettings(shopId).then((s) => s.defaultCourierCode).catch(() => null)
      : null
  const iship = ishipConn?.connected && ishipConn.status !== 'TOKEN_INVALID'
    ? { courierCode: ishipCourierCode, courierName: ishipCourierCode ? courierLabel(ishipCourierCode) : null }
    : null

  const flashConn = await getFlashConnection(shopId, { isOwner }).catch(() => null)
  const flashLive = !!flashConn?.available && flashConn.connected && flashConn.status !== 'TOKEN_INVALID'
  const flashSettings = flashLive
    ? await getFlashSettings(shopId, { isOwner }).then((r) => r.settings).catch(() => null)
    : null
  const flash = flashLive && flashSettings ? { sender: flashSettings, senderComplete: flashConn!.senderComplete } : null

  return (
    <>
      <PageBreadcrumb title="เรียกรถ" />
      <PickupsClient
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        filter={filter}
        iship={iship}
        flash={flash}
      />
    </>
  )
}
