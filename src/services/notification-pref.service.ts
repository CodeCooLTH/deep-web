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
