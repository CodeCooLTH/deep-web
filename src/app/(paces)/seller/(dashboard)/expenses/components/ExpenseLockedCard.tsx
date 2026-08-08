/**
 * ExpenseLockedCard — การ์ด "ไม่มีสิทธิ์เข้าถึง" ของ /expenses
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/page.tsx:70-91 (no-shop card markup —
 *   .card.mx-auto.max-w-2xl.text-center + icon + CTA) — ปรับ copy/icon ตาม state
 *
 * [D-EXT-1 · 2026-08-07] เดิมไฟล์นี้มี 2 variant (PACKAGE_LOCKED / STAFF_NOT_ALLOWED)
 * ผ่าน prop `variant` — สถานะ "ยังไม่จ่ายค่าแพ็กเกจ" ถูกลบถาวรเมื่อเปิดฟีเจอร์ให้ฟรี
 * จึงเหลือกรณีเดียวและ prop นั้นไม่มีความหมายอีกต่อไป
 *
 * ตัดสินใจ **ลบ prop ทิ้ง ไม่ใช่คงไว้เผื่ออนาคต**: prop ที่รับค่าได้ค่าเดียวคือคำเชิญให้คนถัดไป
 * เข้าใจผิดว่ายังมีอีกสถานะซ่อนอยู่ที่ไหนสักแห่ง แล้วไปตามหาโค้ดที่ไม่มีจริง — ถ้าวันหนึ่ง
 * ต้องการสถานะที่สอง ค่อยเพิ่มพร้อมกับโค้ดที่ใช้มันจริง
 *
 * pure presentational — ไม่มี state/client directive (RSC-safe)
 */
import Icon from '@/components/wrappers/Icon'

export default function ExpenseLockedCard() {
  return (
    <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
      <Icon icon="lock" width={64} height={64} className="text-default-700 mx-auto mb-4" aria-hidden="true" />
      <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่ได้รับสิทธิ์เข้าถึงข้อมูลนี้</h2>
      {/* ไม่มีปุ่ม action โดยตั้งใจ — คนที่เห็นการ์ดนี้ทำอะไรเองไม่ได้เลย ต้องให้เจ้าของร้านเปิดให้
          การใส่ปุ่มที่กดแล้วไม่เกิดอะไรขึ้นแย่กว่าไม่มีปุ่ม */}
      <p className="text-default-700">
        เจ้าของร้านยังไม่เปิดให้พนักงานเห็นข้อมูลการเงิน ติดต่อเจ้าของร้านหากต้องการเข้าถึง
      </p>
    </div>
  )
}
