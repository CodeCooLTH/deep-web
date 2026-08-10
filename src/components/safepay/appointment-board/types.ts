/**
 * appointment-board — ทรงข้อมูลที่ทั้ง 3 จอของระบบนัดหมายใช้ร่วมกัน
 *
 * pure module (type-only + helper ที่ไม่แตะ DOM) — import ได้ทั้ง server และ client
 *
 * ทรงนี้คือสิ่งที่ `GET /api/shops/current/appointments` คืน (API.md §4.5) — ห้ามให้ไฟล์ที่
 * consume มัน (ชีตเลือกวัน / ปฏิทิน /queues / บอร์ดมือถือ) ประกาศ type ของตัวเองซ้ำอีก
 * เพราะเคยเป็นแบบนั้นแล้วเพี้ยนจริง: `AppointmentDateSheet` ไม่เคยประกาศ `resource` ทั้งที่
 * endpoint ส่งมาให้ตั้งแต่แรก จึงเอาชื่อคิวมาแสดงไม่ได้เลยจนถึง 2026-08-10
 */

/** 1 นัด = 1 แถว ตามที่ endpoint คืน */
export type AppointmentBoardItem = {
  orderToken: string
  orderNo: string | null
  /** ISO string — format ด้วย src/lib/format-date.ts เท่านั้น (พ.ศ.) */
  start: string
  end: string
  appointmentStatus: string | null
  buyerName: string | null
  /** null = นัดที่คิวงานถูกถอดออกภายหลัง · undefined = ผู้เรียกไม่ได้ขอ field นี้ */
  resource?: { id: string; name: string; capacity?: number } | null
}

/**
 * "YYYY-MM-DD" ตามเวลาเครื่อง — ตรงกับที่ AppointmentBlock เก็บค่าในฟอร์ม
 *
 * ห้ามใช้ `toISOString().slice(0,10)` ซึ่งเป็น UTC: ผู้ขายในไทยที่เปิดจอตอน 6 โมงเช้า
 * จะได้คีย์ของ "เมื่อวาน" แล้วจิ้มวันหนึ่งไปเห็นรายการของอีกวัน
 */
export function localDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
