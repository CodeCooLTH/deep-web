/**
 * countdown — นับถอยหลังของโค้ดผูกกลุ่ม (00068 · addendum E §3.2) · pure
 *
 * ทำไมแยกไฟล์: ใช้ทั้งแถวในรายการ (E1) และ wizard (E2) · ห้ามคำนวณ "หมดอายุ" ด้วยการเทียบสตริงเวลา
 */

/** msLeft → "mm:ss" (ปัดขึ้นเป็นวินาทีเต็มเพื่อไม่ให้โชว์ 00:00 ทั้งที่ยังเหลือเศษ) · ≤0 → "00:00" */
export function formatCountdown(msLeft: number): string {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000))
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** หมดอายุเมื่อ now ≥ expiresAt · ค่าที่อ่านไม่ออก = หมดอายุ (fail-closed: ไม่โชว์โค้ดที่ไม่รู้ว่ายังใช้ได้) */
export function isExpired(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return true
  const t = Date.parse(expiresAt)
  return Number.isNaN(t) || t <= nowMs
}
