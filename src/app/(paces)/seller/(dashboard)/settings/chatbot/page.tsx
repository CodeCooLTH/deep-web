/**
 * ChatBot — /settings/chatbot (feature 00023 · phase `00023-ai-enhance`)
 *
 * user ตัดสิน 2026-08-01 ให้แยกจาก Auto Reply เป็นคนละเมนู:
 *   Auto Reply = ตอบเป๊ะตามเงื่อนไข ไม่มีค่าใช้จ่าย ไม่ตรงก็เงียบ
 *   ChatBot    = ส่วนเสริม AI ที่ครอบทุกข้อความ ตอบแทน/เสริมคนตามช่วงเวลา + มีค่าใช้จ่าย
 *                และเป็นที่อยู่ของ option "ขัดเกลาคำตอบของ Auto Reply"
 *
 * Base: settings/auto-reply/[id]/page.tsx (โครง RSC + PageBreadcrumb)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getChatbotConfig } from '@/services/ai-chatbot-config.service'
import { listShopGuardrails } from '@/services/auto-reply-guardrail.service'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import ChatbotTabs from './ChatbotTabs'
import ChatbotClient from './ChatbotClient'

export const metadata: Metadata = { title: 'ChatBot' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function ChatbotPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) return null

  const [config, guardrails, wallet, qnaCount, testThreads, recentChats] = await Promise.all([
    getChatbotConfig(activeCtx.shopId),
    listShopGuardrails(activeCtx.shopId),
    prisma.sellerWallet.findUnique({ where: { shopId: activeCtx.shopId }, select: { balance: true } }),
    prisma.autoReplyQna.count({ where: { shopId: activeCtx.shopId, isActive: true } }),
    prisma.aiChatbotTestThread.findMany({
      where: { shopId: activeCtx.shopId },
      select: {
        conversationId: true,
        conversation: { select: { alias: true, externalContact: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // แชทล่าสุดให้เลือก — โหลดฝั่ง server ไม่ต้องให้ client ยิง API เพิ่มตอนเปิดตัวเลือก
    prisma.conversation.findMany({
      where: { shopId: activeCtx.shopId },
      select: {
        id: true,
        alias: true,
        lastMessagePreview: true,
        externalContact: { select: { name: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 30,
    }),
  ])

  return (
    <>
      <PageBreadcrumb title="ChatBot" trail={[{ label: 'ผู้ช่วยอัตโนมัติ' }]} />
      <ChatbotTabs />
      <ChatbotClient
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        initialConfig={config}
        initialGuardrails={guardrails}
        walletBalance={wallet?.balance ?? 0}
        knowledgeCount={qnaCount}
        initialTestThreads={testThreads.map((t) => ({
          conversationId: t.conversationId,
          name: t.conversation.alias ?? t.conversation.externalContact?.name ?? 'ไม่ทราบชื่อ',
        }))}
        recentChats={recentChats.map((c) => ({
          id: c.id,
          name: c.alias ?? c.externalContact?.name ?? 'ไม่ทราบชื่อ',
          preview: c.lastMessagePreview,
        }))}
      />
    </>
  )
}
