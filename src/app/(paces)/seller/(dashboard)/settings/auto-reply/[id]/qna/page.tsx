/**
 * คลังคำถามของกลุ่ม — /settings/auto-reply/[id]/qna (feature 00023, phase `00023-qna` S-13)
 *
 * SSOT: docs/superpowers/specs/2026-07-31-00023-qna-ux-design-spec.md §หน้า A
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/page.tsx (โครง RSC +
 *   PageBreadcrumb + resolveActiveShopContext + โหลดผ่าน service ตรง)
 *   ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * โหลดผ่าน service ตรง ไม่ self-fetch API ตัวเอง — ownership scope อยู่ใน WHERE ของ service แล้ว
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getKeywordDetail } from '@/services/auto-reply-rule.service'
import { listQna } from '@/services/auto-reply-qna.service'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import KeywordTabs from '../KeywordTabs'
import QnaListingClient from './QnaListingClient'

export const metadata: Metadata = { title: 'คลังคำถาม' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function QnaLibraryPage({ params }: { params: Promise<{ id: string }> }) {
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

  // กลุ่มปลายทางของ "ย้ายไปกลุ่มอื่น" — ทุกกลุ่มของร้านยกเว้นกลุ่มปัจจุบัน
  // นับจำนวนข้อในคลังไปด้วยเพื่อให้ radio list บอก meta ได้ (Design Spec Modal 2)
  const [qna, otherKeywords] = await Promise.all([
    listQna(id, activeCtx.shopId),
    prisma.autoReplyKeyword.findMany({
      where: { shopId: activeCtx.shopId, id: { not: id } },
      select: { id: true, name: true, status: true, _count: { select: { qnas: true } } },
      orderBy: { priority: 'desc' },
    }),
  ])

  return (
    <>
      <PageBreadcrumb
        title="ผู้ช่วยอัตโนมัติ"
        trail={[{ label: 'กลุ่มคำทั้งหมด', href: '/settings/auto-reply' }]}
      />

      <KeywordTabs keywordId={id} />

      <QnaListingClient
        keywordId={id}
        keywordName={keyword.name}
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        initialItems={qna.items.map((q) => ({
          id: q.id,
          question: q.question,
          answer: q.answer,
          isActive: q.isActive,
          useCount: q.useCount,
        }))}
        initialStats={qna.stats}
        otherKeywords={otherKeywords.map((k) => ({
          id: k.id,
          name: k.name,
          status: k.status,
          qnaCount: k._count.qnas,
        }))}
      />
    </>
  )
}
