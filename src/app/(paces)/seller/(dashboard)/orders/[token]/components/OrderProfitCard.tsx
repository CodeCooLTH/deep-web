/**
 * OrderProfitCard — กำไรของออเดอร์ "ใบนี้ใบเดียว" (feature 00016 ส่วนขยาย FR-EXP-14)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card/.card-body)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (soft badge bg-{semantic}/15)
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/order-detail-shared.tsx:93-105
 *   (แผ่นไอคอน `flex size-10 shrink-0 items-center justify-center rounded-lg` — ใช้ทรงเดียวกับ
 *   ItemThumbnail ในโฟลเดอร์เดียวกัน ไม่ประดิษฐ์ทรงใหม่)
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
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
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
  if (hasMissingCost) {
    const negative = amount < 0
    return {
      icon: 'alert-triangle',
      label: negative ? 'ขาดทุนอย่างน้อย' : 'กำไรขั้นสูงโดยประมาณ',
      amount: formatBaht(amount),
      note: negative
        ? 'มีสินค้าที่ยังไม่ตั้งต้นทุน — ยอดขาดทุนจริงอาจมากกว่านี้'
        : 'มีสินค้าที่ยังไม่ตั้งต้นทุน — ตัวเลขจริงจะต่ำกว่านี้',
      tone: negative ? 'danger' : 'warning',
    }
  }

  // สถานะ ง — ขาดทุนจริง (ต้นทุนครบ)
  if (amount < 0) {
    return {
      icon: 'trending-down',
      label: 'ขาดทุนจากใบนี้',
      amount: formatBaht(amount),
      note: 'ยอดรวม − ต้นทุนสินค้า',
      tone: 'danger',
    }
  }

  // จุดคุ้มทุนพอดี — ไม่ใช่ "ผลบวกที่ยืนยันแล้ว" จึงไม่ใช้เขียว
  if (amount === 0) {
    return {
      icon: 'trending-up',
      label: 'เท่าทุนพอดี',
      amount: formatBaht(0),
      note: 'ยอดรวม − ต้นทุนสินค้า',
      tone: 'neutral',
    }
  }

  // สถานะ ก — กำไรจริง ต้นทุนครบ (กรณีเดียวที่ได้เขียว)
  return {
    icon: 'trending-up',
    label: 'กำไรจากใบนี้',
    amount: formatBaht(amount),
    note: 'ยอดรวม − ต้นทุนสินค้า',
    tone: 'success',
  }
}

export default function OrderProfitCard({ profit, orderNoun }: Props) {
  const p = present(profit, orderNoun)
  const tone = TONE[p.tone]

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone.plate}`}>
            <Icon icon={p.icon} className={`size-5 ${tone.text}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-default-700 text-xs">{p.label}</p>
            {p.amount !== null && (
              <p className={`text-lg font-bold ${tone.text}`}>{p.amount}</p>
            )}
            <p className="text-default-700 mt-0.5 text-2xs">{p.note}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
