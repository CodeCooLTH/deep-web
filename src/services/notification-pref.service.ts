// notification-pref.service — "ฉันอยากรับแจ้งเตือนของร้านไหนบ้าง" (user สั่ง 2026-08-08)
//
// ขอบเขต: ตั้งค่าระดับ **(คน, ร้าน)** ไม่ใช่ระดับร้าน — พนักงานสองคนในร้านเดียวกันตั้งไม่เหมือนกันได้
// จึงเป็นของที่อยู่ในหน้า "ข้อมูลส่วนตัว" (/account) ไม่ใช่หน้าตั้งค่าร้าน
//
// 🛑 "ไม่มีแถว = เปิด" ทั้งไฟล์นี้ยึดกติกาเดียวกัน — อย่าเปลี่ยนเป็น opt-in ภายหลังโดยไม่ backfill
// ไม่งั้นทุกคนจะเงียบพร้อมกันโดยไม่มีอะไรบอก
import { prisma } from '@/lib/prisma'
import { listAccessibleShopIds } from '@/lib/shop-capability'
import type { PushSound } from '@/lib/expo-push'

export interface ShopNotificationRow {
  shopId: string
  shopName: string
  logo: string | null
  kind: string
  chatEnabled: boolean
}

/**
 * รายการร้านทั้งหมดที่ผู้ใช้เข้าถึงได้ พร้อมสถานะแจ้งเตือนของแต่ละร้าน
 *
 * ใช้ listAccessibleShopIds(userId, 'H1') ตัวเดียวกับตัวกำหนดขอบเขตแชท (00071 S-13) — สวิตช์นี้คือ "แจ้งเตือน
 * ข้อความแชท" จึงโผล่เฉพาะร้านที่ผู้ใช้อ่านแชทได้จริง (H1): ผู้ถือ BILLING/ช่างเห็นสวิตช์ของร้านนั้นไม่ได้
 * (เดิมใช้ชุดสมาชิกล้วน) · กรองร้านที่ถูกลบ/purge แล้วออกเหมือนเดิม
 *
 * เรียงตามชื่อร้านเพื่อให้ลำดับคงที่ทุกครั้งที่เปิดหน้า — ถ้าปล่อยให้ DB เลือกลำดับเอง สวิตช์จะสลับ
 * ตำแหน่งกันเองระหว่างรีเฟรช แล้วผู้ใช้อาจกดผิดร้าน
 */
export async function listShopNotificationPrefs(userId: string): Promise<ShopNotificationRow[]> {
  const shopIds = await listAccessibleShopIds(userId, 'H1')
  if (shopIds.length === 0) return []

  const [shops, prefs] = await Promise.all([
    prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, shopName: true, logo: true, kind: true },
      orderBy: { shopName: 'asc' },
    }),
    prisma.shopNotificationPref.findMany({
      where: { userId, shopId: { in: shopIds } },
      select: { shopId: true, chatEnabled: true },
    }),
  ])

  const disabled = new Set(prefs.filter((p) => !p.chatEnabled).map((p) => p.shopId))
  return shops.map((s) => ({
    shopId: s.id,
    shopName: s.shopName,
    logo: s.logo,
    kind: s.kind,
    // ไม่มีแถว = เปิด (ดูหัวไฟล์) — เช็คจาก set ของ "คนที่ปิด" ไม่ใช่หาแถวแล้วอ่านค่า
    chatEnabled: !disabled.has(s.id),
  }))
}

/**
 * ตั้งค่าแจ้งเตือนของร้านหนึ่ง — คืน false เมื่อผู้ใช้ไม่มีสิทธิ์ในร้านนั้น
 *
 * 🛑 ตรวจสิทธิ์ที่นี่เสมอ ห้ามเชื่อ shopId ที่ client ส่งมา: ถ้าไม่ตรวจ ใครก็ยิง shopId ของร้านคนอื่น
 * มาสร้างแถวทิ้งไว้ได้ (ยังไม่ถึงขั้นอ่านข้อมูลใคร แต่เป็นการเขียนลงตารางโดยไม่มีสิทธิ์ และวันหลัง
 * ถ้ามีหน้าไหนอ่านค่าพวกนี้มาแสดงจะกลายเป็นรูจริง)
 *
 * upsert อาศัย @@unique([userId, shopId]) — กดสลับรัว ๆ จะทับค่าเดิม ไม่ใช่สร้างแถวซ้อน
 */
export async function setShopChatNotification(
  userId: string,
  shopId: string,
  chatEnabled: boolean,
): Promise<boolean> {
  const shopIds = await listAccessibleShopIds(userId, 'H1')
  if (!shopIds.includes(shopId)) return false

  await prisma.shopNotificationPref.upsert({
    where: { userId_shopId: { userId, shopId } },
    update: { chatEnabled },
    create: { userId, shopId, chatEnabled },
  })
  return true
}

