/**
 * MoneyReceivedTodayCard — "เงินที่รับวันนี้" ของร้านบริการ (feature 00050 · AC-SQ-04)
 *
 * หัวหน้าขอ *"แยกยอดมัดจำบน dashboard"* — ก่อนหน้านี้ทำไม่ได้เลยเพราะระบบไม่มีที่บันทึกว่า
 * **ได้รับเงินแล้ว** (มีแต่ `Order.depositAmount` ซึ่งเป็น *ข้อตกลง*) ตั้งแต่ตาราง `OrderPayment`
 * เข้ามา คำถามนี้จึงตอบได้ตรง ๆ เป็นครั้งแรก
 *
 * 🛑 **"เงินที่รับ" ไม่ใช่ "ยอดขาย" — และต้องบอกผู้ใช้บนจอ ไม่ใช่แค่คอมเมนต์** (Hard Rule 16)
 * ร้านที่เก็บมัดจำมีสองเลขนี้ต่างกันเสมอ: บิลเปิดวันนี้ 5,000 แต่เงินเข้าจริงอาจเป็น 1,500
 * (มัดจำ) และอีก 3,500 เข้าคนละวัน · กลับกัน เงินที่เข้าวันนี้บางส่วนอาจเป็นของบิลเมื่อสัปดาห์ก่อน
 * ถ้าไม่ติดป้ายให้ชัด ผู้ขายจะเอาเลขนี้ไปเทียบกับ `/sales` แล้วสรุปว่าระบบคำนวณผิดทั้งหน้า
 *
 * ยอดที่ถูก **ยกเลิกรายการ** ไม่ถูกนับ (ตัดที่ `computeOrderMoney`/`sumReceivedInRange` แล้ว)
 *
 * Base: ./StatisticCard.tsx (โครง `.card`/`.card-body` + หัวข้อ + CountUp + วงกลมไอคอน)
 *   ไม่ขยาย StatisticCard เองเพราะการ์ดนั้นถูกใช้ร่วม 3 ใบ การเพิ่ม slot ให้เคสเดียวจะทำให้
 *   การ์ดที่ไม่เกี่ยวต้องแบกเงื่อนไขไปด้วย
 */
import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { ORDER_PAYMENT_KIND_LABEL } from '@/lib/order-payment'

