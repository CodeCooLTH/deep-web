/**
 * config.ts — อ่าน env ของ OA กลางสำหรับรายงานกลุ่ม (SRS §2.3)
 *
 * 🛑 ห้ามใช้ `LINE_CHANNEL_*` — เป็น LINE Login คนละ channel · อ่าน env ตอนเรียก (ไม่ cache ระดับ module)
 * เพื่อให้เทสสลับค่าได้ และ process ที่ตั้ง env ทีหลังไม่ค้างค่าเก่า
 */

export type ReportBotConfig = { channelSecret: string; accessToken: string; basicId: string | null }

export function getReportBotConfig(): ReportBotConfig | null {
  const channelSecret = process.env.LINE_REPORT_BOT_CHANNEL_SECRET?.trim()
  const accessToken = process.env.LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN?.trim()
  if (!channelSecret || !accessToken) return null
  return { channelSecret, accessToken, basicId: process.env.LINE_REPORT_BOT_BASIC_ID?.trim() || null }
}

/** secret ∧ token มีค่า (basicId ไม่บังคับ) — false = หน้าตั้งค่าแสดง "ฟีเจอร์ยังไม่พร้อมใช้งาน" */
export function isReportBotReady(): boolean {
  return getReportBotConfig() !== null
}

/** ลิงก์เพิ่มเพื่อน · ไม่มี basicId = null (UI ซ่อนปุ่ม) */
export function addFriendUrl(): string | null {
  const id = process.env.LINE_REPORT_BOT_BASIC_ID?.trim()
  return id ? `https://line.me/R/ti/p/${id.startsWith('@') ? id : `@${id}`}` : null
}

/** ปลายทางปุ่ม "เปิด Deep" ใน Flex — LINE ปฏิเสธ uri ที่ไม่ใช่ https ⇒ ไม่ใช่ https = null (ไม่ใส่ปุ่ม) */
export function sellerDashboardUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SELLER_URL?.trim().replace(/\/+$/, '')
  // openExternalBrowser=1: LINE ส่งลิงก์ให้ระบบเปิดแทน browser ในตัว → Android ที่ลงแอปผู้ขาย (assetlinks) เปิดเข้าแอป
  // iOS ยังเปิด Safari (AASA ยังไม่มี applinks) — user 2026-10-08 "กดแล้วเปิด app deep"
  return base && base.startsWith('https://') ? `${base}/dashboard?openExternalBrowser=1` : null
}
