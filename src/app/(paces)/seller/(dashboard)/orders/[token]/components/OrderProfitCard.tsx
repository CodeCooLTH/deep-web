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
import { formatBaht, GROSS_PROFIT_FORMULA } from '@/lib/format-money'
import type { OrderProfit } from '@/lib/order-profit'

type Props = {
  /** null = ออเดอร์ใบนี้ยังไม่นับเป็นยอดขาย (countsAsRevenue = false) */
  profit: OrderProfit | null
  /** คำเรียกออเดอร์ตาม vertical ของร้าน (ORDER_VOCAB.noun) — "คำสั่งซื้อ"/"งาน"/"การเข้าพัก" */
  orderNoun: string
}

type Presentation = {
  icon: string
  label: string
  amount: string | null
  note: string
  tone: 'success' | 'danger' | 'warning' | 'neutral'
}

const TONE: Record<Presentation['tone'], { plate: string; text: string }> = {
  success: { plate: 'bg-success/15', text: 'text-success-ink' },
  danger: { plate: 'bg-danger/15', text: 'text-danger-ink' },
  warning: { plate: 'bg-warning/15', text: 'text-warning-ink' },
  neutral: { plate: 'bg-default-100', text: 'text-default-800' },
}

function present(profit: OrderProfit | null, orderNoun: string): Presentation {
  // สถานะ ค — ยังไม่นับเป็นยอดขาย: ไม่แสดงตัวเลขเลย ไม่ใช่แสดง 0
  // (ตัวเลขที่คำนวณตอนนี้อาจกลายเป็นเท็จถ้าออเดอร์ถูกยกเลิกทีหลัง)
  if (profit === null) {
    return {
      icon: 'clock',
      label: 'ยังไม่นับเป็นยอดขาย',
      amount: null,
      note: `กำไรจะคำนวณเมื่อลูกค้ายืนยันรับ${orderNoun}แล้ว`,
      tone: 'neutral',
    }
  }

  const { amount, hasMissingCost } = profit

  // สถานะ ข — ต้นทุนไม่ครบ: ตัวเลขที่ได้คือ "เพดานบน" ไม่ใช่กำไรจริง
  //
  // ห้ามใช้เขียวแม้ตัวเลขจะเป็นบวก — Verified-Means-Green: เขียวแปลว่า "ยืนยันแล้ว"
  // ตัวเลขที่คำนวณจากต้นทุนไม่ครบยังไม่มีสิทธิ์ใช้สีนั้น
  //
  // แยก 2 ทิศทางเพราะความแน่นอนต่างกันจริง: ถ้าเพดานบนยังติดลบอยู่ แปลว่าต่อให้ต้นทุน
  // ที่ยังไม่กรอกเป็นศูนย์ก็ยังขาดทุนแน่นอน = ข่าวร้ายที่ยืนยันแล้ว (danger)
  // ส่วนเพดานบนที่เป็นบวกยังบอกทิศทางไม่ได้เลย (warning)
  //
  // หมายเหตุคำ: วลี "มีสินค้าที่ยังไม่ตั้งต้นทุน" ย้ายไปเป็น badge ที่หัวการ์ดแล้ว
  // (ซึ่งกดไปแก้ได้จริง) บรรทัดนี้จึงเหลือแต่ผลของมันต่อตัวเลข ไม่พูดซ้ำสองที่
  if (hasMissingCost) {
    const negative = amount < 0
    return {
      icon: 'alert-triangle',
      label: negative ? 'ขาดทุนขั้นต้นอย่างน้อย' : 'กำไรขั้นต้นไม่เกิน',
      amount: formatBaht(amount),
      note: negative
        ? 'ยอดขาดทุนจริงอาจมากกว่านี้ · ยังไม่หักค่าใช้จ่ายร้าน'
        : 'กำไรจริงจะน้อยกว่านี้ · ยังไม่หักค่าใช้จ่ายร้าน',
      tone: negative ? 'danger' : 'warning',
    }
  }

  // สถานะ ง — ขาดทุนจริง (ต้นทุนครบ)
  if (amount < 0) {
    return {
      icon: 'trending-down',
      label: 'ขาดทุนขั้นต้นจากใบนี้',
      amount: formatBaht(amount),
      note: GROSS_PROFIT_FORMULA,
      tone: 'danger',
    }
  }

  // จุดคุ้มทุนพอดี — ไม่ใช่ "ผลบวกที่ยืนยันแล้ว" จึงไม่ใช้เขียว
  // และลูกศรขึ้นกับค่า 0 เป็นสัญญาณที่ขัดตัวเลขของมันเอง
  if (amount === 0) {
    return {
      icon: 'minus',
      label: 'เท่าทุนพอดี',
      amount: formatBaht(0),
      note: GROSS_PROFIT_FORMULA,
      tone: 'neutral',
    }
  }

  // สถานะ ก — กำไรจริง ต้นทุนครบ (กรณีเดียวที่ได้เขียว)
  return {
    icon: 'trending-up',
    label: 'กำไรขั้นต้นจากใบนี้',
    amount: formatBaht(amount),
    note: GROSS_PROFIT_FORMULA,
    tone: 'success',
  }
}

export default function OrderProfitCard({ profit, orderNoun }: Props) {
  const p = present(profit, orderNoun)
  const tone = TONE[p.tone]

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