export interface MoneyReceivedTodayCardProps {
  /**
   * ยอดที่รับจริงวันนี้ แยกตามชนิด + จำนวนงานของวันนี้ที่ยังเก็บเงินไม่ครบ
   *
   * 🛑 `unpaidJobs` จำเป็นเพราะ **ยอดเงินอย่างเดียวตอบไม่ได้ว่าเก็บครบหรือยัง** —
   * "รับมา ฿5,000 วันนี้" อาจแปลว่าเก็บครบทุกงาน หรือแปลว่ายังเหลืออีก 3 งานก็ได้
   * (หัวหน้าถาม 2026-08-15: *"เหลืองเขียวโอเคแล้ว แต่อยากให้รู้ยังไง"*)
   */
  money: { deposit: number; balance: number; total: number; unpaidJobs: number }
  /**
   * จำนวนงานของวันนี้ทั้งหมด — มาจาก `getTodayAppointmentCount()` ที่หน้าแรกยิงอยู่แล้ว
   * (ไม่เพิ่ม query · undefined = อ่านไม่ได้ ให้ถือว่าไม่รู้)
   *
   * 🛑 ต้องใช้ตัวนี้ตัดสิน "มีงานวันนี้ไหม" **ห้ามใช้ยอดเงิน** — งานที่ลูกค้าจ่ายมัดจำมาตั้งแต่
   * เมื่อวานจะทำให้ `total = 0` ทั้งที่วันนี้มีงานจริงและเก็บครบแล้ว ⇒ การ์ดจะขึ้นว่า
   * "วันนี้ไม่มีงาน" ซึ่งผิดข้อเท็จจริง (คลาสเดียวกับ `0` ที่แปลว่า "ไม่รู้")
   */
  jobsToday?: number
}

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MoneyReceivedTodayCard({ money, jobsToday }: MoneyReceivedTodayCardProps) {
  const empty = money.total === 0

  return (
    <div className="card h-full">
      <div className="card-body">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h5 className="text-default-400 mb-2 text-sm font-medium">เงินที่รับวันนี้</h5>
            <h3 className="my-5 py-1.25 text-xl">
              <CountUp start={0} end={money.total} prefix="฿" duration={1} decimals={2} />
            </h3>
            {/* ป้ายช่วงเวลาแบบเดียวกับการ์ดอื่นในหน้าเดียวกัน — ตัวเดียวที่บอกว่าเลขนี้คือช่วงไหน */}
            <span className="badge bg-default-100 text-default-700 text-xs">วันนี้</span>
          </div>
          <div className="bg-success/15 text-success-ink flex size-9 shrink-0 items-center justify-center rounded-full">
            <Icon icon="cash-banknote" className="size-5.5" />
          </div>
        </div>

        {/* ── แยกมัดจำ / ยอดที่เหลือ ── สิ่งที่หัวหน้าขอมาตรง ๆ */}
        <dl className="border-default-200 mb-0 mt-4 grid grid-cols-2 gap-2 border-t border-dashed pt-3">
          <div>
            <dt className="text-default-500 text-xs">{ORDER_PAYMENT_KIND_LABEL.DEPOSIT}</dt>
            <dd className="text-default-900 mb-0 text-sm font-semibold tabular-nums">
              ฿{baht(money.deposit)}
            </dd>
          </div>
          <div>
            <dt className="text-default-500 text-xs">{ORDER_PAYMENT_KIND_LABEL.BALANCE}</dt>
            <dd className="text-default-900 mb-0 text-sm font-semibold tabular-nums">
              ฿{baht(money.balance)}
            </dd>
          </div>
        </dl>

        {/**
         * ── แถบสถานะการเก็บเงินของวันนี้ ── สิ่งที่หัวหน้าถามหา
         *
         * 🛑 **เขียว = เก็บครบจริงเท่านั้น** (Verified-Means-Green) — ห้ามเขียวตอนที่ยังมีงานค้าง
         * แม้ยอดเงินจะดูเยอะ · เหลือง = ยังมีงานให้ตามเก็บ พร้อมบอกว่ากี่งานและกดไปดูได้ที่ไหน
         *
         * 🛑 ไม่มีงานของวันนี้เลย ≠ เก็บครบแล้ว — วันที่ร้านหยุดจะขึ้นเขียว "เก็บครบ" ทั้งที่
         * ไม่มีอะไรให้เก็บ ซึ่งเป็นคำชมที่ไม่มีความหมาย จึงต้องแยกเป็นข้อความที่สาม
         */}
        <div className="mt-3">
          {money.unpaidJobs > 0 ? (
            <a
              href="/queues"
              className="bg-warning/15 text-warning-ink flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            >
              <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
              <span className="min-w-0">ยังไม่ได้เก็บเงิน {money.unpaidJobs} งานของวันนี้</span>
              <Icon icon="chevron-right" className="ms-auto shrink-0 text-base" aria-hidden="true" />
            </a>
          ) : (jobsToday ?? 0) > 0 ? (
            <p className="bg-success/15 text-success-ink mb-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
              <Icon icon="circle-check" className="shrink-0 text-base" aria-hidden="true" />
              <span className="min-w-0">เก็บเงินครบทุกงานของวันนี้แล้ว</span>
            </p>
          ) : (
            <p className="bg-default-100 text-default-700 mb-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <Icon icon="calendar-off" className="shrink-0 text-base" aria-hidden="true" />
              <span className="min-w-0">วันนี้ยังไม่มีงานที่ต้องเก็บเงิน</span>
            </p>
          )}
        </div>

        {/**
         * บรรทัดที่บอกว่าเลขนี้ต่างจาก "ยอดขาย" ยังไง — **ต้องอยู่บนจอ** (Hard Rule 16)
         * ผู้ขายที่เอาเลขนี้ไปเทียบกับ /sales แล้วไม่ตรง จะเลิกเชื่อทั้งหน้าถ้าไม่มีใครบอกก่อน
         *
         * ตอนไม่มีเงินเข้า พูดตรง ๆ ว่ายังไม่มี **ห้ามเขียนว่า "ยังไม่มียอดขาย"** — คนละเรื่องกัน
         * และร้านอาจขายได้ทั้งวันแต่ยังไม่มีใครกดยืนยันรับเงินสักใบ
         */}
        <p className="text-default-500 mb-0 mt-3 flex items-start gap-1.5 text-xs">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
          <span className="min-w-0">
            {empty
              ? 'ยังไม่มีใครกดยืนยันรับเงินวันนี้ — นับเฉพาะเงินที่เข้าจริง ไม่ใช่ยอดขายตามบิล'
              : 'นับเงินที่เข้าจริงตามวันที่รับ ไม่ใช่ยอดขายตามบิล — สองเลขนี้ต่างกันได้เสมอ'}
          </span>
        </p>
      </div>
    </div>
  )
}
