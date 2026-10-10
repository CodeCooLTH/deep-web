/**
 * Chat Logs — รายการที่ AI ตอบลูกค้าไปจริง (feature 00023)
 * user สั่ง 2026-08-01: "อยากให้ในเมนู chatbot มี tab Chat Logs ด้วย เอาไว้ดูว่า
 * chatmessage รายการไหนที่ AI ตอบลูกค้าไปบ้าง เช่น ลูกค้าสวัสดี > AI ตอบ"
 *
 * อ่านจาก AutoReplyLog ที่ `matchedVia = 'CHATBOT'` — คือแถวที่ ChatBot แต่งคำตอบจาก
 * คลังความรู้เอง ไม่ใช่คำตอบสำเร็จรูปของกลุ่มคำ (matchedVia = KEYWORD/QNA)
 *
 * Base: settings/chatbot/page.tsx (โครง RSC + PageBreadcrumb + ChatbotTabs)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import ChatbotTabs from '../ChatbotTabs'
import ChatLogsList, { type ChatLogRow } from './ChatLogsList'

export const metadata: Metadata = { title: 'ประวัติการตอบของบอท' }
export const dynamic = 'force-dynamic'

export default async function ChatbotLogsPage() {
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

  const rows = await prisma.autoReplyLog.findMany({
    where: {
      shopId: activeCtx.shopId,
      // ทั้งครั้งที่ตอบสำเร็จ (matchedVia) และครั้งที่ไม่ได้ตอบพร้อมเหตุผล (errorMessage)
      // — ครั้งที่ไม่ตอบคือสิ่งที่ร้านอยากรู้มากที่สุด ("ทำไมบอทเงียบ") การโชว์แต่ที่สำเร็จ
      // ทำให้หน้านี้ดูเหมือนทุกอย่างปกติทั้งที่มีคำถามหลุดไปเรื่อย ๆ
      OR: [{ matchedVia: 'CHATBOT' }, { errorMessage: { startsWith: 'CHATBOT:' } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      rawText: true,
      replyText: true,
      decision: true,
      isTest: true,
      durationMs: true,
      errorMessage: true,
      conversationId: true,
      conversation: {
        select: {
          alias: true,
          externalContact: { select: { name: true } },
          shopChannel: { select: { provider: true, name: true } },
        },
      },
    },
  })

  const items: ChatLogRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    customerText: r.rawText,
    replyText: r.replyText,
    decision: r.decision,
    // 'CHATBOT:GUARDRAILS_BLOCKED' -> 'GUARDRAILS_BLOCKED'
    skipReason: r.errorMessage?.startsWith('CHATBOT:') ? r.errorMessage.slice('CHATBOT:'.length) : null,
    isTest: r.isTest,
    durationMs: r.durationMs,
    conversationId: r.conversationId,
    // ชื่อคู่สนทนาเท่านั้น ไม่ดึงเบอร์/อีเมลมาแสดง — หน้านี้มีไว้ดูว่า "บอทตอบอะไร"
    name: r.conversation.alias ?? r.conversation.externalContact?.name ?? 'ไม่ทราบชื่อ',
    provider: r.conversation.shopChannel?.provider ?? null,
    channelName: r.conversation.shopChannel?.name ?? null,
  }))

  return (
    <>
      <PageBreadcrumb title="ChatBot" trail={[{ label: 'ผู้ช่วยอัตโนมัติ' }]} />
      <ChatbotTabs />
      <ChatLogsList items={items} />
    </>
  )
}
