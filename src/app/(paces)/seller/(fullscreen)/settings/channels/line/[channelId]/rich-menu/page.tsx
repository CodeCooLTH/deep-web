import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { resolveShopVertical } from '@/lib/lodging'
import { templatesFor, resolveTemplateButtons } from '@/lib/line/rich-menu-templates'
import type { RichMenuButton } from '@/lib/line/rich-menu'
import RichMenuEditor from './RichMenuEditor'

/**
 * หน้าจัดการเมนูลัดใน LINE (feature 00045 — ux Design Spec §B)
 *
 * 🛑 **ไม่ล็อก desktop-only** ต่างจากตัวจัดหน้าร้าน 00035 โดยตั้งใจ — เหตุผลที่ตัวนั้นล็อกคือ
 * drag-drop ซึ่งรอบนี้ไม่มีเลย (D-RM-2 เทมเพลตคงที่ แก้ได้แค่ข้อความ) และ BRD §6.5 สั่งตรง ๆ ว่า
 * ผู้ขายจำนวนมากทำงานบนมือถือ
 *
 * 🛑 ไม่เรียก LINE ใน RSC — สถานะจริงถูกดึงด้วย client-fetch หลัง mount (เส้นเดียวกับที่แถวใน
 * การ์ดช่องทางใช้) ไม่งั้นเปิดหน้านี้ทีต้องรอ LINE ทุกครั้งก่อนเห็นอะไรเลย
 */
export const dynamic = 'force-dynamic'

export default async function RichMenuPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) redirect('/auth/sign-in')

  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session?.user as { activeShopId?: string | null } | undefined)?.activeShopId) ?? null,
    },
  })
  if (!ctx) notFound()

  // 🛑 scope ด้วย shopId ใน WHERE — นอกขอบเขต = ไม่มีอยู่ (404) ไม่ใช่ 403 (SRS §7.14)
  const channel = await prisma.shopChannel.findFirst({
    where: { id: channelId, shopId: ctx.shopId, provider: 'LINE' },
    select: { id: true, name: true, status: true, richMenu: true },
  })
  if (!channel) notFound()

  const shop = await prisma.shop.findUnique({
    where: { id: ctx.shopId },
    select: { vertical: true, kind: true, slug: true, user: { select: { username: true } } },
  })

  const vertical = resolveShopVertical(shop?.vertical ?? null)
  const template = templatesFor(vertical)[0] ?? null
  if (!template) notFound() // ทุก vertical ต้องมีเทมเพลต — เทส [blocker] บังคับไว้แล้ว

  // ลิงก์หน้าร้านสาธารณะ — รูปแบบเดียวกับที่หน้าอื่นในระบบใช้ (BUSINESS+slug → /b/, ไม่งั้น /u/)
  const base = (process.env.NEXT_PUBLIC_BUYER_URL || 'https://deepthailand.app').replace(/\/+$/, '')
  const publicUrl =
    shop?.kind === 'BUSINESS' && shop.slug
      ? `${base}/b/${shop.slug}`
      : shop?.user?.username
        ? `${base}/u/${shop.user.username}`
        : null

  const saved = channel.richMenu
  // ปุ่มที่แสดง: ของที่ร้านเคยบันทึกไว้ ถ้ายังไม่เคยบันทึก = ค่าตั้งต้นของเทมเพลตที่ resolve แล้ว
  const buttons =
    (saved?.buttons as RichMenuButton[] | undefined)?.length
      ? (saved!.buttons as unknown as RichMenuButton[])
      : resolveTemplateButtons(template, { publicUrl })

  return (
    <RichMenuEditor
      channelId={channel.id}
      channelName={channel.name}
      tokenInvalid={channel.status === 'TOKEN_INVALID'}
      templateKey={saved?.templateKey ?? template.key}
      templateTitle={template.title}
      initialChatBarText={saved?.chatBarText ?? template.chatBarText}
      initialButtons={buttons}
    />
  )
}
