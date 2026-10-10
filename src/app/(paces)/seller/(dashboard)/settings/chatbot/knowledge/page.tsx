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
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
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

  // 00071 S-13 — ด่านสิทธิ์หน้าตั้งค่า (H3): ไม่มีร้าน = ตกเงียบเหมือนเดิม · บทบาทไม่ถึง = การ์ดไม่มีสิทธิ์ (ไม่ใช่หน้าว่าง/404)
  const gate = await gatePage(session, 'H3')
  if (!gate.ok) {
    if (gate.reason === 'NO_SHOP') return null
    return (
      <>
        <div className="hidden lg:block">
          <PageBreadcrumb title="ChatBot" />
        </div>
        <NoPermissionCard capability="H3" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  const activeCtx = { shopId: gate.active.shop.id, role: gate.active.role, roles: gate.active.roles, vertical: gate.active.shop.vertical }

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
