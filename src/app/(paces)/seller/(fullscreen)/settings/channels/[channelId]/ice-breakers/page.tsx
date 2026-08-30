import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sessionUserId } from '@/lib/session-user'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listIceBreakers } from '@/services/channel-chat.service'
import { getIceBreakers } from '@/lib/facebook/graph'
import { decryptToken } from '@/lib/token-crypto'
import { classifyExternalIceBreakers } from '@/lib/ice-breaker'
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
    select: { id: true, name: true, status: true, provider: true, accessTokenEnc: true },
  })
  if (!channel) notFound()

  const tokenInvalid = channel.status === 'TOKEN_INVALID'
  const items = await listIceBreakers(channel.id)

  /**
   * 🛑 อ่านค่าที่ **Meta ถืออยู่จริง** มาเทียบ — ฐานเราตอบแทนไม่ได้
   * ร้านตั้ง "คำถามที่พบบ่อย" เองใน Business Suite / แอป IG ได้ตลอดโดยที่เราไม่รู้ และ Meta
   * ประกาศเองว่าของที่ตั้งผ่าน API **ทับ** ของนั้น **และปิดไม่ให้ร้านแก้จากฝั่งนั้นอีก**
   * ⇒ ปล่อยให้กดบันทึกโดยไม่เห็นของเดิม = ร้านเสียคำถามที่ลูกค้าเห็นอยู่จริงแบบกู้เองไม่ได้
   *
   * 🛑 อ่านที่นี่ที่เดียว **ห้ามไปอ่านในหน้ารายการช่องทาง** — Messenger Profile API จำกัด
   * 10 ครั้ง/10 นาที ต่อเพจ ร้าน 3 เพจเปิดหน้ารายการซ้ำ 4 รอบก็ทะลุแล้ว หน้านี้ผู้ขาย
   * ตั้งใจกดเข้ามา จึงคุ้มค่าเรียก
   *
   * token เสีย = ข้ามการยิงไปเลย (ยังไงก็ล้ม) แล้วตกเป็น UNKNOWN ซึ่งเตือนอยู่แล้ว
   */
  const external = tokenInvalid
    ? null
    : await getIceBreakers(decryptToken(channel.accessTokenEnc), channel.provider)
  const externalState = classifyExternalIceBreakers(external, channel.id)

  return (
    <IceBreakerEditor
      channelId={channel.id}
      channelName={channel.name}
      provider={channel.provider}
      tokenInvalid={tokenInvalid}
      initialItems={items.map((it) => ({ question: it.question, answer: it.answer }))}
      externalState={externalState}
      // ส่งเฉพาะ "คำถาม" ไม่ส่ง payload — client ไม่มีอะไรต้องทำกับ payload และมันคือคีย์ภายใน
      externalQuestions={externalState === 'FOREIGN' ? (external ?? []).map((it) => it.question) : []}
    />
  )
}
