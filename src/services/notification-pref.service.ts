// notification-pref.service — "ฉันอยากรับแจ้งเตือนของร้านไหนบ้าง" (user สั่ง 2026-08-08)
//
// ขอบเขต: ตั้งค่าระดับ **(คน, ร้าน)** ไม่ใช่ระดับร้าน — พนักงานสองคนในร้านเดียวกันตั้งไม่เหมือนกันได้
// จึงเป็นของที่อยู่ในหน้า "ข้อมูลส่วนตัว" (/account) ไม่ใช่หน้าตั้งค่าร้าน
//
// 🛑 "ไม่มีแถว = เปิด" ทั้งไฟล์นี้ยึดกติกาเดียวกัน — อย่าเปลี่ยนเป็น opt-in ภายหลังโดยไม่ backfill
// ไม่งั้นทุกคนจะเงียบพร้อมกันโดยไม่มีอะไรบอก
import { prisma } from '@/lib/prisma'
import { listAccessibleShopIds } from '@/lib/shop-context'

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
 * ใช้ listAccessibleShopIds() ตัวเดียวกับที่ ChatShopAutoSwitch ใช้ (เจ้าของ + สมาชิก และกรอง
 * ร้านที่ถูกลบ/purge แล้วออก) — ไม่เขียน query สิทธิ์ขึ้นมาใหม่ให้นิยาม "ร้านของฉัน" แตกเป็นสองชุด
 *
 * เรียงตามชื่อร้านเพื่อให้ลำดับคงที่ทุกครั้งที่เปิดหน้า — ถ้าปล่อยให้ DB เลือกลำดับเอง สวิตช์จะสลับ
 * ตำแหน่งกันเองระหว่างรีเฟรช แล้วผู้ใช้อาจกดผิดร้าน
 */
export async function listShopNotificationPrefs(userId: string): Promise<ShopNotificationRow[]> {
  const shopIds = await listAccessibleShopIds(userId)
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
  const shopIds = await listAccessibleShopIds(userId)
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
