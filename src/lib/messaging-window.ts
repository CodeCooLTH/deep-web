// หน้าต่างตอบกลับมาตรฐานของ Meta — นับจากข้อความล่าสุด "ของลูกค้า"
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * HUMAN_AGENT tag — Meta ให้ "คนจริง" ตอบด้วยมือนอกหน้าต่าง 24 ชม. ได้ถึง 7 วัน
 * (Messaging Policy: human agent tag "manually respond to user messages within a 7-day period")
 * ครอบทั้ง Messenger และ Instagram
 *
 * สำคัญ: ใช้ได้เฉพาะข้อความที่ "คนพิมพ์เอง" เท่านั้น — ห้าม auto-reply/AI ยิงผ่าน tag นี้ และห้าม
 * เนื้อหาโปรโมชัน (ผิดนโยบาย เสี่ยงโดนระงับแอป) จึง gate ที่ service ไม่ใช่แค่ซ่อนปุ่มใน UI
 */
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * กรอบจากโฆษณา Click-to-Messenger/Click-to-Direct: ถ้าข้อความแรกของลูกค้าเกิดหลังคลิกโฆษณา
 * Meta ให้ standard window ยาวได้ถึง 7 วันนับจากข้อความนั้น (ข้อความอัตโนมัติ/โปรโมชันส่งได้ ไม่ต้องติด tag)
 * https://developers.facebook.com/docs/messenger-platform/policy/policy-overview
 *
 * หัก 1 ชม. เผื่อคิวส่ง/นาฬิกาเหลื่อม — ไม่งั้นข้อความที่เข้าคิวตอนใกล้หมดจะโดน Meta ปฏิเสธ
 * (user report 2026-11-16: ระบบคิด 24 ชม. ทั้งที่โฆษณาให้ 7 วัน → auto-notify โดน WINDOW_CLOSED 22 ใบ/30 วัน)
 */
export const AD_WINDOW_MS = HUMAN_AGENT_WINDOW_MS - 60 * 60 * 1000

/**
 * @param adWindowStartAt เวลาข้อความลูกค้าแรกหลังคลิกโฆษณา (จาก ad-window.service) — ไม่ส่ง = 24 ชม. เหมือนเดิม
 */
export function getWindowState(
  lastInboundAt: Date | null,
  now: Date = new Date(),
  adWindowStartAt?: Date | null,
): {
  open: boolean
  expiresAt: Date | null
  msRemaining: number
  /** กรอบที่เปิดอยู่มาจากโฆษณา (24 ชม. มาตรฐานหมดแล้วแต่กรอบโฆษณายังเปิด) */
  viaAd: boolean
  /** หน้าต่าง 7 วันของ HUMAN_AGENT ยังเปิดอยู่ไหม (คนตอบเองได้ แม้เกิน 24 ชม. แล้ว) */
  humanAgentOpen: boolean
  humanAgentExpiresAt: Date | null
} {
  if (!lastInboundAt) {
    return { open: false, expiresAt: null, msRemaining: 0, viaAd: false, humanAgentOpen: false, humanAgentExpiresAt: null }
  }
  const stdExpiresMs = lastInboundAt.getTime() + MESSAGING_WINDOW_MS
  const adExpiresMs = adWindowStartAt ? adWindowStartAt.getTime() + AD_WINDOW_MS : -Infinity
  const expiresAt = new Date(Math.max(stdExpiresMs, adExpiresMs))
  const msRemaining = expiresAt.getTime() - now.getTime()
  const humanAgentExpiresAt = new Date(lastInboundAt.getTime() + HUMAN_AGENT_WINDOW_MS)
  return {
    open: msRemaining > 0,
    expiresAt,
    msRemaining: Math.max(0, msRemaining),
    viaAd: msRemaining > 0 && stdExpiresMs <= now.getTime(),
    humanAgentOpen: humanAgentExpiresAt.getTime() > now.getTime(),
    humanAgentExpiresAt,
  }
}
