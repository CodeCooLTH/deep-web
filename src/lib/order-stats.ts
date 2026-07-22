// order-stats.ts — Pure helpers สำหรับสถิติออเดอร์ที่แสดงบนหน้าโปรไฟล์สาธารณะ (/u/[username], /b/[slug])
// ทำไม: แยกออกมาเป็น pure function เพื่อ unit-test ได้ตรง ๆ — convention เดียวกับ src/lib/order-display.ts
// (repo ไม่มี component-test infra มีแค่ vitest)
//
// S-B12 (Impeccable remediation — ส่วนขยาย Desktop layout redesign): completionRate ใช้ orderStats
// ที่ query อยู่แล้วใน page.tsx (prisma.order.groupBy by status) — ไม่ query ใหม่

/**
 * computeCompletionRate — % ออเดอร์สำเร็จเทียบกับออเดอร์ที่ "จบแล้ว" (สำเร็จ + ยกเลิก) เท่านั้น
 * ไม่รวม PENDING/SHIPPED (ยังไม่จบงาน) เพราะไม่ควรตัดสินอัตราสำเร็จจากออเดอร์ที่ยังไม่ปิด
 *
 * contract ที่ล็อกแล้ว (ใช้เหมือนกันทั้ง /u/[username] และ /b/[slug]):
 * - ตัวหาร 0 (confirmed+cancelled === 0 — ร้านใหม่ยังไม่มีออเดอร์จบ) → คืน null
 *   (ห้ามคืน 0 เพราะ UI จะแสดง "0%" ทำให้ร้านใหม่ดูแย่ทั้งที่ยังไม่มีข้อมูลจริง)
 * - ปัดเศษเป็นจำนวนเต็ม (Math.round)
 */
export function computeCompletionRate(confirmed: number, cancelled: number): number | null {
  const total = confirmed + cancelled
  if (total === 0) return null
  return Math.round((confirmed / total) * 100)
}
