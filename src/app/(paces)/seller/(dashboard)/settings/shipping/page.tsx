/**
 * ตั้งค่าการจัดส่ง — /settings/shipping (feature 00022)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx
 *   — card + card-header border-dashed section header pattern
 *   (Base เดิม theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx)
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 * ดึงข้อมูลผ่าน service ตรง ไม่ self-fetch API ของตัวเอง (pattern เดียวกับ channels/page.tsx)
 *
 * ข้อควรระวัง: ร้านประเภทบ้านพัก (vertical = LODGING) ต้องไม่เห็นหน้านี้เลย
 * ใช้ notFound() ไม่ใช่ข้อความ "ไม่มีสิทธิ์" — การบอกว่า "มีหน้านี้อยู่แต่คุณเข้าไม่ได้"
 * คือการยืนยันการมีอยู่ของฟีเจอร์ที่ไม่เกี่ยวกับธุรกิจเขาเลย (BR-ISHIP-01)
 * ส่วนการบังคับสิทธิ์จริงอยู่ที่ API ทุกเส้นทาง (requireGeneralShop) — หน้าจอแค่ไม่แสดง
 */
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getConnection } from '@/services/iship.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { ShippingClient } from './ShippingClient'

export const metadata: Metadata = { title: 'การจัดส่ง' }

export default async function ShippingSettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) return null

  const shop = await prisma.shop.findUnique({
    where: { id: activeCtx.shopId },
    select: { vertical: true },
  })
  if (shop?.vertical !== 'GENERAL') notFound()

  const connection = await getConnection(activeCtx.shopId)

  // ค่าตั้งต้นดึงเฉพาะเมื่อเชื่อมต่อแล้ว — ยังไม่เชื่อมก็ยังไม่มีอะไรให้ตั้ง
  let settings = null
  if (connection.connected) {
    const { getSettings } = await import('@/services/iship.service')
    settings = await getSettings(activeCtx.shopId)
  }

  return (
    <>
      <PageBreadcrumb
        title="การจัดส่ง"
        trail={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'การจัดส่ง' }]}
      />

      {/*
        ส่งเฉพาะข้อมูลที่ต้องใช้แสดงผล — ไม่มี token ในนี้ทุกกรณี
        (view type ของ service ไม่มี field token ตั้งแต่ระดับ type แล้ว)
        หน้า seller อยู่ใต้ client layout → ทุกอย่างที่ส่งมาถูก serialize เข้า flight payload
      */}
      <ShippingClient
        isOwner={activeCtx.role === 'OWNER'}
        initialConnection={{
          connected: connection.connected,
          status: connection.status,
          tokenLast4: connection.tokenLast4,
          lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
          senderComplete: connection.senderComplete,
          settingsComplete: connection.settingsComplete,
          createMode: connection.createMode,
        }}
        initialSettings={settings}
      />
    </>
  )
}
