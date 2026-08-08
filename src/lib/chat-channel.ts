/**
 * chat-channel — ชนิด + "ชื่อที่ผู้ใช้เห็น" ของช่องทางแชท (Deep / Messenger / Instagram)
 *
 * ทำไมต้องแยกออกมาจาก ChannelBadge.tsx ทั้งที่นิยามเดิมอยู่ที่นั่น: ไฟล์นั้นเป็น `'use client'`
 * และ import Icon wrapper (→ `@iconify/react`) การให้ push notification ฝั่ง server
 * (seller-push.service ซึ่งถูกเรียกจาก webhook ของ Meta) import ตรง ๆ เท่ากับลาก React + icon
 * set เข้าไปใน bundle ของ route นั้นเพียงเพื่ออ่านสตริงสามคำ
 *
 * 🛑 Hard Rule 16 — คำเรียกช่องทางต้องมีนิยามเดียวทั้งระบบ: ห้ามพิมพ์ 'Messenger'/'Instagram'
 * ซ้ำที่อื่นเด็ดขาด ไม่งั้นวันหนึ่ง noti จะเรียกช่องทางอย่างหนึ่งแต่กล่องแชทเรียกอีกอย่าง แล้ว
 * ผู้ขายจะไม่รู้ว่าสองที่นั้นพูดถึงของเดียวกัน (ตัวที่เคยเกิด: ป้ายชื่อ vertical vs ชื่อแท็บ 00028)
 *
 * ส่วนที่เป็น "หน้าตา" (ไอคอน/โลโก้แบรนด์/สี) ยังอยู่ที่ CHANNEL_DISPLAY ใน ChannelBadge.tsx
 * ตามเดิม — ที่นี่รับผิดชอบเฉพาะสิ่งที่ทั้ง server และ client ใช้ร่วมกันได้จริง
 */

export type ChatChannel = 'DEEP' | 'MESSENGER' | 'INSTAGRAM'

/** ค่าอื่นนอก 3 ค่านี้ (ข้อมูลเพี้ยน/ช่องทางในอนาคต) → fallback เป็น DEEP — ห้าม crash */
export function resolveChatChannel(channel: string): ChatChannel {
  return channel === 'MESSENGER' || channel === 'INSTAGRAM' ? channel : 'DEEP'
}

/**
 * MESSENGER ยังใช้คำว่า "Messenger" เพราะเป็นชื่อ "ช่องทาง" จริงที่ใช้ในแท็บกรอง/alt — ที่เปลี่ยน
 * ไปเป็นโลโก้ Facebook ตามที่ user สั่ง 2026-07-23 คือ *ไอคอน* ไม่ใช่คำ (ดูคอมเมนต์เต็มที่
 * CHANNEL_DISPLAY ใน ChannelBadge.tsx)
 */
const CHANNEL_LABEL: Record<ChatChannel, string> = {
  DEEP: 'Deep',
  MESSENGER: 'Messenger',
  INSTAGRAM: 'Instagram',
}

export function getChannelLabel(channel: string): string {
  return CHANNEL_LABEL[resolveChatChannel(channel)]
}
