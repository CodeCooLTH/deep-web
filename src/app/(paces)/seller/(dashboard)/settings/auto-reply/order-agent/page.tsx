/**
 * ตั้งค่าสร้างออเดอร์อัตโนมัติจากคำสั่งในแชท — feature 00061 หน้า A
 *
 * SSOT: docs/20 - Features/00061 - Auto Create Order from Chat Keyword/UX-Design-Spec.md §หน้า A
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/page.tsx (โครง RSC +
 *   PageBreadcrumb + resolveActiveShopContext) ซึ่ง Base เดิม =
 *   theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * โหลดข้อมูลผ่าน service ตรง ไม่ self-fetch API ของตัวเอง — ownership scope อยู่ใน WHERE
 * ของทุกคิวรีตั้งแต่ต้น (resolveActiveShopContext เป็นตัวให้ shopId ที่เชื่อได้ตัวเดียว)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { resolveShopVertical } from '@/lib/lodging'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { getOrCreateAutoOrderConfig } from '@/services/auto-order-config.service'
import { countDraftedOrders } from '@/services/auto-order-detect.service'

import OrderAgentClient from './OrderAgentClient'
import NotSupportedNotice from './NotSupportedNotice'

export const metadata: Metadata = { title: 'สร้างออเดอร์อัตโนมัติ' }

/** แก้ได้เฉพาะเจ้าของร้าน/แอดมิน — STAFF ดูได้อย่างเดียว (BR-ACO-05) */
const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function OrderAgentSettingsPage() {
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

  /**
   * 🛑 ด่าน vertical ที่ระดับหน้าด้วย ไม่ใช่แค่ที่ API — ร้านคิวงาน/บ้านพักที่เดินมาถึง URL นี้
   * (จากลิงก์เก่า/บุ๊กมาร์ก) ต้องเห็นคำอธิบาย ไม่ใช่ฟอร์มที่กดแล้วเจอ 403 ทุกปุ่ม
   */
  if (resolveShopVertical(shop?.vertical) !== 'ONLINE_SALES') {
    return (
      <>
        <PageBreadcrumb
          title="สร้างออเดอร์อัตโนมัติ"
          trail={[{ label: 'ผู้ช่วยอัตโนมัติ', href: '/settings/auto-reply' }]}
        />
        <NotSupportedNotice />
      </>
    )
  }

  const [config, channels, draftCount] = await Promise.all([
    getOrCreateAutoOrderConfig(activeCtx.shopId),
    prisma.shopChannel.findMany({
      where: { shopId: activeCtx.shopId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        provider: true,
        avatarUrl: true,
        messageEchoesStatus: true,
        messageEchoesCheckedAt: true,
      },
      orderBy: { name: 'asc' },
    }),
    countDraftedOrders(activeCtx.shopId),
  ])

  return (
    <>
      <PageBreadcrumb
        title="สร้างออเดอร์อัตโนมัติ"
        trail={[{ label: 'ผู้ช่วยอัตโนมัติ', href: '/settings/auto-reply' }]}
      />
      <OrderAgentClient
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        draftCount={draftCount}
        initial={{
          status: config.status,
          phrases: config.phrases.map((p) => p.phrase),
          selectedChannelIds: config.channels.map((c) => c.shopChannelId),
        }}
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          provider: c.provider,
          avatarUrl: c.avatarUrl,
          messageEchoesStatus: c.messageEchoesStatus,
          messageEchoesCheckedAt: c.messageEchoesCheckedAt?.toISOString() ?? null,
        }))}
      />
    </>
  )
}
