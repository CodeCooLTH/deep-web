/**
 * /inbox/comments — แท็บ "ความคิดเห็น" (feature 00029)
 *
 * RSC shell แบบเดียวกับ /inbox: fetch หน้าแรกผ่าน service ตรง ๆ (ไม่ self-fetch API ของตัวเอง)
 * แล้วส่งต่อให้ client component ทำ search/เลือกโพสต์/ตอบต่อผ่าน /api/chat/comments/*
 *
 * ร้านต้องผูกเพจ Facebook อยู่ก่อน — ยังไม่เชื่อม = empty state พร้อมทางไปหน้าเชื่อมช่องทาง
 * (เหมือน /inbox ตอนยังไม่มีช่องทาง)
 */
import type { Metadata } from 'next'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listCommentPosts, countUnansweredForShop, backfillPagePosts } from '@/services/page-comment.service'
import { listChannels } from '@/services/shop-channel.service'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import InboxTabs from '../../_components/InboxTabs'
import CommentsClient, { type CommentPostItem } from './CommentsClient'

export const metadata: Metadata = { title: 'ความคิดเห็น' }
export const dynamic = 'force-dynamic'

export default async function CommentsPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id: string; activeShopId?: string | null } | undefined
  if (!user?.id) redirect('/auth/sign-in')

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) {
    return <SellerErrorState title="ไม่พบร้านที่กำลังใช้งาน" message="ลองสลับร้านอีกครั้ง หรือรีเฟรชหน้านี้" />
  }

  /**
   * ดึงโพสต์ย้อนหลังของเพจเข้าฐาน (user สั่ง 2026-08-04 "จัดเลย ย้อนหลัง" หลังเทียบกับ Business Suite)
   *
   * รันใน `after()` = หลังส่ง HTML ให้ผู้ใช้แล้ว — ไม่ถ่วงเวลาเปิดหน้าเลย (ยิง Graph หลายรอบ:
   * 1 ครั้งเอารายการโพสต์ + ไม่เกิน 15 ครั้งเอาคอมเมนต์ของโพสต์ที่มีคนคอมเมนต์)
   * ของที่ได้เพิ่มจะโผล่เองในรอบ poll/realtime ถัดไปของ CommentsClient ไม่ต้องรีเฟรชมือ
   * ฟังก์ชันไม่ throw และมี throttle ต่อเพจ 10 นาทีในตัว (ดู backfillPagePosts)
   */
  after(async () => {
    await backfillPagePosts({ shopId: activeCtx.shopId, actorUserId: user.id })
  })

  let posts: CommentPostItem[] = []
  let failed = false
  // เพจที่เชื่อมไว้ — ใช้ทำตัวกรอง (ร้านเชื่อมได้หลายเพจ); v1 ครอบเฉพาะ Facebook
  const channels = (await listChannels(activeCtx.shopId).catch(() => []))
    .filter((c) => c.provider === 'MESSENGER')
    .map((c) => ({ id: c.id, name: c.name, provider: c.provider, avatarUrl: c.avatarUrl }))
  try {
    const rows = await listCommentPosts({ shopId: activeCtx.shopId, actorUserId: user.id })
    posts = rows.map((p) => ({
      ...p,
      lastCommentAt: p.lastCommentAt ? p.lastCommentAt.toISOString() : null,
      oldestUnansweredAt: p.oldestUnansweredAt ? p.oldestUnansweredAt.toISOString() : null,
    }))
  } catch {
    failed = true
  }

  // นับจากฐานทั้งร้าน ไม่ใช่บวกจากโพสต์ที่โหลดมา 25 อันแรก (ไม่งั้นร้านโพสต์เยอะได้เลขต่ำกว่าจริง)
  const unanswered = await countUnansweredForShop({
    shopId: activeCtx.shopId,
    actorUserId: user.id,
  }).catch(() => posts.reduce((sum, p) => sum + p.unansweredCount, 0))

  return (
    <div className="card m-0 flex h-full min-w-0 flex-1 flex-col rounded-none border-0 shadow-none">
      <InboxTabs unansweredCount={unanswered} shopId={activeCtx.shopId} />
      {failed ? (
        <div className="p-4">
          <SellerEmptyState
            icon="alert-circle"
            title="โหลดความคิดเห็นไม่สำเร็จ"
            description="ลองรีเฟรชหน้านี้อีกครั้ง"
          />
        </div>
      ) : (
        <CommentsClient initialPosts={posts} shopId={activeCtx.shopId} channels={channels} />
      )}
    </div>
  )
}
