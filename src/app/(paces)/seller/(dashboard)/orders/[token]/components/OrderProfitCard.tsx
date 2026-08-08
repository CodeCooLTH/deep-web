/**
 * OrderProfitCard — กำไรของออเดอร์ "ใบนี้ใบเดียว" (feature 00016 ส่วนขยาย FR-EXP-14)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/CodCard.tsx
 *   (card → card-header + card-title + badge ขวาหัวการ์ด → card-body + แผ่นไอคอนกลม size-10
 *   — CodCard เองยึดจาก theme/paces/…/order-details/components/CustomerDetails.tsx)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (soft badge bg-{semantic}/15)
 *
 * แผ่นไอคอนใช้ `rounded-full` ไม่ใช่ `rounded-lg` — ในโฟลเดอร์นี้ทรงกลมสงวนไว้กับไอคอน
 * **สถานะ** (CodCard/ShippingCard/CustomerDetails/AppointmentCard/OrderReviewCard) ส่วน
 * `rounded-lg` เป็นของ **รูปเนื้อหา** (ItemThumbnail) — การ์ดนี้เป็นสถานะ ไม่ใช่รูปสินค้า
 * (รอบแรกอ้าง ItemThumbnail เป็น Base ซึ่งเป็นการหยิบผิดกลุ่ม)
 *
 * ทำไมเป็นการ์ดแยกใบ ไม่ใช่แถวต่อท้าย breakdown ในการ์ดสรุปยอด (ux Design Spec S1):
 *  1. `buildBreakdown()` เป็น shared util ที่ทุกคนที่เปิดออเดอร์ได้เห็นเสมอ — ถ้าเอากำไร
 *     ไปเป็นแถวหนึ่งในนั้น ฟังก์ชันคำนวณเลขล้วน ๆ จะต้องรู้เรื่องสิทธิ์การเงินไปด้วย
 *     แล้ววันหนึ่งจะมีคนแก้ไฟล์นั้นเพื่อเรื่องอื่นโดยไม่รู้ว่ามี guard ฝังอยู่
 *  2. "ยอดรวมทั้งหมด" (เงินที่ลูกค้าจ่าย) กับ "กำไร" (เงินที่ร้านได้) หน้าตาเหมือนกันเป๊ะ
 *     — ชิดขวา ตัวหนา หน่วยบาท — ร้านที่กำลังรีบแพ็คของอ่านสลับกันได้ง่ายมากถ้าอยู่ห่างกัน
 *     แค่บรรทัดเดียวในตารางเดียวกัน กรอบคนละใบบังคับให้สายตาหยุด
 *
 * [สำคัญ] การ์ดนี้ถูก render ก็ต่อเมื่อ page ตัดสินแล้วว่ามีสิทธิ์ — ห้ามส่ง prop มาแล้วให้
 * component เลือกไม่แสดง หน้านี้อยู่ใต้ client layout ทุก prop ที่ข้ามเส้นถูก serialize
 * ลง HTML เสมอ (feedback_rsc_pii_neutralize_at_source)
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import type { OrderProfit } from '@/lib/order-profit'
import { presentOrderProfit, PROFIT_TONE } from '@/lib/order-profit-presentation'

type Props = {
  /** null = ออเดอร์ใบนี้ยังไม่นับเป็นยอดขาย (countsAsRevenue = false) */
  profit: OrderProfit | null
  /** คำเรียกออเดอร์ตาม vertical ของร้าน (ORDER_VOCAB.noun) — "คำสั่งซื้อ"/"งาน"/"การเข้าพัก" */
  orderNoun: string
}

export default function OrderProfitCard({ profit, orderNoun }: Props) {
  const p = presentOrderProfit(profit, orderNoun)
  const tone = PROFIT_TONE[p.tone]

  return (
    <div className="card">
      <div className="card-header">
        {/* หัวการ์ดคงที่ทุกสถานะ = จุดยึดสายตาตำแหน่งเดิมเสมอ (CodCard ก็ทำแบบนี้)
            ส่วนที่ผันตามสถานะอยู่ใน body ซึ่งเป็นที่ที่สายตาไปต่ออยู่แล้ว */}
        <h4 className="card-title">กำไรจากใบนี้</h4>

        {/* badge ขึ้นเฉพาะตอนมีของให้แก้จริง — "ต้นทุนครบ" คือค่าเริ่มต้นที่คาดหวังอยู่แล้ว
            ประกาศทุกครั้งจะกลายเป็น noise ที่คนเรียนรู้ที่จะข้าม (ต่างจาก CodCard ที่ badge
            ขึ้นทั้ง 2 สถานะ เพราะที่นั่นทั้งคู่คือ "งานที่ต้องทำ vs ทำแล้ว" มีน้ำหนักเท่ากัน)

            [สำคัญ] เป็น Link ไม่ใช่ span โดยตั้งใจ: คำเตือนที่กดอะไรไม่ได้คือคำเตือนที่
            สอนให้คนเลิกอ่านคำเตือน — พาไปหน้าสินค้าที่กรองเฉพาะตัวที่ยังไม่ตั้งต้นทุนไว้ให้แล้ว
            py-2 เพื่อให้พื้นที่กดสูงพอบนมือถือ (.badge ของ Paces เตี้ยกว่าเกณฑ์สัมผัสมาก) */}
        {profit?.hasMissingCost && (
          <Link
            href="/products?cost=missing"
            className="badge bg-warning/15 text-warning-ink inline-flex items-center gap-1 py-2"
          >
            <Icon icon="alert-triangle" className="size-3.5 shrink-0" aria-hidden="true" />
            ต้นทุนไม่ครบ
            <Icon icon="chevron-right" className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="card-body">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone.plate} ${tone.text}`}
          >
            <Icon icon={p.icon} className="text-xl" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-default-700 mb-0 text-xs">{p.label}</p>
            {p.amount !== null && <p className={`mb-0 text-xl font-bold ${tone.text}`}>{p.amount}</p>}
            {/* text-xs ไม่ใช่ text-2xs — DESIGN.md สงวน 11px (dense-overlay) ไว้ให้ข้อความ
                บนพื้นภาพเท่านั้น และบรรทัดนี้คือบรรทัดที่บอกว่าตัวเลขข้างบนเชื่อได้แค่ไหน
                มันจึงห้ามเป็นของที่เล็กที่สุดในการ์ด */}
            <p className="text-default-700 mt-0.5 mb-0 text-xs">{p.note}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
