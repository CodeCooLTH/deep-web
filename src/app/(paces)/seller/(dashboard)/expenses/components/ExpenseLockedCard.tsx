/**
 * ExpenseLockedCard — หน้า "ดูได้เฉพาะเจ้าของร้าน" ของหน้าการเงินเต็ม (/sales /expenses /reports/products)
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/page.tsx:70-91 (no-shop card markup —
 *   .card.mx-auto.max-w-2xl.text-center + icon + CTA) — ปรับ copy/icon ตาม state
 *
 * 00071 (BR-RP-08): สิทธิ์การเงินเต็มผูกกับบทบาทเจ้าของร้านเท่านั้น ไม่มีสวิตช์ให้เปิดแล้ว
 * จึงมีสถานะเดียว ไม่มี prop `variant` (อย่าเพิ่ม prop ที่รับค่าได้ค่าเดียว)
 *
 * pure presentational — ไม่มี state/client directive (RSC-safe)
 */
import Icon from '@/components/wrappers/Icon'

export default function ExpenseLockedCard() {
  return (
    <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
      <Icon icon="lock" width={64} height={64} className="text-default-700 mx-auto mb-4" aria-hidden="true" />
      <h2 className="text-dark mb-2 text-xl font-bold">หน้านี้ดูได้เฉพาะเจ้าของร้าน</h2>
      {/* ไม่มีปุ่ม action โดยตั้งใจ — ผู้ใช้ทำอะไรเองไม่ได้ ต้องให้เจ้าของร้านเป็นคนใช้ */}
      <p className="text-default-700">
        ข้อมูลการเงินของร้านเปิดให้เจ้าของร้านเท่านั้น ถ้าต้องการตัวเลขส่วนนี้ ขอจากเจ้าของร้านได้โดยตรง
      </p>
    </div>
  )
}
