/**
 * ตั้งค่าตอบกลับคอมเมนต์ — /settings/comment-reply (feature 00038, Task 10)
 *
 * SSOT: docs/20 - Features/00038 - Comment Auto-Reply/{UX-Design-Spec.md §หน้า 1, API.md §4.1-4.3}
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/page.tsx (โครง RSC +
 *   PageBreadcrumb + resolveActiveShopContext + defensive fallback) ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว; อ่านผ่าน prisma ตรง
 * ไม่ self-fetch API ของตัวเอง (pattern เดียวกับ settings/auto-reply/page.tsx,
 * settings/channels/page.tsx)
 *
 * 🛑 หน้านี้อยู่ใต้ client layout ของ Paces → prop ทุกตัวถูก serialize เข้า flight payload —
 * select เฉพาะ field ที่หน้าจอใช้จริง ห้ามส่ง accessTokenEnc หรือ object ShopChannel ทั้งก้อน
 * (feedback_rsc_pii_neutralize_at_source) — mirror allow-list เดียวกับที่
 * src/app/api/shops/comment-reply/config/route.ts ประกาศไว้แล้ว (คอลัมน์กลุ่ม comment-reply
 * อยู่แถวเดียวกับ accessTokenEnc ใน ShopChannel)
 *
 * ประวัติหน้าแรกโหลดพร้อมหน้า ไม่มี spinner (Operate mode — UX-Design-Spec §1.5) — ดึงตรงผ่าน
 * prisma มิเรอร์ query เดียวกับ src/app/api/shops/comment-reply/logs/route.ts (ไม่ import ตรง
 * เพราะไฟล์นั้นเป็น route handler ไม่ใช่ service function — เปลี่ยนหน้า/ตัวกรอง/จำนวนต่อหน้า
 * ฝั่ง client ยิง endpoint นั้นต่อสำหรับหน้าถัดไป)
 *
 * ฉบับแก้ครั้งที่ 2 (2026-08-09): ประวัติเปลี่ยนจากปุ่ม "โหลดเพิ่ม" (accumulate) เป็น
 * `DataTable`+`TablePagination` (manual pagination) ตาม UX-Design-Spec §"ฉบับแก้ครั้งที่ 2" —
 * ต้องมี `total` ตั้งแต่ SSR (count() คู่กับ findMany แทนการดึงเกิน 1 แถวแบบเดิม)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import CommentReplyClient, { type CommentReplyChannel, type CommentReplyLogRow } from './CommentReplyClient'
// 🛑 คำอธิบายเหตุผลทั้งสองชุดอยู่ที่ lib ที่เดียว — เดิมตาราง skipReason ถูกก็อปไว้ในไฟล์นี้
// พร้อมคอมเมนต์ว่า "แก้ที่หนึ่งต้องแก้อีกไฟล์ด้วย" ซึ่งกันอะไรไม่ได้เลย (หน้าแรกมาจากไฟล์นี้
// หน้าถัดไปมาจาก logs/route.ts — ผู้ใช้เลื่อนหน้าเดียวก็เห็นคำคนละชุดได้โดยไม่มีอะไรฟ้อง)
import { describeCommentReplyFailure, describeSkipReason } from '@/lib/comment-reply-reason'
import { listCommentRules } from '@/services/comment-reply-rule.service'
import CommentRulesCard from './CommentRulesCard'

export const metadata: Metadata = { title: 'ตอบกลับคอมเมนต์' }

/** ต้องตรงกับ DEFAULT_PAGE_SIZE ใน CommentReplyClient.tsx (ตัวเลือกจำนวนต่อหน้าเริ่มต้นของตาราง) */
const LOGS_PAGE_SIZE = 10


const BREADCRUMB_TRAIL = [{ label: 'ตั้งค่า', href: '/settings' }, { label: 'ตอบกลับคอมเมนต์' }]

