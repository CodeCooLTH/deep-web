/**
 * appointment-day-payload — แถวนัดรายวัน (service) → JSON ที่ส่งให้จอ ตามระดับสิทธิ์ของผู้ดู
 *
 * ใช้ร่วมกันระหว่าง `GET /api/shops/current/appointments/day` และ `…/appointments/carry-over` (00086 P3)
 * 🛑 สองทางออกของแถวชนิดเดียวกันต้องตัดเงิน/ห้องแชทด้วยกติกาเดียว — ถ้าคัดลอกไปเขียนซ้ำในอีก route
 * วันที่มีคนเติมกติกาฝั่งเดียว อีกฝั่งจะรั่วเงียบ ๆ (permission-gate-follows-the-row: ปิดตามแถว ไม่ใช่ตามจอ)
 *
 * - ระดับเงิน NONE (ช่าง): ไม่มีคีย์ยอด/มัดจำ (toNoMoneyAppointmentDay)
 * - ไม่มี H1: conversationId = null ("ไม่มีเธรดให้เปิด" ตาม type ฝั่งจอ)
 * - Date → ISO string ที่ boundary (ค่า null คงเป็น null)
 */
import { can, moneyLevel, type ShopRole } from '@/lib/shop-permissions'
import { toNoMoneyAppointmentDay } from '@/lib/order-view-by-level'

type DayItemDates = {
  createdAt: Date
  /** null = งานที่ยังไม่ระบุเวลา (กลุ่ม "ยังไม่ระบุเวลา" ของ carry-over · 00086 M1) — แถวรายวันมีเวลาเสมอ */
  start: Date | null
  end: Date | null
  serviceStartedAt?: Date | null
  serviceFinishedAt?: Date | null
  serviceClosedAt?: Date | null
}

const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function toAppointmentDayPayload<T extends DayItemDates & { conversationId: string | null }>(
  items: readonly T[],
  roles: readonly ShopRole[],
) {
  const noMoney = moneyLevel(roles) === 'NONE'
  const canChat = can(roles, 'H1')
  return items.map((i) => {
    const row = {
      ...i,
      createdAt: i.createdAt.toISOString(),
      start: isoOrNull(i.start),
      end: isoOrNull(i.end),
      serviceStartedAt: isoOrNull(i.serviceStartedAt),
      serviceFinishedAt: isoOrNull(i.serviceFinishedAt),
      serviceClosedAt: isoOrNull(i.serviceClosedAt),
    }
    if (noMoney) return toNoMoneyAppointmentDay(row, { canChat })
    // ไม่มี H1 = ไม่มีปุ่มทักแชท (BILLING ก็เช่นกัน) — null คือ "ไม่มีเธรดให้เปิด" ตาม type ฝั่งจอ
    return canChat ? row : { ...row, conversationId: null }
  })
}
