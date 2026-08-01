/**
 * คลังความรู้ของ ChatBot — /settings/chatbot/knowledge
 * feature 00023 · user สั่ง 2026-08-01 ("คลังความรู้ของ DeepBot ก็ต้องย้ายไป")
 *
 * คลังเดียวระดับร้าน ไม่ผูกกลุ่มคำ — ChatBot อ่านทั้งคลังเพื่อตอบทุกคำถาม
 * ส่วน Auto Reply ยังจับคู่ตรงตัวจากข้อที่ผูกกลุ่มคำได้เหมือนเดิม (ข้อเก่าไม่กระทบ)
 *
 * Base: settings/auto-reply/[id]/qna/page.tsx (โครง RSC + PageBreadcrumb + tabs)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listShopQna } from '@/services/auto-reply-qna.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import ChatbotTabs from '../ChatbotTabs'
import KnowledgeClient from './KnowledgeClient'

export const metadata: Metadata = { title: 'คลังความรู้' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function KnowledgePage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) return null

  const qna = await listShopQna(activeCtx.shopId)

  return (
    <>
      <PageBreadcrumb title="ChatBot" trail={[{ label: 'ผู้ช่วยอัตโนมัติ' }]} />
      <ChatbotTabs />
      <KnowledgeClient
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        initialItems={qna.items.map((q) => ({
          id: q.id,
          question: q.question,
          answer: q.answer,
          isActive: q.isActive,
          useCount: q.useCount,
        }))}
        initialStats={qna.stats}
      />
    </>
  )
}