export default async function CommentReplySettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  // defensive fallback เท่านั้น (ร้านถูกลบ/หลุดสิทธิ์กลางอากาศ) — auth guard เต็มอยู่ที่ layout
  if (!activeCtx) return null

  // เพจ MESSENGER (การ์ดตั้งค่า) + INSTAGRAM (การ์ด static "เร็ว ๆ นี้") ในคำสั่งเดียว —
  // allow-list select ตรงกับ config/route.ts เป๊ะ (ห้ามคืนทั้งแถว — accessTokenEnc อยู่แถวเดียวกัน)
  const channelRows = await prisma.shopChannel.findMany({
    where: { shopId: activeCtx.shopId, provider: { in: ['MESSENGER', 'INSTAGRAM'] }, status: { not: 'DISCONNECTED' } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      provider: true,
      name: true,
      avatarUrl: true,
      status: true,
      commentPublicReplyEnabled: true,
      commentPublicReplyText: true,
      commentPublicReplyFileId: true,
      commentPrivateReplyEnabled: true,
      commentPrivateReplyText: true,
    },
  })

  const messengerChannels: CommentReplyChannel[] = channelRows
    .filter((c) => c.provider === 'MESSENGER')
    .map((c) => ({
      shopChannelId: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl,
      status: c.status,
      commentPublicReplyEnabled: c.commentPublicReplyEnabled,
      commentPublicReplyText: c.commentPublicReplyText,
      commentPublicReplyFileId: c.commentPublicReplyFileId,
      commentPrivateReplyEnabled: c.commentPrivateReplyEnabled,
      commentPrivateReplyText: c.commentPrivateReplyText,
    }))

  const instagramRow = channelRows.find((c) => c.provider === 'INSTAGRAM')
  const instagramChannel = instagramRow ? { name: instagramRow.name, avatarUrl: instagramRow.avatarUrl } : null

  // ยังไม่เชื่อมเพจ Facebook เลย → ทั้งหน้าเป็น empty state เต็มจอ (UX-Design-Spec §1.5)
  if (messengerChannels.length === 0) {
    return (
      <>
        <PageBreadcrumb title="ตอบกลับคอมเมนต์" trail={BREADCRUMB_TRAIL} />
        <SellerEmptyState
          icon="brand-facebook"
          title="ยังไม่ได้เชื่อมเพจ Facebook"
          description="เชื่อมเพจก่อนถึงจะตั้งค่าการตอบกลับคอมเมนต์ได้"
          action={{ label: 'เชื่อมเพจ Facebook', href: '/settings/channels' }}
        />
      </>
    )
  }

  // ประวัติหน้าแรก — total มาจาก count() คู่กัน (ฉบับแก้ครั้งที่ 2: TablePagination ต้องรู้จำนวนรวม
  // ไม่ใช่แค่ "มีต่อไหม" แบบเดิม) มิเรอร์ where เดียวกับ logs/route.ts
  const logsWhere = { channel: { shopId: activeCtx.shopId } }
  const [logRows, logsTotal] = await Promise.all([
    prisma.commentReplyLog.findMany({
      where: logsWhere,
      orderBy: { createdAt: 'desc' },
      take: LOGS_PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        trigger: true,
        publicReplyStatus: true,
        privateReplyStatus: true,
        skipReason: true,
        // ต้อง select มาด้วย ไม่งั้น describeCommentReplyFailure ได้ undefined ทุกแถวเงียบ ๆ
        errorMessage: true, // legacy — แถวเก่าที่ backfill ไม่ถึง (private สำเร็จแล้วโดนล้างไป)
    publicErrorMessage: true,
    privateErrorMessage: true,
        conversationId: true,
        comment: { select: { fromName: true } },
        post: { select: { message: true } },
      },
    }),
    prisma.commentReplyLog.count({ where: logsWhere }),
  ])

  // กฎตามคีย์เวิร์ด (ส่วนขยาย E2) — อ่านผ่าน service ตัวเดียวกับที่ API ใช้ เพื่อให้ **ลำดับที่
  // หน้าจอแสดง = ลำดับที่ระบบใช้เลือกจริง** ถ้าหน้านี้ query เองแล้วเรียงคนละแบบ ร้านจะตั้งกฎแล้ว
  // งงว่าทำไมอีกข้อชนะ โดยไม่มีอะไรอธิบายได้
  const rules = await listCommentRules(activeCtx.shopId)
  const initialLogs: CommentReplyLogRow[] = logRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    commenterName: r.comment?.fromName ?? null,
    postMessage: r.post?.message ?? null,
    trigger: r.trigger,
    publicReplyStatus: r.publicReplyStatus,
    privateReplyStatus: r.privateReplyStatus,
    skipReasonText: describeSkipReason(r.skipReason),
    // user 2026-08-09: ป้าย "ไม่สำเร็จ" ต้องบอกได้ว่าเพราะอะไร ไม่ใช่ทางตัน
    publicFailReasonText: describeCommentReplyFailure(r.publicErrorMessage),
    privateFailReasonText: describeCommentReplyFailure(r.privateErrorMessage ?? r.errorMessage),
    conversationId: r.conversationId,
  }))

  return (
    <>
      <PageBreadcrumb title="ตอบกลับคอมเมนต์" trail={BREADCRUMB_TRAIL} />
      <CommentReplyClient
        channels={messengerChannels}
        instagramChannel={instagramChannel}
        initialLogs={{ logs: initialLogs, total: logsTotal }}
        rulesCard={
          <CommentRulesCard
            initialRules={rules}
            channels={messengerChannels.map((c) => ({ id: c.shopChannelId, name: c.name }))}
          />
        }
      />
    </>
  )
}
