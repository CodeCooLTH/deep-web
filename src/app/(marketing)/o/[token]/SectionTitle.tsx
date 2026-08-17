import Typography from '@mui/material/Typography'

/**
 * SectionTitle — หัวข้อของแต่ละบล็อกบนหน้าออเดอร์ `/o/[token]` **ใช้ร่วมทั้ง 2 จอ**
 *
 * ## 🛑 แทน `variant='overline' color='text.disabled'` ด้วยเหตุผล 2 ข้อ
 *
 * 1. `text.disabled` = หมึกที่ opacity 0.4 → **2.30:1** บนพื้นขาว **ตก AA** (เกณฑ์ 4.5:1)
 *    เจ็บเป็นพิเศษเพราะ PRODUCT.md ผูกกลุ่มผู้ใช้ไว้กับผู้สูงวัย/digital-literacy ต่ำ
 *    บนจอที่เขาใช้ตัดสินใจว่าจะโอนเงินหรือไม่
 * 2. DESIGN.md เขียน *"eyebrow ตัวพิมพ์เล็กจิ๋วเหนือทุก section"* ไว้ใน **anti-reference ตรงตัว**
 *    และกำกับ Overline ว่า *"ใช้น้อยมาก"*
 *
 * เป็น `<h2>` จริงด้วย ไม่ใช่ `<span>` — ทั้งหน้าเดิมไม่มี heading ให้ screen reader กระโดดตามเลย
 *
 * ## ทำไมต้องเป็นไฟล์ร่วม ไม่ใช่ประกาศในแต่ละจอ
 *
 * 🛑 ตัวนี้เคยอยู่ใน `GuestOrderView.tsx` ไฟล์เดียว ⇒ จอ guest ได้การแก้ทั้งสองข้อไปตั้งแต่
 * 2026-08-11 แต่ **จอหลังล็อกอินยังเป็น overline + text.disabled อยู่ครบ 7 จุด** จนถึง
 * 2026-08-17 — ออเดอร์ใบเดียวกัน คนเดียวกัน ต่างกันแค่ล็อกอินหรือยัง กลับได้หัวข้อคนละแบบ
 * และจอที่ *ตกคอนทราสต์* คือจอที่ผู้ซื้อใช้ยืนยันรับของและเขียนรีวิวจริง (Hard Rule 16)
 *
 * ขนาด 15px/500 = ขั้น **h6/Subtitle** ของ ramp (DESIGN.md §Typography) — ไม่ใช่ค่าที่คิดเอง
 */
export default function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component='h2'
      sx={{ m: 0, mb: 2, fontSize: '0.9375rem', fontWeight: 500, color: 'text.primary', lineHeight: 1.5 }}
    >
      {children}
    </Typography>
  )
}
