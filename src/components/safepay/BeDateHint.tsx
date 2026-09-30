/**
 * BeDateHint — บรรทัดกำกับ พ.ศ. ใต้ช่องวันที่ของเบราว์เซอร์ (`<input type="date|datetime-local">`)
 *
 * ช่องวันที่ของเบราว์เซอร์แสดงปีตามเครื่อง (ส่วนใหญ่ ค.ศ.) — เว็บคุมไม่ได้ ⇒ ใต้ช่องเขียนค่าที่เลือก
 * เป็น พ.ศ. ผ่านตัวกลางเสมอ ให้ตรงกับวันที่ที่ผู้ใช้เห็นในรายการ/ตาราง
 * (แพตเทิร์นเดิมจาก ExpenseFormModal — ยกเป็นตัวเดียวเมื่อ 2026-10-01: "วันที่เราใช้ พ.ศ. แปลงให้ครบ")
 *
 * ค่าว่าง/ผิดรูป → ไม่ render (ช่อง error ของฟอร์มเป็นคนบอกเอง)
 */
import { formatDate, formatTimeHM } from '@/lib/format-date'

type Props = {
  /** ค่าของ input ตรง ๆ — "YYYY-MM-DD" หรือ "YYYY-MM-DDTHH:mm" */
  value?: string | null
  withTime?: boolean
  /** ผูกกับ `aria-describedby` ของ input — screen reader อ่านค่าเป็น พ.ศ. ตามที่ตาเห็น */
  id?: string
}

export default function BeDateHint({ value, withTime = false, id }: Props) {
  if (!value) return null
  // วัน-เดือน-ปี พ.ศ. ตัวเลข ("02-09-2569") — รูปเดียวกับช่องปฏิทิน DateRangeControl และตาราง
  // (เดิมเป็น "02 ก.ย. 2569" ทำให้วันที่เดียวกันมีสองหน้าตาบนจอเดียว — review HR8 2026-10-01)
  const date = formatDate(value)
  if (date === '—') return null
  const text = withTime ? `${date} ${formatTimeHM(value)}` : date
  return (
    // text-xs เท่าข้อความช่วยอื่นใต้ช่องกรอก · ผู้เรียกต้องผูก id นี้เข้า aria-describedby ของ input
    <p id={id} className="text-default-700 mt-1 mb-0 text-xs">
      {text}
    </p>
  )
}
