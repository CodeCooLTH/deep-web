/**
 * ReturnTrackingNote — ป้ายท้ายแถว 2 ที่ตอบว่า "แล้วเลขพัสดุขากลับอยู่ไหน"
 *
 * 🛑 เคสตีกลับ **ไม่มีเลขใหม่** ขนส่งใช้เลขเดิมพาของกลับมา ⇒ ถ้าไม่มีป้ายนี้ ร้านจะนึกว่า
 * ระบบลืมออกเลขให้ · ป้ายเดิมเขียนว่า `เลขเดิม` เฉย ๆ ซึ่งอ่านได้ว่า "เลขอันเก่า
 * (แปลว่ามีอันใหม่)" — ตรงข้ามกับสิ่งที่ตั้งใจจะบอก (impeccable clarify 2026-08-25)
 *
 * 🛑 อยู่เป็น component กลางเพราะ **3 จอวาดแถว 2 เคสตีกลับเหมือนกัน** (การ์ด hover ·
 * หน้ารายละเอียด · stepper ในแชท) แต่รอบแรกป้ายนี้มีแค่จอเดียว ⇒ คำถามเดียวกันไม่ถูกตอบ
 * บนจอที่ร้านเปิดบ่อยที่สุด (`docs/conventions/sibling-surface-parity.md`)
 */
export default function ReturnTrackingNote() {
  return (
    <p className="text-default-500 text-2xs mt-2 mb-0 flex justify-end">
      <span
        className="bg-default-200 text-default-700 rounded-full px-1.5 py-px font-semibold"
        title="พัสดุขากลับใช้เลขพัสดุเดิม ขนส่งไม่ได้ออกเลขใหม่"
      >
        ขากลับใช้เลขเดิม
      </span>
    </p>
  )
}
