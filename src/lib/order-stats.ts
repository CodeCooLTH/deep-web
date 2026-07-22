// order-stats.ts — Pure helpers สำหรับสถิติออเดอร์ที่แสดงบนหน้าโปรไฟล์สาธารณะ (/u/[username], /b/[slug])
// ทำไม: แยกออกมาเป็น pure function เพื่อ unit-test ได้ตรง ๆ — convention เดียวกับ src/lib/order-display.ts
// (repo ไม่มี component-test infra มีแค่ vitest)
//
// Desktop layout redesign (IG-style + trust data): completionRate ใช้ orderStats
// ที่ query อยู่แล้วใน page.tsx (prisma.order.groupBy by status) — ไม่ query ใหม่

/**
 * จำนวนออเดอร์ที่จบแล้วขั้นต่ำ ก่อนจะยอมแสดง % อัตราสำเร็จ
 *
 * ทำไมต้องมี: หน้าโปรไฟล์คือหน้าที่คนใช้ตัดสินใจว่าจะโอนเงินให้คนแปลกหน้าไหม
 * ร้านที่มีออเดอร์จบแค่ 1 รายการแล้วสำเร็จ จะได้ "100% สำเร็จ" ซึ่งอ่านเหมือน
 * สถิติที่พิสูจน์แล้ว ทั้งที่ n=1 ไม่ได้พิสูจน์อะไรเลย — มิจฉาชีพสร้างได้ใน 5 นาที
 *
 * ค่า 3 มาจาก convention ที่โค้ดเบสตั้งไว้แล้ว 2 ที่ (ไม่ได้ตั้งใหม่):
 *   - avgRating: `showRating: reviewCount >= 3` ที่ u/[username]/page.tsx
 *   - chat response rate: sample-gate >= 3 ที่ AboutOverview
 * เดิม completionRate ไม่มี gate = ขัด convention ตัวเอง (Impeccable critique P0-2)
 */
export const COMPLETION_RATE_MIN_SAMPLE = 3

/**
 * computeCompletionRate — % ออเดอร์สำเร็จเทียบกับออเดอร์ที่ "จบแล้ว" (สำเร็จ + ยกเลิก) เท่านั้น
 * ไม่รวม PENDING/SHIPPED (ยังไม่จบงาน) เพราะไม่ควรตัดสินอัตราสำเร็จจากออเดอร์ที่ยังไม่ปิด
 *
 * contract ที่ล็อกแล้ว (ใช้เหมือนกันทั้ง /u/[username] และ /b/[slug]):
 * - ออเดอร์จบ < COMPLETION_RATE_MIN_SAMPLE → คืน null (ข้อมูลยังไม่พอจะสรุป)
 *   ครอบทั้งกรณีตัวหาร 0 (ร้านใหม่) และกรณี n=1,2 ที่ % ยังไม่มีความหมาย
 *   ห้ามคืน 0 เพราะ UI จะแสดง "0%" ทำให้ร้านใหม่ดูแย่ทั้งที่ยังไม่มีข้อมูลจริง
 * - ปัดเศษเป็นจำนวนเต็ม (Math.round)
 */
export function computeCompletionRate(confirmed: number, cancelled: number): number | null {
  const total = confirmed + cancelled
  if (total < COMPLETION_RATE_MIN_SAMPLE) return null
  return Math.round((confirmed / total) * 100)
}
