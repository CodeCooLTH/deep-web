// ทะเบียน provider ของช่องทางแชทภายนอก (feature 00020 Phase 2)
//
// จุดเดียวที่แมป Conversation.channel / ShopChannel.provider (String ไม่ใช่ enum) → พฤติกรรม
// ของช่องทางนั้น. เพิ่มช่องทางใหม่ = เพิ่มไฟล์ provider + 1 บรรทัดที่นี่ ไม่ต้องแก้ service
//
// TikTok จะเสียบที่นี่ใน Phase 3 หลังปิด OQ-TTC-02 (payload การส่งข้อความ) และ OQ-TTC-03
// (วิธี verify ลายเซ็น webhook) — ยังไม่ใส่ descriptor ไว้ล่วงหน้าเพราะ capability ที่ไม่มี
// implementation จริงจะทำให้ service เชื่อว่าส่งได้แล้วทั้งที่ยังส่งไม่ได้

import { MESSENGER_PROVIDER, INSTAGRAM_PROVIDER } from './meta'
import type { ChannelProvider } from './types'

export type { ChannelCapabilities, ChannelProvider, OutboundTarget, WindowState } from './types'
export { resolveWindowState } from './types'

const REGISTRY: Record<string, ChannelProvider> = {
  MESSENGER: MESSENGER_PROVIDER,
  INSTAGRAM: INSTAGRAM_PROVIDER,
}

/**
 * หา provider จากค่า channel — คืน `null` เมื่อไม่ใช่ช่องทางภายนอกที่รองรับ
 * (รวมถึง 'DEEP' = แชทในแอป ซึ่งไม่มี provider เพราะไม่ได้คุยกับต้นทางภายนอกเลย)
 *
 * caller **ต้องเช็ค null เสมอ** — ค่าใน DB เป็น String อิสระ แถวเก่า/แถวที่เขียนจากช่องทางที่
 * ถูกถอดออกไปแล้วอาจมีค่าที่ registry ไม่รู้จัก
 */
export function getChannelProvider(channel: string | null | undefined): ChannelProvider | null {
  if (!channel) return null
  return REGISTRY[channel] ?? null
}

/** รายชื่อช่องทางภายนอกที่ระบบรองรับ ณ ปัจจุบัน — ใช้ตรวจ/แสดงตัวกรองในอินบ็อกซ์ได้ */
export function listSupportedChannels(): string[] {
  return Object.keys(REGISTRY)
}
