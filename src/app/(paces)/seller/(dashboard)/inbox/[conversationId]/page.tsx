/**
 * Seller Thread — /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx:33-110
 * (header + scroll body + composer) — ตัด sidebar offcanvas/ChatToolbar/online-status
 * (UX-Design-Spec.md §S-12; seller thread เป็นหน้าเดี่ยว แยกจาก /inbox ไม่ split-view)
 *
 * Ownership guard: WHERE compound {id, shopId} (scope ใน query — feedback_rsc_dal_authz,
 * ไม่ post-check) คืน null ทั้งกรณี "ไม่พบ" และ "ไม่ใช่เจ้าของ" → SellerErrorState เดียวกันทั้งคู่
 * (กัน enumeration) — ไม่ notFound() เพราะ spec ระบุ "403/404→SellerErrorState 'ไม่พบบทสนทนานี้'"
 * ตรง ๆ ไม่ใช่ Next notFound page
 *
 * header identity (avatar+ชื่อ buyer) fetch ตรงที่นี่ (query เดียวกับ ownership guard) — ไม่มี
 * endpoint ใหม่ (API.md เป็น frozen 5 endpoint), ตัวข้อความจริงให้ ChatThread (client) fetch ผ่าน
 * GET .../messages เอง (SDS §3.3)
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShopByUserId } from '@/services/shop.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import SellerErrorState from '../../_shared/SellerErrorState'
import ChatThread from './components/ChatThread'

export const metadata: Metadata = { title: 'ข้อความ' }

type PageProps = {
  params: Promise<{ conversationId: string }>
}

export default async function SellerInboxThreadPage({ params }: PageProps) {
  const { conversationId } = await params

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  let shop: { id: string } | null = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }
  if (!shop) redirect('/inbox')

  // ownership scope อยู่ใน WHERE (compound id+shopId) — ไม่ใช่ post-check
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId: shop.id },
    select: {
      id: true,
      buyer: { select: { id: true, displayName: true, avatar: true } },
    },
  })

  if (!conversation) {
    return (
      <>
        <div className="hidden lg:block">
          <PageBreadcrumb title="ข้อความ" trail={[{ label: 'ข้อความ', href: '/inbox' }]} />
        </div>
        <SellerErrorState title="ไม่พบบทสนทนานี้" message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง" retryHref="/inbox" />
      </>
    )
  }

  return (
    <>
      <div className="hidden lg:block">
        <PageBreadcrumb
          title={conversation.buyer.displayName}
          trail={[{ label: 'ข้อความ', href: '/inbox' }]}
        />
      </div>
      <ChatThread
        conversationId={conversation.id}
        buyerName={conversation.buyer.displayName}
        buyerAvatar={conversation.buyer.avatar}
      />
    </>
  )
}
