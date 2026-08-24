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
import { describeSendFailure } from '@/lib/chat-send-failure'
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
 *
 * แล้วหักคนที่ "ปิดแจ้งเตือนของร้านนี้ไว้" ออก (user สั่ง 2026-08-08: "ตั้งค่าทีละร้านได้" —
 * ผู้ขายที่ถือหลายร้านอยากปิดเสียงร้านหนึ่งโดยไม่กระทบอีกร้าน)
 *
 * 🛑 หัก "ที่นี่" ไม่ใช่ที่ pushToUsers: pushToUsers เป็น primitive ที่ฝั่งผู้ซื้อใช้ด้วย
 * (เหรียญตรา / ประมูล) ถ้าไปกรองที่นั่น การปิดแจ้งเตือน "ร้าน" จะพลอยปิด noti ที่ไม่เกี่ยวข้องกับ
 * ร้านเลยไปด้วย ซึ่งไม่ตรงกับสิ่งที่ผู้ใช้เห็นบนหน้าจอตอนกดสวิตช์
 *
 * query ตัวที่สามอยู่ใน Promise.all เดิม → ไม่เพิ่มเวลาแม้แต่รอบเดียว
 * และถามเฉพาะ "คนที่ปิด" (chatEnabled: false) เพราะกติกาคือ **ไม่มีแถว = เปิด** จึงไม่ต้องดึง
 * ทุกแถวมานับ — ตารางนี้จะมีข้อมูลน้อยมากโดยธรรมชาติ (เก็บเฉพาะคนที่กดปิดจริง ๆ)
 */
async function shopAudience(shopId: string): Promise<string[]> {
  const [shop, members, optedOut] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId }, select: { userId: true } }),
    prisma.shopMember.findMany({ where: { shopId }, select: { userId: true } }),
    prisma.shopNotificationPref.findMany({
      where: { shopId, chatEnabled: false },
      select: { userId: true },
    }),
  ])
  const ids = new Set<string>()
  if (shop?.userId) ids.add(shop.userId)
  for (const m of members) ids.add(m.userId)
  for (const p of optedOut) ids.delete(p.userId)
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
 * **หัวเรื่อง** ของ noti — ชื่อเพจที่ลูกค้าทักเข้ามา (เช่น `BT Premium Auto Xenon คลอง4 ธัญบุรี`)
 *
 * ทำไมต้องมี (user request 2026-08-08): เดิม noti มีแค่ชื่อลูกค้ากับข้อความ ผู้ขายที่ผูกหลายเพจ
 * หรือถือหลายร้าน จึงดูไม่ออกว่าข้อความนี้เข้ามาทางไหนจนกว่าจะกดเปิด — เป็นปัญหาเดียวกับที่ user
 * สั่งแก้ในกล่องแชทเมื่อ 2026-07-23 ("คำว่า Messenger ซ้ำกันทุกเธรดจนไม่ให้ข้อมูลอะไร" → ใส่ชื่อ
 * เพจลงบน ChannelBadge) แค่คนละพื้นผิว
 *
 * 🛑 ห้ามเติมชื่อช่องทางนำหน้า (`Messenger · …`) — เคยทำแล้วถอดออกวันเดียวกัน
 * รอบแรกส่ง `"{ช่องทาง} · {ชื่อเพจ}"` ขึ้น prod แล้วหัวหน้าทักทันทีจากเครื่องจริง: *"ทำไมมันมี
 * Messenger มาด้านหน้า เสียพื้นที่"* — คำว่า `Messenger · ` กิน 12 ตัวอักษรแรกของบรรทัด แล้วดัน
 * ชื่อเพจจนโดนตัด (เห็นจริงบนเครื่อง: `Messenger · BT Premium Auto Xenon คลอง…`) กลายเป็นว่า
 * ส่วนที่เสียพื้นที่ไปเบียดคือ **ตัวระบุที่ผู้ใช้ต้องการจริง** ส่วนที่ถูกตัดคือหางของชื่อเพจซึ่งเป็น
 * ที่ที่เพจของร้านเดียวกันต่างกัน (ซ้ำคลาสเดิมของการยัดรวมลง title แค่ย้ายมาเกิดอีกบรรทัด —
 * เพราะประเมิน "ที่ว่าง" ว่ามีเหลือเฟือโดยไม่ได้วัด)
 *
 * ช่องทางไม่ได้หายไปไหน: ผู้ใช้ยังรู้จาก **ชื่อเพจเอง** (เพจ Facebook กับบัญชี IG คนละชื่อกัน) และ
 * `channel` ยังถูกส่งไปใน `data` ให้แอปหยิบใช้ได้ตลอด
 *
 * เธรด Deep (ลูกค้าทักผ่านแอป/เว็บของเราเอง) ไม่มี shopChannel → channelName เป็น null
 * (getConversationToastPreview เข้า if ไม่ได้) จึงถอยไปใช้ชื่อช่องทางแทน — ค่านี้ห้ามว่างเด็ดขาด
 * เพราะมันคือ `title` ของ noti: iOS ที่ไม่มี title จะดันบรรทัดอื่นขึ้นมาแทน ผู้ใช้จะเห็น noti
 * สองทรงสลับกันโดยไม่มีเหตุผล
 *
 * ชื่อช่องทาง (เคส fallback) ดึงจาก getChannelLabel เท่านั้น ห้ามพิมพ์คำเอง (Hard Rule 16)
 */
