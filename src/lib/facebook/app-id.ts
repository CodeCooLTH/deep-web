/**
 * app id ของแอปแชทของเรา (`FB_CHAT_APP_ID`) — ใช้แยก echo "ของเรา" ออกจาก echo ของแอปอื่น
 * ไม่ตั้ง = null: ห้ามเดาค่า (เดาผิด = ติดป้าย Meta AI ผิดห้อง) · F-2: ชื่อ env คือ FB_CHAT_APP_ID ไม่ใช่ META_APP_ID
 */
export function ourMetaAppId(): string | null {
  const id = process.env.FB_CHAT_APP_ID?.trim()
  return id ? id : null
}
