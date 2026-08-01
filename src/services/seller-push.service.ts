// seller-push.service — ยิง push notification เข้าแอปผู้ขาย (deep-seller-app)
//
// แยกไฟล์จาก app-push.service (ซึ่งเป็น primitive "ส่งให้ user คนหนึ่ง") เพราะฝั่งผู้ขายมีตรรกะ
// เพิ่มอีกสองชั้นที่ primitive ไม่ควรรู้จัก: (1) noti ของ "ร้าน" ต้องถึงทุกคนที่ดูแลร้านนั้น
// ไม่ใช่แค่เจ้าของ (2) ต้องกันยิงรัวเมื่อลูกค้าพิมพ์ติด ๆ กัน
//
// เรียกจาก call-site ที่รู้ว่ามี event จริงเกิดขึ้นแล้วเท่านั้น (webhook / sendMessage) และต้องเรียก
// แบบ fire-and-forget (after() หรือ void) — push ที่ช้าหรือพังห้ามทำให้ event หลักล้ม
import { prisma } from '@/lib/prisma'
import { pushToUser } from './app-push.service'
import { getConversationToastPreview } from './chat.service'

/** เวลาที่ต้องเว้นก่อนยิง noti ของเธรดเดิมซ้ำ — ลูกค้าพิมพ์ 5 ข้อความรวดเดียวต้องได้เด้งเดียว */
const THROTTLE_MS = 25_000

/**
 * userId ทุกคนที่ควรได้ noti ของร้านนี้
 *
 * = เจ้าของร้าน (Shop.userId — ครอบทั้ง PERSONAL และ BUSINESS owner) + สมาชิกทุกคนใน ShopMember
 * (พนักงานที่ถูกเชิญของร้าน BUSINESS) — เหตุผลเดียวกับ canAccessShop() ใน lib/shop-context.ts:
 * ร้าน BUSINESS ที่ owner ไม่ได้ดูแลแชทเอง ถ้าส่งแค่ owner คนที่ตอบจริงจะไม่รู้เรื่องเลย
 *
 * Set กันซ้ำ — owner ของร้าน BUSINESS มีแถวใน ShopMember ด้วย จะได้ noti ใบเดียวไม่ใช่สองใบ
 */
async function shopAudience(shopId: string): Promise<string[]> {
  const [shop, members] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId }, select: { userId: true } }),
    prisma.shopMember.findMany({ where: { shopId }, select: { userId: true } }),
  ])
  const ids = new Set<string>()
  if (shop?.userId) ids.add(shop.userId)
  for (const m of members) ids.add(m.userId)
  return [...ids]
}

/**
 * throttle ต่อเธรด — in-memory + globalThis (pattern เดียวกับ lib/api-rate-limit.ts และ
 * SYNC_THROTTLE_MS ใน channel-chat.service.ts)
 *
 * known-gap เหมือนกันเป๊ะ: serverless หลาย instance ต่างคนต่างนับ ผลเสียสูงสุดคือผู้ขายได้ noti
 * ซ้ำสองสามใบตอน traffic กระจายหลาย instance ซึ่งยอมรับได้ ดีกว่าเสียเวลาต่อ Redis เพื่อเรื่องนี้
 * (ถ้าจะทำจริงควรทำพร้อมกับ rate-limit ตัวอื่นทีเดียว — ดู note NFR-2.3 ใน CLAUDE.md)
 */
function shouldSkipByThrottle(key: string): boolean {
  const store =
    (globalThis as { __sellerPushAt?: Map<string, number> }).__sellerPushAt ??
    ((globalThis as { __sellerPushAt?: Map<string, number> }).__sellerPushAt = new Map())
  const now = Date.now()
  const last = store.get(key)
  if (last && now - last < THROTTLE_MS) return true
  store.set(key, now)
  return false
}

/**
 * ข้อความใหม่จากลูกค้า → เด้ง noti เข้าแอปผู้ขาย
 *
 * ใช้ getConversationToastPreview() ตัวเดียวกับ toast บนเว็บ (ChatToastListener) โดยตั้งใจ —
 * ผู้ขายต้องเห็น "ชื่อคนเดียวกัน" ไม่ว่าจะรับผ่าน noti บนมือถือหรือ toast บนเดสก์ท็อป
 * (helper นั้นให้ alias ที่ร้านตั้งเองชนะชื่อจริง ตรงกับที่ InboxList แสดง)
 *
 * data.url = path ในเว็บ seller ที่แอปจะพาไปเมื่อผู้ขายกด noti (แอปต่อ base URL เอง)
 *
 * best-effort ทั้งหมด: คืน void และกลืน error เสมอ — call-site เป็น webhook ของ Meta ที่ถ้า
 * throw จะทำให้ Meta retry ทั้ง batch แล้วข้อความค้าง (บทเรียนเดียวกับ ingestAdReferral)
 */
export async function pushNewChatMessage(params: {
  shopId: string
  conversationId: string
}): Promise<void> {
  try {
    if (shouldSkipByThrottle(`chat:${params.conversationId}`)) return

    const [preview, audience] = await Promise.all([
      getConversationToastPreview(params.conversationId, params.shopId),
      shopAudience(params.shopId),
    ])
    if (!preview || audience.length === 0) return

    // preview เป็น null ได้เมื่อข้อความล่าสุดเป็นรูป/การ์ดที่ไม่มีข้อความ — ต้องมีคำแทน
    // ไม่งั้น noti จะขึ้นบรรทัดว่าง ๆ ดูเหมือนแอปพัง
    const body = preview.preview?.trim() || 'ส่งข้อความถึงคุณ'

    await Promise.all(
      audience.map((userId) =>
        pushToUser(userId, preview.senderName, body, {
          type: 'chat',
          url: `/inbox/${params.conversationId}`,
          conversationId: params.conversationId,
        }),
      ),
    )
  } catch (e) {
    console.error('[seller-push] pushNewChatMessage failed', e)
  }
}