export function pageTitle(channel: string, channelName: string | null): string {
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

    /**
     * ลำดับ 3 บรรทัด = ชื่อเพจ / ชื่อคนส่ง / ข้อความ (user สั่งชัดเจน 2026-08-08 เขียนเป็น
     * โครงมาให้เลย) — **ชื่อเพจอยู่ `title` ไม่ใช่ `subtitle`**
     *
     * เหตุผลเชิงการใช้งาน: `title` เป็นบรรทัดที่เด่นที่สุดบน iOS ผู้ขายที่ดูแลหลายเพจต้องรู้
     * "ใบนี้ของเพจไหน" ก่อนจะสนใจว่าใครทัก — เพจคือกล่องงาน ส่วนชื่อลูกค้าคือรายละเอียดข้างใน
     *
     * 🛑 หนี้ Android ที่เปลี่ยนหน้าตาไปพร้อมกัน: `subtitle` เป็น iOS-only เดิม Android เสีย
     * "ข้อความนี้มาจากเพจไหน" แต่หลังสลับแล้ว Android จะเสีย **"ใครทัก"** แทน (เหลือชื่อเพจ +
     * ข้อความ) ยังไม่กระทบเพราะปล่อยแค่ iOS — แต่วันเพิ่มคอลัมน์ `platform` ใน PushToken
     * ต้องประกอบข้อความของ Android ให้มีชื่อคนส่งด้วย ไม่ใช่ก็อปชุดนี้ไปตรง ๆ
     *
     * pushToUsers (ไม่ใช่วน pushToUser) — ยุบเหลือ 1 query + 1 request ไป exp.host
     * ร้านที่มีพนักงานหลายคนจะได้ noti "พร้อมกัน" ไม่ใช่ไล่ทีละคนห่างกันคนละ ~300ms
     *
     * channel/channelName ใส่ลง data ด้วย ไม่ใช่แค่บรรทัดที่แสดง — วันที่แอปอยากใช้ค่าพวกนี้เอง
     * (จัดกลุ่ม noti ตามเพจ / ทำหน้าตาเอง / รองรับ Android) จะหยิบได้ทันทีโดยไม่ต้องแก้ฝั่งเว็บซ้ำ
     */
    await pushToUsers(
      audience,
      pageTitle(preview.channel, preview.channelName),
      body,
      {
        type: 'chat',
        url: `/inbox/${params.conversationId}`,
        conversationId: params.conversationId,
        channel: preview.channel,
        channelName: preview.channelName,
      },
      { subtitle: preview.senderName },
    )
  } catch (e) {
    console.error('[seller-push] pushNewChatMessage failed', e)
  }
}

