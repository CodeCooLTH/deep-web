/**
 * appointment-outcome — คำพูดของ "การปิดผลนัด" ที่ทุกจอต้องใช้ร่วมกัน (ส่วนขยาย 2026-08-11)
 *
 * pure module — ห้าม import react/prisma
 *
 * 🛑 Hard Rule 16 — ตั้งแต่การ์ดคิวงานรายวันปิดผลได้จากลิสต์ การกระทำเดียวกันนี้มี **2 จอ**
 * (หน้ารายละเอียดออเดอร์ + การ์ดในชีตคิวงาน) ถ้าปล่อยให้ต่างคนต่างพิมพ์ข้อความยืนยัน/ข้อความ
 * error เอง วันหนึ่งจอหนึ่งจะบอกว่า "นัดนี้ถูกปิดผลไปแล้ว" อีกจอบอก "ลองใหม่อีกครั้ง" สำหรับ
 * error code เดียวกัน แล้วผู้ขายจะไม่รู้ว่าสองจอนั้นพูดถึงเรื่องเดียวกัน — และไม่มี gate ไหน
 * ของโปรเจกต์จับได้เลยเพราะทั้งสองสตริง "ถูก" ในตัวเอง
 */

export type AppointmentOutcome = 'COMPLETED' | 'NO_SHOW'

/**
 * แปล error code จาก `POST /api/orders/[token]/appointment/outcome` เป็นไทยที่บอกทางออก
 *
 * ห้ามโยนรหัสดิบขึ้นจอ (BR-SOV-05) · `whenText` = เวลานัดที่ format แล้ว ใช้บอกว่าปิดผลได้ตั้งแต่เมื่อไร
 *
 * 403/404 กดซ้ำก็ไม่ผ่าน การบอก "ลองใหม่" เฉย ๆ จึงส่งคนไปทำสิ่งที่ไม่มีผล — ต้องบอกให้รีเฟรชก่อน
 */
export function appointmentOutcomeErrorMessage(
  code: string | undefined,
  whenText: string,
): string {
  if (code === 'APPOINTMENT_TERMINAL') return 'นัดนี้ถูกปิดผลไปแล้ว'
  if (code === 'APPOINTMENT_NOT_STARTED') {
    // บอกเวลาที่ทำได้จริง ไม่ใช่ "ปิดผลได้เมื่อถึงเวลา" ซึ่งวนกลับไปพูดสิ่งเดิม
    return `ยังไม่ถึงเวลานัด — ปิดผลได้ตั้งแต่ ${whenText}`
  }
  return 'บันทึกผลนัดไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง'
}

/** ข้อความ toast เมื่อบันทึกสำเร็จ */
export function appointmentOutcomeSuccessMessage(outcome: AppointmentOutcome): string {
  return outcome === 'COMPLETED' ? 'บันทึกว่าให้บริการแล้ว' : 'บันทึกว่าไม่มาตามนัด'
}
