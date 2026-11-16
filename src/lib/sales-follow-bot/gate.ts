// 00095 TFR-FB-08 — ด่านร้านนำร่อง fail-closed
// อ่าน env ทุกครั้งที่เรียก (ไม่ cache ระดับ module) เพื่อให้เทส/ปรับค่าแล้วมีผลทันทีที่โค้ดเห็น env ใหม่
// ว่าง/ไม่ตั้ง = ปิดทั้งระบบ · `*` = ทุกร้าน (ต้องตั้งโดยเจตนา)

export const SALES_FOLLOW_BOT_ENV = 'SALES_FOLLOW_BOT_SHOP_IDS'

export function isSalesFollowBotEnabled(shopId: string | null | undefined): boolean {
  const raw = process.env[SALES_FOLLOW_BOT_ENV]
  if (!raw || !shopId) return false
  const ids = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  // UUID ไม่สนตัวพิมพ์ — เทียบแบบ lower กันตั้ง env ตัวใหญ่แล้วปิดเงียบ
  return ids.includes('*') || ids.includes(shopId.trim().toLowerCase())
}
