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


export function getWindowState(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): {
  open: boolean
  expiresAt: Date | null
  msRemaining: number
  /** หน้าต่าง 7 วันของ HUMAN_AGENT ยังเปิดอยู่ไหม (คนตอบเองได้ แม้เกิน 24 ชม. แล้ว) */
  humanAgentOpen: boolean
  humanAgentExpiresAt: Date | null
} {
  if (!lastInboundAt) {
    return { open: false, expiresAt: null, msRemaining: 0, humanAgentOpen: false, humanAgentExpiresAt: null }
  }
  const expiresAt = new Date(lastInboundAt.getTime() + MESSAGING_WINDOW_MS)
  const msRemaining = expiresAt.getTime() - now.getTime()
  const humanAgentExpiresAt = new Date(lastInboundAt.getTime() + HUMAN_AGENT_WINDOW_MS)
  return {
    open: msRemaining > 0,
    expiresAt,
    msRemaining: Math.max(0, msRemaining),
    humanAgentOpen: humanAgentExpiresAt.getTime() > now.getTime(),
    humanAgentExpiresAt,
  }
}