/**
 * ข้อความของ **ผู้ขายเอง** ส่งออกไม่สำเร็จอย่างถาวร → เด้ง noti เข้าแอป (CR คิวขาออก 2026-08-23)
 *
 * 🛑 ทำไมถึงต้องมีตัวนี้ ทั้งที่ก่อนหน้านี้ไม่เคยต้องมี: เดิมการยิงเกิด **ในคำขอที่ผู้ขายนั่งรออยู่**
 * ⇒ ความล้มเหลวถูกรายงานกลับใน response ทันที เขาเห็นแน่นอนเพราะเขายังถือมือถืออยู่. พอ CR ย้ายการ
 * ยิงไปหลังบ้าน (เขียนแถว `QUEUED` ก่อนตอบ client แล้วยิงเบื้องหลัง) มันกลายเป็นเหตุการณ์ที่ไม่มีใคร
 * นั่งรอ — และสมมติฐานทั้งหมดของงานคือ *ผู้ขายไม่ได้ดูจออยู่* (D-4) ⇒ ถ้าไม่มีตัวนี้ CR จะทำให้ผู้ขาย
 * มีโอกาสรู้ว่าส่งไม่สำเร็จ **น้อยลงกว่าก่อนทำ CR** ซึ่งกลับทิศกับเจตนาของงานทั้งก้อน
 *
 * 🛑 throttle key อยู่คนละ namespace กับ noti "ข้อความใหม่" โดยจำเป็น ไม่ใช่เพื่อความเรียบร้อย:
 * ใช้ `chat:${conversationId}` ร่วมกันเมื่อไหร่ ใบนี้จะถูกกลืนทุกครั้งที่ห้องเดียวกันเพิ่งมีข้อความ
 * ลูกค้าเข้ามาใน 25 วินาที — ซึ่งคือ **ลำดับเหตุการณ์ปกติที่สุดของการคุยแชท** (ลูกค้าทัก → ร้านตอบ →
 * ตอบไม่ออก) ⇒ ตัวแจ้งจะเงียบพอดีในเคสที่มันถูกสร้างมาเพื่อแจ้ง (คลาสเดียวกับ
 * docs/conventions/log-row-collides-with-the-guard-it-explains.md)
 *
 * ผลพลอยได้ที่ตั้งใจ: throttle เดียวกันนี้ **รวบ noti ต่อห้อง** ให้เอง — ผู้ขายพิมพ์รัว 5 ใบแล้วล้ม
 * ทั้งชุด (เกินหน้าต่าง 24 ชม. = ล้มทุกใบแน่นอน) ได้เด้งเดียว ไม่ใช่ห้าเด้งที่บอกเรื่องเดียวกัน
 *
 * 🛑 ถ้อยคำมาจาก `describeSendFailure()` เท่านั้น ห้ามพิมพ์คำใหม่ (HR16) — บับเบิลแดงในเธรดกับ noti
 * บนมือถือคือ "เรื่องเดียวกัน" ถ้าพูดคนละสำนวน ผู้ขายจะไม่แน่ใจว่ามันคือใบเดียวกันหรือคนละใบ
 * ใช้ `.message` (มีคำนำหน้า "ส่งไม่สำเร็จ — ") ไม่ใช่ `.text` เพราะ noti ไม่มีป้ายหัวเรื่องของตัวเอง
 * เหมือน UI ในเธรด — บรรทัด body คือที่เดียวที่จะบอกได้ว่านี่คือข่าวร้าย ไม่ใช่ข้อความใหม่
 *
 * ผ่าน `shopAudience()` (หักคนที่ปิดแจ้งเตือนร้านนี้) ไม่ใช่ `shopSystemAlertAudience()` — ใบนี้เป็น
 * noti ของ *แชท* ห้องหนึ่ง ไม่ใช่ข่าว "ระบบร้านพัง" ที่ครอบทุกห้อง (เส้นแบ่งเดียวกับ D-CH-8)
 *
 * best-effort ทั้งหมด: คืน void และกลืน error เสมอ — call site อยู่ **ในเส้นทางส่งข้อความ**
 * (`chat-outbox.service`) ถ้า throw จะทำให้แถวที่ claim ไว้ค้าง แล้วถูกกวาดเป็น "ไม่แน่ใจว่าส่งไป
 * หรือยัง" ทั้งที่รู้ผลแน่ชัดแล้ว = เชิญผู้ขายให้กดส่งซ้ำ ซึ่งเป็นทางเดียวที่ลูกค้าจะได้ข้อความซ้ำ
 */
export async function pushChatSendFailed(params: {
  shopId: string
  conversationId: string
  failureReason: string | null
}): Promise<void> {
  try {
    if (shouldSkipByThrottle(`chat-send-failed:${params.conversationId}`)) return

    const [preview, audience] = await Promise.all([
      // ทำหน้าที่เป็นด่าน ownership ด้วย (WHERE { id, shopId }) — คืน null = เธรดไม่ใช่ของร้านนี้
      getConversationToastPreview(params.conversationId, params.shopId),
      shopAudience(params.shopId),
    ])
    if (!preview || audience.length === 0) return

    await pushToUsers(
      audience,
      // ลำดับ 3 บรรทัดชุดเดียวกับ noti ข้อความใหม่ (user สั่งเอง 2026-08-08 ห้ามสลับ):
      // ชื่อเพจ → ชื่อคู่สนทนา → ข้อความ. ใบนี้ "ชื่อคนส่ง" = ลูกค้าที่เราส่งหาไม่สำเร็จ ซึ่งเป็น
      // ตัวระบุห้องตัวเดียวกัน ⇒ ผู้ขายอ่าน noti สองชนิดด้วยสายตาชุดเดียว ไม่ต้องเรียนรู้รูปแบบใหม่
      pageTitle(preview.channel, preview.channelName),
      describeSendFailure(params.failureReason).message,
      {
        // ชนิดแยกจาก 'chat' — วันที่แอปอยากทำเสียง/ไอคอน/การจัดกลุ่มต่างกัน จะแยกได้ทันที
        type: 'chat-send-failed',
        // กดแล้วต้องเข้าห้องที่ส่งไม่ออก ผู้ขายจะได้เห็นบับเบิลแดงใบนั้นเลย ไม่ใช่หน้ารวม
        url: `/inbox/${params.conversationId}`,
        conversationId: params.conversationId,
        channel: preview.channel,
        channelName: preview.channelName,
      },
      { subtitle: preview.senderName },
    )
  } catch (e) {
    console.error('[seller-push] pushChatSendFailed failed', e)
  }
}

