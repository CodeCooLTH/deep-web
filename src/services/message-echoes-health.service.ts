/**
 * message-echoes-health — "เพจนี้ส่งข้อความสะท้อนกลับมาให้เราไหม" (00061 · TFR-004)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🛑 ทำไมฟีเจอร์นี้ต้องมีตัวตรวจ ทั้งที่โค้ดฝั่งรับถูกทุกบรรทัด
 *
 * ตัวสร้างออเดอร์อัตโนมัติดักข้อความที่ **ร้านพิมพ์เอง** ⇒ ถ้าร้านพิมพ์จากในแอปของ Meta
 * ข้อความจะกลับมาหาเราทาง `message_echoes` เท่านั้น — ไม่มี field นี้ = **ไม่มีอะไรเกิดขึ้นเลย
 * ไม่มี error ให้ร้านเห็น** ซึ่งตรงกับ Scenario 5 ของ BRD เป๊ะตัวอักษร
 *
 * และนี่ไม่ใช่ความเสี่ยงทางทฤษฎี: รีโปนี้เจอมาแล้ว 2 ครั้ง (`message_deliveries` ขาดตั้งแต่
 * 2026-08-05 · `message_edits` ขาดตั้งแต่ 2026-08-03) ทั้งคู่ค้นพบโดยบังเอิญหลายวันให้หลัง
 * เพราะ `subscribed_fields` ถูกล็อกไว้ตั้งแต่ตอนเชื่อมเพจครั้งแรก
 * (`docs/conventions/webhook-subscription-two-layers.md`)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { fetchSubscribedFields, subscribePageToApp } from '@/lib/facebook/graph'

export const MESSAGE_ECHOES_FIELD = 'message_echoes'

export type MessageEchoesStatus = 'GRANTED' | 'MISSING' | 'UNKNOWN'

/**
 * provider ที่แนวคิดนี้มีอยู่จริง
 *
 * 🛑 `LINE` ไม่มี `message_echoes` เลย (BR-ACO-10) — short-circuit ก่อนแตะ Graph
 * เขียนเป็น allow-list ของตัวที่ *ต้องตรวจ* ไม่ใช่ deny-list ของตัวที่ข้าม ⇒ provider ใหม่
 * ที่เพิ่มทีหลังจะถูกตรวจโดยอัตโนมัติ ไม่ใช่หลุดเงียบ
 */
const ECHO_CAPABLE_PROVIDERS = ['MESSENGER', 'INSTAGRAM'] as const

