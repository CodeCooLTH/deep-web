/**
 * คิวคำถามที่ DeepBot ตอบไม่ได้ — /settings/auto-reply/unanswered
 * feature 00023 · phase `00023-qna` · S-14
 *
 * SSOT: docs/superpowers/specs/2026-07-31-00023-qna-ux-design-spec.md §หน้า B
 *       + §Revision v2 ข้อ 1 (แท็บ "รอกรอก"/"ข้ามแล้ว" + ปุ่มย้อนกลับ)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/page.tsx
 *   (โครง RSC + PageBreadcrumb + resolveActiveShopContext + โหลดผ่าน service ตรง)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listUnanswered } from '@/services/auto-reply-unanswered.service'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import UnansweredQueueClient from './UnansweredQueueClient'

export const metadata: Metadata = { title: 'คำถามที่ตอบไม่ได้' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function UnansweredQueuePage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) return null

  // โหลดทั้งสองแท็บพร้อมกัน — สลับแท็บจึงไม่ต้องรอ network (คิวมีหลักสิบข้อ ไม่ใช่หลักพัน)
  const [pending, dismissed, keywords] = await Promise.all([
    listUnanswered(activeCtx.shopId, { status: 'PENDING' }),
    listUnanswered(activeCtx.shopId, { status: 'DISMISSED' }),
    prisma.autoReplyKeyword.findMany({
      where: { shopId: activeCtx.shopId },
      select: { id: true, name: true, status: true, _count: { select: { qnas: true } } },
      orderBy: { priority: 'desc' },
    }),
  ])

  return (
    <>
      <PageBreadcrumb
        title="คำถามที่ตอบไม่ได้"
        trail={[{ label: 'ผู้ช่วยอัตโนมัติ', href: '/settings/auto-reply' }]}
      />

      <UnansweredQueueClient
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        pendingCount={pending.pendingCount}
        initialPending={pending.items.map((q) => ({
          id: q.id,
          rawSample: q.rawSample,
          hitCount: q.hitCount,
          lastSeenAt: q.lastSeenAt.toISOString(),
        }))}
        initialDismissed={dismissed.items.map((q) => ({
          id: q.id,
          rawSample: q.rawSample,
          hitCount: q.hitCount,
          lastSeenAt: q.lastSeenAt.toISOString(),
        }))}
        keywords={keywords.map((k) => ({
          id: k.id,
          name: k.name,
          status: k.status,
          qnaCount: k._count.qnas,
        }))}
      />
    </>
  )
}
