/**
 * MonthThirdsBar — ยอดขายแบ่งเป็น ต้น / กลาง / ปลายเดือน (feature 00063)
 *
 * แทนแถบ 31 ช่อง (`DayStrip`) **บนมือถือเท่านั้น** — user สั่ง 2026-08-30 ให้ตัดแถบยาวออก
 * จากการ์ด แถบ 31 ช่องยังอยู่ที่ตารางเดสก์ท็อปและในชีตรายละเอียด
 *
 * ทำไมมันทดแทนกันได้: แถบ 31 ช่องมีไว้ตอบ "ขายช่วงไหนของเดือน" — อันนี้ตอบคำถามเดียวกัน
 * ด้วยหมึก 1/10 และ **บนมือถือแถบเดิมได้ช่องละ ~5px ซึ่งอ่านไม่ออกอยู่แล้ว** (วัดจริง
 * 2026-08-30: 360px ⇒ ~5.4px · 320px ⇒ ~4.3px — คอมเมนต์เดิมใน DayStrip ที่เขียนว่า ~7px สูงไป 30%)
 *
 * Base (ภาษาการออกแบบ): ./DayStrip.tsx — **ความสูงแบกความหมาย ไม่ใช่ความเข้มของสี**
 * 🛑 ห้ามกลับไปใช้ opacity ไล่ระดับแยกช่วง: DayStrip เคยทำแบบนั้นแล้ววัดได้ 1.42:1
 *    ตกเกณฑ์กราฟิก 3:1 (แก้ 2026-08-29 หลัง critique) — ที่นี่ทั้งสามท่อนจึงเป็น
 *    `bg-primary` ทึบสีเดียวกันหมด แยกกันด้วยช่องว่างและความสูง
 */
import {
  MONTH_THIRD_LABELS,
  monthThirdsAriaLabel,
  type MonthThird,
} from '@/lib/product-sales-month'

type Props = {
  thirds: MonthThird[]
  /** คำเรียกหน่วยใน aria-label (เช่น "ชิ้น") — ตัวเลขบนจอไม่มีหน่วยเพราะที่ไม่พอ */
  unitWord: string
  className?: string
}

export default function MonthThirdsBar({ thirds, unitWord, className = '' }: Props) {
  const max = Math.max(...thirds.map((t) => t.sum), 0)

  /**
   * ทั้งเดือนไม่มียอดเลย → พูดตรง ๆ ประโยคเดียว
   * 🛑 ไม่วาดแท่งศูนย์สามอันพร้อมป้าย "ต้น 0 · กลาง 0 · ปลาย 0" — สามศูนย์เรียงกันอ่านซ้ำซาก
   * และให้ข้อมูลน้อยกว่าประโยคเดียว (แถวพวกนี้โผล่ตอนเปิดสวิตช์ "รวมสินค้าที่ยังไม่ขาย")
   */
  if (max <= 0) {
    return (
      <p className={`text-default-400 text-xs ${className}`}>ไม่มียอดขายเดือนนี้</p>
    )
  }

  return (
    <span
      className={`block ${className}`}
      /* <span> เปล่าเป็น role=generic ซึ่งไม่รองรับชื่อจากผู้เขียน ⇒ aria-label จะถูกทิ้ง
         (docs/conventions/aria-name-requires-supporting-role.md) */
      role="img"
      aria-label={monthThirdsAriaLabel(thirds, unitWord)}>
      <span className="flex h-6 items-end gap-1" aria-hidden="true">
        {thirds.map((t) => (
          <span
            key={t.key}
            className={`bg-default-200 relative flex h-full flex-1 items-end overflow-hidden rounded-sm ${
              /* ช่วงที่ยังมาไม่ครบได้ขอบประ — เครื่องหมายเดียวกับที่ DayStrip ใช้กับวันอนาคต */
              t.complete ? '' : 'border-default-300 border border-dashed'
            }`}>
            <span
              className="bg-primary block w-full rounded-sm"
              style={{ height: `${Math.max(t.sum > 0 ? 12 : 0, (t.sum / max) * 100)}%` }}
            />
          </span>
        ))}
      </span>
      <span className="text-default-400 mt-1 flex gap-1 text-2xs" aria-hidden="true">
        {thirds.map((t) => (
          <span key={t.key} className="flex-1 text-center tabular-nums">
            {MONTH_THIRD_LABELS[t.key].short} {t.notStarted ? '—' : t.sum}
          </span>
        ))}
      </span>
    </span>
  )
}
