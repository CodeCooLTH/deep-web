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
import { resolveChatScope } from '@/lib/chat-scope'
import { listCommentPosts, backfillPagePosts, backfillMissingPostThumbnails } from '@/services/page-comment.service'
import { listChannelsForShops } from '@/services/shop-channel.service'
import { prisma } from '@/lib/prisma'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import CommentsClient, { type CommentPostItem } from './CommentsClient'

export const metadata: Metadata = { title: 'ความคิดเห็น' }
export const dynamic = 'force-dynamic'

export default async function CommentsPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id: string; activeShopId?: string | null } | undefined
  if (!user?.id) redirect('/auth/sign-in')

  // feature 00037 — แท็บความคิดเห็นรวมทุกร้านตามโหมดเดียวกับแท็บข้อความ (D-4)
  const scope = await resolveChatScope({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!scope) {
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
  const backfillShopIds = scope.shopIds
  after(async () => {
    // ทุกร้านในขอบเขต — โหมดรวมต้องดึงโพสต์ย้อนหลังของทุกเพจที่ผู้ใช้กำลังดูอยู่
    // (throttle ต่อเพจ 10 นาทีอยู่ในตัว backfillPagePosts แล้ว จึงไม่ยิง Graph ถี่ขึ้นจริง)
    for (const shopId of backfillShopIds) {
      await backfillPagePosts({ shopId, actorUserId: user.id })
    }
    // เก็บตกรูปปกของโพสต์เก่าที่ยังไม่มีสำเนา ทีละไม่กี่ใบต่อการเปิดหน้า (2026-08-10)
    // โพสต์ที่ไม่มีใครกดเปิดจะไม่มีวันได้สำเนาเลยถ้าไม่มีตัวนี้ — URL ของ fbcdn หมดอายุ ~4 วัน
    // มี throttle ในตัวผ่าน refreshPostStats จึงไม่ยิง Graph ถี่ขึ้นจริงแม้เปิดหน้าถี่ ๆ
    await backfillMissingPostThumbnails({ shopIds: backfillShopIds })
  })

  let posts: CommentPostItem[] = []
  // feature 00038 — ตัวนับ 4 กลุ่มของหน้าแรก มาจาก listCommentPosts เดียวกับที่ดึง posts
  // (BR-CR-S4: badge/แท็บ/ตัวกรองต้องมาจาก symbol เดียว) ค่าตั้งต้น 0 ทั้งชุดถ้าโหลดพัง
  let counts = { all: 0, unanswered: 0, botAnswered: 0, humanAnswered: 0 }
  /**
   * จำนวนโพสต์ "ดิบ" ที่ query ของหน้าแรกดึงมาได้จริง — คนละความหมายกับ `counts.all` ซึ่งเป็นยอด
   * **ทั้งร้าน** (ดู listCommentPosts) client ใช้ตัวนี้เป็น skip ของหน้าถัดไป ส่งผิดแล้วปุ่ม
   * "โหลดโพสต์เก่ากว่านี้" จะข้ามโพสต์เป็นสิบ (impeccable critique 2026-08-09 รอบ 2)
   */
  let rawCount = 0
  let failed = false
  // เพจที่เชื่อมไว้ — ใช้ทำตัวกรอง (ร้านเชื่อมได้หลายเพจ); v1 ครอบเฉพาะ Facebook
  const channelsRaw = (await listChannelsForShops(scope.shopIds).catch(() => [])).filter(
    (c) => c.provider === 'MESSENGER',
  )
  /**
   * feature 00038 Task 8 — prefill กล่องทักแชทด้วยข้อความสวิตช์ B ของเพจนั้น (ChannelOption ต้อง
   * พ่วง commentPrivateReplyText) listChannelsForShops ไม่ได้ select คอลัมน์นี้ (เป็นของฟีเจอร์ที่
   * เพิ่งมาทีหลัง และ service กลางนั้นอยู่นอกขอบเขตไฟล์ที่ task นี้แตะได้) จึง query เสริมสั้น ๆ
   * แทนที่จะแก้ signature ของ service กลางซึ่งมีผู้ใช้อื่นอยู่แล้ว
   */
  const privateTextByChannelId = new Map(
    (
      await prisma.shopChannel.findMany({
        where: { id: { in: channelsRaw.map((c) => c.id) } },
        select: { id: true, commentPrivateReplyText: true },
      })
    ).map((c) => [c.id, c.commentPrivateReplyText] as const),
  )
  const channels = channelsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    avatarUrl: c.avatarUrl,
    shopId: c.shopId,
    shopName: c.shopName,
    commentPrivateReplyText: privateTextByChannelId.get(c.id) ?? null,
  }))
  try {
    const result = await listCommentPosts({ shopIds: scope.shopIds, actorUserId: user.id })
    posts = result.posts.map((p) => ({
      ...p,
      lastCommentAt: p.lastCommentAt ? p.lastCommentAt.toISOString() : null,
      oldestUnansweredAt: p.oldestUnansweredAt ? p.oldestUnansweredAt.toISOString() : null,
    }))
    counts = result.counts
    rawCount = result.rawCount
  } catch {
    failed = true
  }

  // ตัวเลข "ยังไม่ตอบ" บนแท็บถูกย้ายไปให้ InboxTabs ดึงเองที่ layout แล้ว (endpoint เดียว + cache
  // ระดับโมดูล) — หน้านี้ไม่ต้อง query ซ้ำอีก

  return (
    <div className="card m-0 flex h-full min-w-0 flex-1 flex-col rounded-none border-0 shadow-none">
      {failed ? (
        <div className="p-4">
          <SellerEmptyState
            icon="alert-circle"
            title="โหลดความคิดเห็นไม่สำเร็จ"
            description="ลองรีเฟรชหน้านี้อีกครั้ง"
          />
        </div>
      ) : (
        // key: ขอบเขตเปลี่ยน = รายการโพสต์คนละชุด (ดู comment scopeKey ที่ (chat)/layout.tsx)
        <CommentsClient
          key={`${scope.mode}:${scope.shopIds.join(',')}`}
          initialPosts={posts}
          initialRawCount={rawCount}
          initialCounts={counts}
          shopIds={scope.shopIds}
          unified={scope.mode === 'UNIFIED'}
          channels={channels}
        />
      )}
    </div>
  )
}
