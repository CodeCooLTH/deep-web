// event_time ของ CAPI (00089) — ออเดอร์ที่ร้านตั้งวันที่ย้อนหลังต้องส่งเวลาในออเดอร์ ไม่ใช่เวลาที่กดบันทึก
// Meta: event_time ย้อนได้ ≤ 7 วัน ก่อนส่ง — เกินแล้ว "ทั้งคำขอถูกปฏิเสธ" (ไม่ใช่แค่เหตุการณ์เดียว)
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/ (ตรวจ 2026-11-18)
// เอกสารไม่ระบุเรื่องอนาคต — กันไว้เองด้วย now
export const CAPI_MAX_BACKDATE_MS = 7 * 86_400_000 - 3_600_000; // เผื่อ 1 ชม. กันคิวส่งช้า

export function clampCapiEventTime(orderCreatedAt: Date, now: Date): Date {
  const t = orderCreatedAt.getTime();
  return t > now.getTime() || now.getTime() - t > CAPI_MAX_BACKDATE_MS ? now : orderCreatedAt;
}
