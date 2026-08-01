/**
 * AI Enhance ของกลุ่มคำ — /settings/auto-reply/[id]/ai
 * feature 00023 · phase `00023-ai-enhance` · A-11 (บางส่วน)
 *
 * SSOT: docs/scope/2026-08-01-00023-ai-enhance-scope-baseline.md
 *       + PRD.md §3.9 (BR-AR-31..36)
 *
 * Base: settings/auto-reply/[id]/qna/page.tsx (โครง RSC + PageBreadcrumb + KeywordTabs)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getKeywordDetail } from '@/services/auto-reply-rule.service'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import KeywordTabs from '../KeywordTabs'
import AiEnhanceClient from './AiEnhanceClient'

export const metadata: Metadata = { title: 'AI Enhance' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function AiEnhancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) return null

  const keyword = await getKeywordDetail(id, activeCtx.shopId)
  if (!keyword) notFound()

  // อ่านสวิตช์ตรงจากตาราง — `getKeywordDetail` ไม่ได้ select field นี้ (ของ phase ก่อนหน้า)
  // และไม่แก้ select กลางเพราะหน้ารายการไม่ต้องใช้ ดึงเพิ่มเฉพาะหน้านี้ถูกกว่า
  const flags = await prisma.autoReplyKeyword.findFirst({
    where: { id, shopId: activeCtx.shopId },
    select: { aiEnhanceEnabled: true },
  })

  return (
    <>
      <PageBreadcrumb
        title="ผู้ช่วยอัตโนมัติ"
        trail={[{ label: 'กลุ่มคำทั้งหมด', href: '/settings/auto-reply' }]}
      />

      <KeywordTabs keywordId={id} />

      <AiEnhanceClient
        keywordId={id}
        keywordName={keyword.name}
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        initialEnabled={flags?.aiEnhanceEnabled ?? false}
      />
    </>
  )
}
