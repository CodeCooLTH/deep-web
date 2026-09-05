import { NextResponse } from 'next/server'

import { getOrCreateAutoOrderConfig } from '@/services/auto-order-config.service'
import { countDraftedOrders } from '@/services/auto-order-detect.service'
import { requireAutoOrderShop } from './_shared'

// auth per-user — ห้าม cache ข้าม user (feedback_auth_api_cache_control)
export const dynamic = 'force-dynamic'

/** GET /api/seller/auto-order — ชุดตั้งค่าทั้งหมดของร้าน (หน้า A) */
export async function GET() {
  const guard = await requireAutoOrderShop()
  if (!guard.ok) return guard.response

  const config = await getOrCreateAutoOrderConfig(guard.shopId)

  // จำนวนเพจที่ "มีผลจริง" — คำนวณสดจากแถวที่ join มาแล้ว ไม่ยิงคิวรีเพิ่ม
  // 🛑 ต้องแสดงตัวเลขนี้บนหน้าจอเสมอ: สถานะ LIVE ที่มี effective = 0 คือ OFFLINE โดยปริยาย
  // ซึ่งเป็นสภาพที่ระบบยอมให้เกิดโดยตั้งใจ (ไม่ auto-flip) ⇒ ต้องมีคนบอกผู้ใช้
  const effectiveChannels = config.channels.filter((c) => c.channel.status === 'ACTIVE')

  return NextResponse.json({
    status: config.status,
    phrases: config.phrases.map((p) => ({ id: p.id, phrase: p.phrase })),
    channels: config.channels.map((c) => ({
      shopChannelId: c.shopChannelId,
      name: c.channel.name,
      provider: c.channel.provider,
      status: c.channel.status,
      messageEchoesStatus: c.channel.messageEchoesStatus,
      messageEchoesCheckedAt: c.channel.messageEchoesCheckedAt,
    })),
    testThreadIds: config.testThreads.map((t) => t.conversationId),
    effectiveChannelCount: effectiveChannels.length,
    draftCount: await countDraftedOrders(guard.shopId),
  })
}