export async function checkMessageEchoesHealth(shopChannelId: string): Promise<MessageEchoesStatus> {
  const channel = await prisma.shopChannel.findUnique({
    where: { id: shopChannelId },
    select: { id: true, shopId: true, provider: true, externalId: true, accessTokenEnc: true },
  })
  if (!channel) return 'UNKNOWN'
  if (!(ECHO_CAPABLE_PROVIDERS as readonly string[]).includes(channel.provider)) return 'UNKNOWN'

  /**
   * 🛑 Instagram ไม่มี `subscribed_apps` ของตัวเอง — event ของ IG วิ่งผ่าน subscription ของ
   * **Page ที่ผูกบัญชี IG นั้น** (คอมเมนต์ของ `resubscribeShopChannels` ยืนยันเรื่องนี้ไว้แล้ว)
   * และ `ShopChannel.externalId` ของแถว IG เก็บ **IG Business Account ID ไม่ใช่ Page ID**
   * ⇒ ยิง Graph ตรงด้วย id นั้นได้ผลลัพธ์ที่ไม่มีความหมาย
   *
   * ⚠️ **ข้อจำกัดที่รู้ตัวและบันทึกไว้:** รีโปนี้ไม่มีคอลัมน์ที่ผูก IG → Page ⇒ เราสะท้อน
   * สถานะจากเพจ Messenger ของร้านเดียวกันแทน โดยใช้ **ตัวที่แย่ที่สุด** (MISSING ชนะ)
   * ร้านที่มีแต่ IG ไม่มีเพจเลย จะได้ `UNKNOWN` ซึ่ง **บล็อกการเปิดใช้งาน** (fail-closed)
   * — เลือกให้มันบล็อกพร้อมข้อความ ดีกว่าปล่อยผ่านแล้วเงียบสนิทตาม Scenario 5 ของ BRD
   */
  if (channel.provider === 'INSTAGRAM') {
    const pages = await prisma.shopChannel.findMany({
      where: { shopId: channel.shopId, provider: 'MESSENGER', status: 'ACTIVE' },
      select: { messageEchoesStatus: true },
    })
    const mirrored: MessageEchoesStatus =
      pages.length === 0
        ? 'UNKNOWN'
        : pages.some((p) => p.messageEchoesStatus === 'MISSING')
          ? 'MISSING'
          : pages.every((p) => p.messageEchoesStatus === 'GRANTED')
            ? 'GRANTED'
            : 'UNKNOWN'
    await prisma.shopChannel.update({
      where: { id: channel.id },
      data: { messageEchoesStatus: mirrored, messageEchoesCheckedAt: new Date() },
    })
    return mirrored
  }

  const fields = await readFields(channel)

  // 🛑 `null` = คุยกับ Graph ไม่ได้ ⇒ เขียน UNKNOWN **พร้อม checkedAt** ไม่ใช่ทิ้งค่าเดิมไว้
  // สองสถานะนี้ต่างกันและ UI ต้องแยกออก: "ไม่เคยตรวจเลย" (checkedAt = NULL) กับ
  // "เพิ่งลองแล้วแต่ตอบไม่ชัด" (checkedAt มีค่า + UNKNOWN)
  const status: MessageEchoesStatus =
    fields === null ? 'UNKNOWN' : fields.includes(MESSAGE_ECHOES_FIELD) ? 'GRANTED' : 'MISSING'

  await prisma.shopChannel.update({
    where: { id: channel.id },
    data: { messageEchoesStatus: status, messageEchoesCheckedAt: new Date() },
  })
  return status
}

/**
 * ปุ่ม "ซ่อมให้" — เติม field ที่ขาดกลับเข้าไป
 *
 * 🛑 `POST subscribed_fields` ของ Meta เป็น **replace ทั้งชุด ไม่ใช่ append** — ส่งไปแค่
 * `message_echoes` ตัวเดียว = เลิกรับ field อื่นทั้งหมดเงียบ ๆ (ข้อความลูกค้าจะหายทันที)
 * ⇒ ใช้ `subscribePageToApp()` ซึ่งส่ง `MESSENGER_SUBSCRIBED_FIELDS` ครบชุดจากค่าคงที่
 * ที่เดียวของระบบ **ห้ามประกอบรายชื่อ field เองที่นี่**
 *
 * แล้วตรวจซ้ำยืนยันผลจริง ไม่ใช่เชื่อว่า POST สำเร็จแปลว่าติดแล้ว
 */
export async function repairMessageEchoes(shopChannelId: string): Promise<MessageEchoesStatus> {
  const channel = await prisma.shopChannel.findUnique({
    where: { id: shopChannelId },
    select: { id: true, provider: true, externalId: true, accessTokenEnc: true },
  })
  if (!channel) return 'UNKNOWN'
  // ซ่อมได้เฉพาะที่ระดับเพจ — IG ไม่มีอะไรให้ซ่อมเป็นของตัวเอง (ดูเหตุผลใน checkMessageEchoesHealth)
  if (channel.provider !== 'MESSENGER') return checkMessageEchoesHealth(shopChannelId)
  if (!channel.accessTokenEnc || !channel.externalId) return 'UNKNOWN'

  try {
    await subscribePageToApp(channel.externalId, decryptToken(channel.accessTokenEnc))
  } catch (e) {
    console.error('[message-echoes] ซ่อมไม่สำเร็จ', e instanceof Error ? e.message : e)
    // ไม่ return ทันที — ยังต้องตรวจซ้ำเพื่อบันทึกสถานะจริง ณ ตอนนี้ลง DB
  }
  return checkMessageEchoesHealth(shopChannelId)
}

async function readFields(channel: {
  provider: string
  externalId: string | null
  accessTokenEnc: string | null
}): Promise<string[] | null> {
  if (!channel.accessTokenEnc || !channel.externalId) return null
  try {
    return await fetchSubscribedFields(channel.externalId, decryptToken(channel.accessTokenEnc))
  } catch {
    return null
  }
}
