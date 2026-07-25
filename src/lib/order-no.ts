import { orderPeriodTH } from './format-date'

/**
 * เลขคำสั่งซื้อที่อ่านง่าย (user 2026-07-25) — `DP` + ปีพ.ศ. + เดือน + โค้ด 8 หลักของ publicToken
 *
 * ตัวอย่าง: publicToken `51043fb1-…` สร้างเดือน ก.ค. 2569 → `DP25690751043FB1`
 *
 * ทำไม deterministic (จาก publicToken + createdAt) ไม่ใช่ running counter:
 *   - โค้ด 8 หลักท้าย = `publicToken.slice(0,8)` (เดียวกับที่ระบบโชว์เป็น `#โค้ด` อยู่แล้ว) — สุ่มในตัว
 *   - ไม่มีตัวนับ → ไม่มี race condition, ไม่ต้อง reset รายเดือน, ไม่มีต้นทุน scale (ไม่ query/lock อะไร)
 *   - key จริงของออเดอร์ยังเป็น publicToken (globally unique) — orderNo เป็นป้ายอ่านง่าย + ค้นหาได้
 *     (index ธรรมดา ไม่ unique: โค้ด 8 หลักซ้ำได้ทางทฤษฎีที่ปริมาณมหาศาล แต่ไม่ใช่ identity)
 *
 * ปี/เดือนคิดใน timezone ไทย (orderPeriodTH) เสมอ — เลขไม่เพี้ยนข้ามเดือนเพราะ server เป็น UTC
 */
export function formatOrderNo(
  publicToken: string,
  createdAt: Date | string | number | null | undefined,
): string {
  const period = orderPeriodTH(createdAt)
  const code = publicToken.slice(0, 8).toUpperCase()
  return `DP${period}${code}`
}