/**
 * ผู้รับ "ข่าวสถานะระบบของร้าน" — เจ้าของ + สมาชิกทุกคน **ไม่หัก `ShopNotificationPref`**
 *
 * 🛑 ต่างจาก `shopAudience()` โดยตั้งใจ (D-CH-8 / AC-CH-20, user เคาะ 2026-08-12): สวิตช์
 * ปิดแจ้งเตือนรายร้านถูกออกแบบมาเพื่อ *"ฉันไม่อยากรับแจ้งเตือน **ข้อความ** ของร้านนี้"*
 * ไม่ใช่ *"ฉันไม่อยากรู้ว่าร้านนี้พัง"* — คนที่ปิดเสียงข้อความลูกค้าคือคนที่ยิ่งต้องรู้ว่า
 * ช่องทางหลุด เพราะเขาจะไม่มีทางสังเกตจากความเงียบได้เลย
 *
 * 🛑 กรองที่ชั้นนี้ ไม่ใช่ที่ `pushToUsers` — ตัวนั้นเป็น primitive ที่ฝั่งผู้ซื้อใช้ร่วม
 * (เหรียญตรา/ประมูล) แก้ผิดชั้นแล้วจะพลอยเปลี่ยนของที่ไม่เกี่ยวกับร้านเลย
 */
async function shopSystemAlertAudience(shopId: string): Promise<string[]> {
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
 * แจ้งว่าช่องทางแชทหลุด — **ยิงครั้งเดียวตอนสถานะพลิก** ไม่ใช่ทุกครั้งที่ส่งข้อความล้ม (AC-CH-19)
 *
 * ผู้เรียกต้องเป็นจุดที่ "รู้ว่าเพิ่งพลิก" เท่านั้น (ตัวที่เขียน `status='TOKEN_INVALID'`)
 * ถ้าเรียกจากเส้นทางส่งข้อความ ผู้ขายจะได้ noti ทุกครั้งที่กดส่งจนกว่าจะแก้ ซึ่งแย่กว่าไม่มี
 */
export async function pushChannelDisconnected(params: {
  shopId: string
  channelName: string
  /** ชื่อช่องทาง (LINE / Messenger / Instagram) — จาก `src/lib/chat-channel.ts` ห้ามพิมพ์เอง */
  channelLabel: string
}): Promise<void> {
  try {
    const audience = await shopSystemAlertAudience(params.shopId)
    if (audience.length === 0) return
    await pushToUsers(
      audience,
      params.channelName,
      `ส่งข้อความหาลูกค้าไม่ได้ — การเชื่อมต่อ ${params.channelLabel} มีปัญหา แตะเพื่อแก้ไข`,
      { type: 'channel-health', url: '/settings/channels' },
    )
  } catch (e) {
    console.error('[seller-push] pushChannelDisconnected failed', e)
  }
}

/**
 * เตือนล่วงหน้าว่า token ของ LINE OA ใกล้หมดอายุ (FR-CH-02 / AC-CH-07)
 *
 * ยิง **หนึ่งครั้งต่อการข้ามเกณฑ์** (14/7/3/1 วัน) ไม่ใช่ทุกวัน — ผู้เรียก (`sweepLineTokenHealth`)
 * เป็นคนตัดสินว่าข้ามเกณฑ์แล้วหรือยัง ฟังก์ชันนี้แค่ส่ง
 *
 * ใช้ audience ชุดเดียวกับ `pushChannelDisconnected` (ข้ามสวิตช์ปิดแจ้งเตือนรายร้าน) เพราะเป็น
 * ข่าวสถานะระบบเหมือนกัน — คนที่ปิดเสียงข้อความลูกค้าคือคนที่ยิ่งต้องรู้ว่าอีก 3 วันจะส่งไม่ออก
 */
export async function pushLineTokenExpiring(params: {
  shopId: string
  channelName: string
  daysLeft: number
}): Promise<void> {
  try {
    const audience = await shopSystemAlertAudience(params.shopId)
    if (audience.length === 0) return
    const when = params.daysLeft <= 1 ? 'ภายในวันนี้' : `ในอีก ${params.daysLeft} วัน`
    await pushToUsers(
      audience,
      params.channelName,
      `Token ของ LINE OA นี้จะหมดอายุ${when} — แตะเพื่อเปลี่ยนเป็นแบบไม่หมดอายุก่อนส่งข้อความไม่ได้`,
      { type: 'channel-health', url: '/settings/channels' },
    )
  } catch (e) {
    console.error('[seller-push] pushLineTokenExpiring failed', e)
  }
}
