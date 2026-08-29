/**
 * DayStrip — แถบสรุปยอดขายรายวันของสินค้าหนึ่งตัว (feature 00062)
 *
 * 🛑 **จงใจไม่ใช้ ApexChart** ทั้งที่ Hard Rule 10 บังคับให้ chart ทุกตัวผ่าน wrapper —
 * เพราะสิ่งนี้ไม่ใช่ chart: ไม่มีแกน ไม่มีสเกล ไม่มี tooltip ของตัวเอง ไม่มี legend
 * มันคือ **แถวของช่องสี่เหลี่ยม 1 ช่องต่อ 1 วัน** ที่เรนเดอร์ด้วย `div` ล้วน
 *
 * เหตุผลที่ต้องเป็นแบบนี้ ไม่ใช่แค่ความชอบ:
 *   `src/components/wrappers/ApexChart.tsx:46-56` ยิง `window.dispatchEvent(new Event('resize'))`
 *   สองครั้งต่อการ mount หนึ่งครั้ง และ ApexCharts ทุกตัวบนหน้าติด listener ของ window ไว้
 *   ⇒ N กราฟบนหน้าเดียว = O(N²) การวาดใหม่พร้อมกันตอนเปิดหน้า ตารางนี้มี 20 แถว/หน้า
 *   (และรายการมือถือ lazy-load ได้มากกว่านั้น) โค้ดที่ยิง resize **ห้ามถอด** — มันแก้บั๊ก
 *   กราฟเรนเดอร์กลับหัวบน iOS ที่ผู้ใช้เจอจริง (`docs/conventions/paces-charts-source.md`)
 *
 * ที่สำคัญกว่าเรื่องความเร็ว: แถบนี้ตอบคำถาม **"ขายวันไหน"** ซึ่งเป็นคำถามของรายงานนี้ตรง ๆ
 * (นับช่องได้ว่าวันที่เท่าไร) ส่วน sparkline ตอบ "รูปร่างของแนวโน้ม" ซึ่งเป็นคำถามคนละข้อ
 *
 * ความเข้มเทียบกับ **วันที่ดีที่สุดของสินค้าตัวเอง** ไม่ใช่เทียบข้ามสินค้า — ถ้า normalize
 * ข้ามสินค้า ตัวที่ขายน้อยจะกลายเป็นแถบเทาทั้งแถบ แล้วมองไม่ออกเลยว่าขายวันไหน
 */
import { dayIntensity } from '@/lib/product-sales-month'

/**
 * คลาสของแต่ละระดับความเข้ม — ประกอบจาก primitive ของ Paces ทั้งหมด (HR7)
 * ไม่มีค่า arbitrary และไม่มี hex ดิบ
 */
const LEVEL_CLASS = [
  'bg-default-200', // 0 — ไม่มียอด
  'bg-primary/25',
  'bg-primary/45',
  'bg-primary/70',
  'bg-primary', // 4 — วันที่ขายดีที่สุดของสินค้าตัวนี้
] as const

/** วันที่ยังมาไม่ถึง — จางกว่า "ไม่มียอด" เพื่อให้แยกออกจากกันได้ด้วยตา */
const FUTURE_CLASS = 'bg-default-100'

type Props = {
  /** ยอดรายวันแบบเต็ม ความยาว = จำนวนวันจริงของเดือนนั้น */
  values: readonly number[]
  /** ดัชนีวันแรกที่ยังมาไม่ถึง (0-based) — null = เดือนนี้จบไปแล้ว ไม่มีวันอนาคต */
  futureFrom: number | null
  /** หน่วยที่กำลังแสดง ใช้ประกอบคำอธิบายให้ screen reader */
  unitLabel: string
  /** ชื่อเดือนภาษาไทยสำหรับคำอธิบาย */
  monthLabel: string
  className?: string
}

export default function DayStrip({ values, futureFrom, unitLabel, monthLabel, className }: Props) {
  const max = values.reduce((m, v) => (v > m ? v : m), 0)
  const activeDays = values.filter((v) => v > 0).length

  /**
   * 🛑 `role="img"` + `aria-label` — `<div>` เปล่าไม่รองรับ "ชื่อจากผู้เขียน" screen reader
   * ที่ทำตามสเปกจะทิ้ง label ทิ้งทั้งก้อน (docs/conventions/aria-name-requires-supporting-role.md)
   */
  const summary =
    activeDays === 0
      ? `ไม่มียอดขายใน${monthLabel}`
      : `มียอดขาย ${activeDays} วันใน${monthLabel} · สูงสุด ${max} ${unitLabel} ในหนึ่งวัน`

  return (
    <div
      role="img"
      aria-label={summary}
      title={summary}
      // grid-flow-col + auto-cols-fr = ทุกช่องกว้างเท่ากันและยืดเต็มพื้นที่ โดยไม่ต้องรู้จำนวนวัน
      // ล่วงหน้า (ก.พ. 28 ช่อง ธ.ค. 31 ช่อง ใช้คลาสชุดเดียวกัน)
      className={`grid grid-flow-col auto-cols-fr gap-px ${className ?? ''}`}>
      {values.map((v, i) => {
        const isFuture = futureFrom !== null && i >= futureFrom
        const cls = isFuture ? FUTURE_CLASS : LEVEL_CLASS[dayIntensity(v, max)]
        return <span key={i} aria-hidden="true" className={`h-4 rounded-sm ${cls}`} />
      })}
    </div>
  )
}
