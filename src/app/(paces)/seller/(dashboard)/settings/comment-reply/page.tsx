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
 * เพราะไฟล์นั้นเป็น route handler ไม่ใช่ service function — "โหลดเพิ่ม" ฝั่ง client ยิง endpoint
 * นั้นต่อสำหรับหน้าถัดไป)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import CommentReplyClient, { type CommentReplyChannel, type CommentReplyLogRow } from './CommentReplyClient'

export const metadata: Metadata = { title: 'ตอบกลับคอมเมนต์' }

const LOGS_PAGE_SIZE = 20

/**
 * ข้อความไทยของ skipReason — มิเรอร์ SKIP_REASON_TEXT ใน
 * src/app/api/shops/comment-reply/logs/route.ts (SSOT จริงของ mapping นี้ — ดู DATABASE.md §3.4)
 * ต้องซ้ำที่นี่เพราะหน้านี้ query prisma ตรงแทนการ self-fetch API ของตัวเอง (ดู comment หัวไฟล์)
 * — แก้ค่าใดค่าหนึ่งต้องแก้อีกไฟล์ด้วยเสมอ
 */
const SKIP_REASON_TEXT: Record<string, string> = {
  FROM_PAGE: 'คอมเมนต์ของเพจเอง',
  NOT_TOP_LEVEL: 'เป็นการตอบซ้อน ไม่ใช่คอมเมนต์หลัก',
  COMMENT_DELETED: 'คอมเมนต์ถูกลบไปแล้ว',
  NO_SENDER_ID: 'ไม่พบผู้คอมเมนต์',
  CHANNEL_INACTIVE: 'เพจยังไม่ได้เชื่อมต่อ',
  DISABLED: 'ปิดการตอบกลับอัตโนมัติไว้ หรือยังไม่ได้กรอกข้อความ',
  ALREADY_HANDLED: 'เคยตอบอัตโนมัติคนนี้บนโพสต์นี้ไปแล้ว',
  HUMAN_ANSWERED: 'มีคนในทีมตอบคอมเมนต์นี้ไปแล้ว',
  WINDOW_EXPIRED: 'เกิน 7 วันนับจากเวลาคอมเมนต์',
}

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

  // ประวัติหน้าแรก — ดึงเกินมา 1 แถวเพื่อรู้ hasMore โดยไม่ต้อง count() แยก (มิเรอร์ logs/route.ts)
  const logRows = await prisma.commentReplyLog.findMany({
    where: { channel: { shopId: activeCtx.shopId } },
    orderBy: { createdAt: 'desc' },
    take: LOGS_PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      trigger: true,
      publicReplyStatus: true,
      privateReplyStatus: true,
      skipReason: true,
      conversationId: true,
      comment: { select: { fromName: true } },
      post: { select: { message: true } },
    },
  })
  const hasMoreLogs = logRows.length > LOGS_PAGE_SIZE
  const logPage = hasMoreLogs ? logRows.slice(0, LOGS_PAGE_SIZE) : logRows
  const initialLogs: CommentReplyLogRow[] = logPage.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    commenterName: r.comment?.fromName ?? null,
    postMessage: r.post?.message ?? null,
    trigger: r.trigger,
    publicReplyStatus: r.publicReplyStatus,
    privateReplyStatus: r.privateReplyStatus,
    skipReasonText: r.skipReason ? (SKIP_REASON_TEXT[r.skipReason] ?? r.skipReason) : null,
    conversationId: r.conversationId,
  }))

  return (
    <>
      <PageBreadcrumb title="ตอบกลับคอมเมนต์" trail={BREADCRUMB_TRAIL} />
      <CommentReplyClient
        channels={messengerChannels}
        instagramChannel={instagramChannel}
        initialLogs={{ logs: initialLogs, hasMore: hasMoreLogs }}
      />
    </>
  )
}
