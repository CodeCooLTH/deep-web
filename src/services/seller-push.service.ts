// seller-push.service — ยิง push notification เข้าแอปผู้ขาย (deep-seller-app)
//
// แยกไฟล์จาก app-push.service (ซึ่งเป็น primitive "ส่งให้ user คนหนึ่ง") เพราะฝั่งผู้ขายมีตรรกะ
// เพิ่มอีกสองชั้นที่ primitive ไม่ควรรู้จัก: (1) noti ของ "ร้าน" ต้องถึงทุกคนที่ดูแลร้านนั้น
// ไม่ใช่แค่เจ้าของ (2) ต้องกันยิงรัวเมื่อลูกค้าพิมพ์ติด ๆ กัน
//
// เรียกจาก call-site ที่รู้ว่ามี event จริงเกิดขึ้นแล้วเท่านั้น (webhook / sendMessage) และต้องเรียก
// แบบ fire-and-forget (after() หรือ void) — push ที่ช้าหรือพังห้ามทำให้ event หลักล้ม
import { prisma } from '@/lib/prisma'
import { getChannelLabel } from '@/lib/chat-channel'
import { pushToUsers } from './app-push.service'
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
 * บรรทัดกลางของ noti — **ชื่อเพจล้วน** (เช่น `BT Premium Auto Xenon คลองสวน`)
 *
 * ทำไมต้องมี (user request 2026-08-08): เดิม noti มีแค่ชื่อลูกค้ากับข้อความ ผู้ขายที่ผูกหลายเพจ
 * หรือถือหลายร้าน จึงดูไม่ออกว่าข้อความนี้เข้ามาทางไหนจนกว่าจะกดเปิด — เป็นปัญหาเดียวกับที่ user
 * สั่งแก้ในกล่องแชทเมื่อ 2026-07-23 ("คำว่า Messenger ซ้ำกันทุกเธรดจนไม่ให้ข้อมูลอะไร" → ใส่ชื่อ
 * เพจลงบน ChannelBadge) แค่คนละพื้นผิว
 *
 * 🛑 ห้ามเติมชื่อช่องทางนำหน้าอีก (`Messenger · …`) — เคยทำแล้วถอดออกวันเดียวกัน
 * รอบแรกส่ง `"{ช่องทาง} · {ชื่อเพจ}"` ขึ้น prod แล้วหัวหน้าทักทันทีจากเครื่องจริง: *"ทำไมมันมี
 * Messenger มาด้านหน้า เสียพื้นที่"* — คำว่า `Messenger · ` กิน 12 ตัวอักษรแรกของบรรทัด แล้วดัน
 * ชื่อเพจจนโดนตัด (เห็นจริงบนเครื่อง: `Messenger · BT Premium Auto Xenon คลอง…`) กลายเป็นว่า
 * ส่วนที่เสียพื้นที่ไปเบียดคือ **ตัวระบุที่ผู้ใช้ต้องการจริง** ส่วนที่ถูกตัดคือหางของชื่อเพจซึ่งเป็น
 * ที่ที่เพจของร้านเดียวกันต่างกัน — เหตุผลเดียวกับที่ไม่ยัดรวมลง title ตั้งแต่แรก แค่ย้ายมาเกิด
 * อีกบรรทัดหนึ่ง (ซ้ำคลาสเดิม เพราะประเมิน "ที่ว่างในบรรทัดกลาง" ว่ามีเหลือเฟือโดยไม่ได้วัด)
 *
 * ช่องทางไม่ได้หายไปไหน: ผู้ใช้ยังรู้จาก **ชื่อเพจเอง** (เพจ Facebook กับบัญชี IG คนละชื่อกัน) และ
 * `channel` ยังถูกส่งไปใน `data` ให้แอปหยิบใช้ได้ตลอด
 *
 * เธรด Deep (ลูกค้าทักผ่านแอป/เว็บของเราเอง) ไม่มี shopChannel → channelName เป็น null
 * (getConversationToastPreview เข้า if ไม่ได้) จึงถอยไปใช้ชื่อช่องทางแทน — บรรทัดนี้ห้ามว่าง
 * ไม่งั้น iOS จะดันเนื้อหาขึ้นมาชิดหัวเรื่องแล้วผู้ใช้จะเห็น noti สองแบบสลับกันไปมาโดยไม่มีเหตุผล
 *
 * ชื่อช่องทาง (เคส fallback) ดึงจาก getChannelLabel เท่านั้น ห้ามพิมพ์คำเอง (Hard Rule 16)
 */
export function channelLine(channel: string, channelName: string | null): string {
  return channelName?.trim() || getChannelLabel(channel)
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

    // pushToUsers (ไม่ใช่วน pushToUser) — ยุบเหลือ 1 query + 1 request ไป exp.host
    // ร้านที่มีพนักงานหลายคนจะได้ noti "พร้อมกัน" ไม่ใช่ไล่ทีละคนห่างกันคนละ ~300ms
    // channel/channelName ใส่ลง data ด้วย ไม่ใช่แค่ subtitle — วันที่แอปอยากใช้ค่าพวกนี้เอง
    // (จัดกลุ่ม noti ตามเพจ / ทำหน้าตาเอง / รองรับ Android ที่ไม่มี subtitle) จะหยิบได้ทันที
    // โดยไม่ต้องแก้ฝั่งเว็บซ้ำแล้วรอ deploy อีกรอบ
    await pushToUsers(
      audience,
      preview.senderName,
      body,
      {
        type: 'chat',
        url: `/inbox/${params.conversationId}`,
        conversationId: params.conversationId,
        channel: preview.channel,
        channelName: preview.channelName,
      },
      { subtitle: channelLine(preview.channel, preview.channelName) },
    )
  } catch (e) {
    console.error('[seller-push] pushNewChatMessage failed', e)
  }
}