/**
 * ผู้ใช้คนนี้ปิดแจ้งเตือนข้อความของร้านนี้อยู่ไหม (ส่วนขยาย 00025 2026-08-12 / AC-CH-31/33)
 *
 * 🛑 กติกา opt-out ห้ามกลับทิศ — **ไม่มีแถว = เปิด** และ **มีแถวแต่ `chatEnabled=true` = เปิด**
 * ตรรกะที่เช็คแค่ "มีแถวไหม" จะตีคนที่เคยปิดแล้วเปิดกลับว่ายังปิดอยู่ตลอดไป (แถวไม่ถูกลบ
 * แค่ค่าเปลี่ยน) — เป็นเหตุผลที่ฟังก์ชันนี้ต้องอ่าน "ค่า" ไม่ใช่ "การมีอยู่"
 */
export async function isShopChatMuted(userId: string, shopId: string): Promise<boolean> {
  const pref = await prisma.shopNotificationPref.findUnique({
    where: { userId_shopId: { userId, shopId } },
    select: { chatEnabled: true },
  })
  return pref ? !pref.chatEnabled : false
}

/**
 * userId ของคนที่ **ปิด** แจ้งเตือนข้อความของร้านนี้ (ส่วนขยาย 00025 2026-08-12 / AC-CH-32)
 *
 * ใช้ติดป้ายในรายชื่อสมาชิกให้เจ้าของเห็นว่าใครจะไม่ได้รับแจ้งเตือน — 🛑 เป็น **ข้อมูลสถานะ
 * ไม่ใช่คำเตือน** และเจ้าของ toggle แทนคนอื่นไม่ได้ (ค่านี้ผูกกับ userId ของเจ้าของค่าเอง)
 * จึงไม่มีปุ่มแก้ในหน้านั้นโดยตั้งใจ
 */
export async function listMutedUserIds(shopId: string): Promise<Set<string>> {
  const rows = await prisma.shopNotificationPref.findMany({
    where: { shopId, chatEnabled: false },
    select: { userId: true },
  })
  return new Set(rows.map((r) => r.userId))
}

// ── เสียงแจ้งเตือนแชทใหม่ (2026-10-09) ──────────────────────────────────────
//
// ผูกกับ "ตัวคน" (User.chatPushSound) ไม่ใช่ (คน, ร้าน) — เป็นเรื่องเสียงของโทรศัพท์คนนั้น
// ไม่ได้ขึ้นกับว่าข้อความมาจากร้านไหน · ค่าตั้งต้น "chat" = พฤติกรรมของ #133 ที่ขึ้นไปแล้ว

/** ค่าที่ผู้ใช้เลือกได้ — ตรงกับ PushSound ของ lib/expo-push */
export const CHAT_PUSH_SOUNDS = ['chat', 'default'] as const satisfies readonly PushSound[]
export type ChatPushSound = (typeof CHAT_PUSH_SOUNDS)[number]

/** ค่าจากฐาน → ค่าที่ใช้ได้ · ไม่รู้จัก/ว่าง = "chat" (ค่าตั้งต้นของคอลัมน์) */
export function toChatPushSound(value: string | null | undefined): ChatPushSound {
  return (CHAT_PUSH_SOUNDS as readonly string[]).includes(value ?? '') ? (value as ChatPushSound) : 'chat'
}

export async function getChatPushSound(userId: string): Promise<ChatPushSound> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { chatPushSound: true } })
  return toChatPushSound(u?.chatPushSound)
}

export async function setChatPushSound(userId: string, sound: ChatPushSound): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { chatPushSound: sound } })
}

/**
 * แบ่งผู้รับตามเสียงที่แต่ละคนเลือก — ใช้ตอนส่งแจ้งเตือนแชทใหม่ (ผู้รับหลายคนในร้านเดียว)
 * คืนเฉพาะกลุ่มที่มีคน · คนที่หาแถวไม่เจอ = "chat" (ค่าตั้งต้น ไม่ทำให้ใครหลุดจากการส่ง)
 */
export async function groupUsersByChatPushSound(userIds: string[]): Promise<Map<ChatPushSound, string[]>> {
  const groups = new Map<ChatPushSound, string[]>()
  if (userIds.length === 0) return groups
  const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, chatPushSound: true } })
  const byId = new Map(rows.map((r) => [r.id, toChatPushSound(r.chatPushSound)]))
  for (const id of userIds) {
    const sound = byId.get(id) ?? 'chat'
    groups.set(sound, [...(groups.get(sound) ?? []), id])
  }
  return groups
}
