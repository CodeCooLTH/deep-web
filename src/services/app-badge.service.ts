/**
 * app-badge.service.ts — เลขบนไอคอนแอปผู้ขาย (deep-seller-app) แบบ Messenger (user สั่ง 2026-11-11)
 *
 * นิยาม (user เลือก "แชทอย่างเดียว · ทุกร้านที่เปิดแจ้งเตือน"):
 *   จำนวน "ห้องแชทที่ยังไม่อ่าน" รวมทุกร้านที่ผู้ใช้อ่านแชทได้ (H1) และ **ไม่ได้ปิดแจ้งเตือนแชทของร้านนั้น**
 *   ไม่รวมสแปม · ร้านตอบไปแล้ว = อ่านแล้ว — เกณฑ์เดียวกับเลขบนแท็บ "ข้อความ" เป๊ะ (countUnreadConversations)
 *   สูงสุด 99
 *
 * ทำไมรวมทุกร้าน ไม่ยึดร้านที่เปิดอยู่ (ต่างจากแท็บ "ข้อความ" ที่ยึด resolveChatScope):
 *   แจ้งเตือนเด้งเข้ามาจากทุกร้านที่เปิดไว้ ⇒ ไอคอนต้องตอบว่า "ทั้งเครื่องมีกี่ห้องรออยู่" ไม่ใช่เฉพาะร้านที่เลือกค้างไว้ในเว็บ
 * ทำไมหักร้านที่ปิดแจ้งเตือน: ร้านนั้นไม่ส่งแจ้งเตือนมาที่มือถือ (shopAudience) ⇒ เลขขึ้นเองโดยไม่มีแจ้งเตือน = ดูเหมือนบั๊ก
 *
 * ผู้ใช้ 2 ทาง — ต้องได้เลขชุดเดียวกันเสมอ (ฟังก์ชันนี้ที่เดียว):
 *   1) แนบไปกับแจ้งเตือนแชทใหม่ (seller-push.service · pushNewChatMessage)
 *   2) แอปดึงไปตั้งเองตอนเปิดแอป/อ่านแชท (GET /api/seller/app-badge)
 */
import { prisma } from '@/lib/prisma'
import { listAccessibleShopIds } from '@/lib/shop-capability'
import { countUnreadConversations } from '@/services/chat.service'

/** เพดานเลขบนไอคอน — เท่าแท็บ "ข้อความ" ที่แสดง 99+ (ตัวนับหยุดที่ 100 อยู่แล้ว) */
export const APP_BADGE_MAX = 99

/** ร้านที่นับเข้าเลขบนไอคอนของผู้ใช้คนนี้ = อ่านแชทได้ (H1) − ปิดแจ้งเตือนแชทไว้ */
export async function appBadgeShopIds(userId: string): Promise<string[]> {
  const [shopIds, optedOut] = await Promise.all([
    listAccessibleShopIds(userId, 'H1'),
    // กติกาเดียวกับ shopAudience: ไม่มีแถว = เปิด ⇒ ถามเฉพาะคนที่ปิด
    prisma.shopNotificationPref.findMany({ where: { userId, chatEnabled: false }, select: { shopId: true } }),
  ])
  const off = new Set(optedOut.map((p) => p.shopId))
  return shopIds.filter((id) => !off.has(id))
}

/** เลขบนไอคอนของผู้ใช้หนึ่งคน (0–99) — throw ได้ (ผู้เรียกตัดสินเองว่าล้มแล้วทำอะไร) */
export async function appBadgeCount(userId: string): Promise<number> {
  const shopIds = await appBadgeShopIds(userId)
  if (shopIds.length === 0) return 0
  return Math.min(APP_BADGE_MAX, await countUnreadConversations(shopIds))
}

/**
 * เลขของผู้รับหลายคนพร้อมกัน (สำหรับแนบไปกับแจ้งเตือน) — ไม่ throw
 * คนที่นับไม่สำเร็จ = ไม่อยู่ใน map ⇒ แจ้งเตือนของเขาไม่แตะเลขเดิม (ดีกว่าส่ง 0 แล้วเลขหายทั้งที่ยังมีค้าง)
 */
export async function appBadgeCounts(userIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      try {
        out.set(id, await appBadgeCount(id))
      } catch (e) {
        console.error('[app-badge] count failed', e instanceof Error ? e.name : 'unknown')
      }
    }),
  )
  return out
}
