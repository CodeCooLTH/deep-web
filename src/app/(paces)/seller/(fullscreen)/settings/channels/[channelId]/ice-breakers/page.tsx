import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listIceBreakers } from '@/services/channel-chat.service'
import IceBreakerEditor from './IceBreakerEditor'

/**
 * หน้าแก้ไข "คำถามแนะนำก่อนเริ่มแชท" (Ice Breakers ของ Messenger/Instagram) — 2026-08-27
 *
 * Base: src/app/(paces)/seller/(fullscreen)/settings/channels/line/[channelId]/rich-menu/page.tsx
 *   (feature 00045) — โครง server component ทั้งหมด: session guard → resolveActiveShopContext →
 *   scope ด้วย shopId ใน WHERE ตรง (404 ไม่ใช่ 403 — SRS §7.14) → เรียก service ตรง ไม่ self-fetch
 *   API ของตัวเอง (page.tsx เดิมของ /settings/channels ก็ทำแบบนี้: เรียก listChannels() ตรง)
 *
 * 🛑 เช็ค provider ที่นี่ (server) ด้วย — ห้ามพึ่งการซ่อนลิงก์ใน IceBreakerStatusRow อย่างเดียว
 * (task instruction ข้อบังคับ) — channel ที่เป็น LINE/DEEP หรือไม่ใช่ของร้าน active ต้องได้ 404
 */
export const dynamic = 'force-dynamic'

export default async function IceBreakerPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) redirect('/auth/sign-in')

  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session?.user as { activeShopId?: string | null } | undefined)?.activeShopId) ?? null,
    },
  })
  if (!ctx) notFound()

  // scope ด้วย shopId + provider ใน WHERE — นอกขอบเขต/ไม่ใช่ช่องทาง Meta = ไม่มีอยู่ (404)
  const channel = await prisma.shopChannel.findFirst({
    where: { id: channelId, shopId: ctx.shopId, provider: { in: ['MESSENGER', 'INSTAGRAM'] } },
    select: { id: true, name: true, status: true },
  })
  if (!channel) notFound()

  const items = await listIceBreakers(channel.id)

  return (
    <IceBreakerEditor
      channelId={channel.id}
      channelName={channel.name}
      tokenInvalid={channel.status === 'TOKEN_INVALID'}
      initialItems={items.map((it) => ({ question: it.question, answer: it.answer }))}
    />
  )
}
