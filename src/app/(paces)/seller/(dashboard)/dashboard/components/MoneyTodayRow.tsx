/**
 * MoneyTodayRow — "เงินที่รับจริงวันนี้" ของร้านบริการ (feature 00050 · AC-SQ-04)
 *
 * ## 🛑 ทำไมเป็น "แถวในการ์ดยอดขาย" ไม่ใช่การ์ดของตัวเอง
 *
 * รอบแรกผมทำเป็น `MoneyReceivedTodayCard` วางเพิ่มใต้การ์ดยอดขาย — หัวหน้าทักทันทีที่เห็น
 * (2026-08-19): *"ทำไมมันไปเพิ่ม section นี้ เราคุยกันว่าให้ทำใน chart นิ"*
 *
 * โจทย์เดิมของเขาเขียนว่า *"ยอด**อยากให้มันเป็น**ยอดเงินของแต่ละวัน**แทน** มีมัดจำ"* —
 * คำว่า **"แทน"** คือเปลี่ยนของเดิม ผมอ่านเป็น "เพิ่ม" จึงทำผิดตั้งแต่ตีความโจทย์
 *
 * เหตุผลที่ลึกกว่าเรื่องตำแหน่ง: การ์ดแยกทำให้หน้าแรกมี **เลขเงินสองก้อนติดกันที่ไม่เท่ากัน** —
 * ยอดขายตามบิล (225,800) กับเงินที่เข้าจริง (฿0) — โดยไม่มีอะไรอธิบายว่าทำไมต่าง
 * ผู้ขายอ่านแล้วสรุปว่าระบบคำนวณผิด ซึ่งเสียหายกว่าไม่มีตัวเลขที่สองเลย
 * (`docs/conventions/domain-term-single-definition.md` — ศัพท์เงินต้องมีนิยามเดียวและอธิบายบนจอ)
 *
 * อยู่ในการ์ดเดียวกันแล้ว บริบทมาเอง: "ยอดขายเท่านี้ · เข้าจริงแล้วเท่านี้ · ยังไม่เก็บกี่งาน"
 * อ่านเป็นประโยคเดียวจากบนลงล่าง
 */
import Icon from '@/components/wrappers/Icon'
import { ORDER_PAYMENT_KIND_LABEL } from '@/lib/order-payment'

export interface MoneyTodayRowProps {
  /**
   * ยอดที่รับจริงวันนี้ แยกตามชนิด + จำนวนงานของวันนี้ที่ยังเก็บเงินไม่ครบ
   *
   * 🛑 `unpaidJobs` จำเป็นเพราะ **ยอดเงินอย่างเดียวตอบไม่ได้ว่าเก็บครบหรือยัง** —
   * "รับมา ฿5,000 วันนี้" อาจแปลว่าเก็บครบทุกงาน หรือยังเหลืออีก 3 งานก็ได้
   * (หัวหน้าถาม 2026-08-15: *"เหลืองเขียวโอเคแล้ว แต่อยากให้รู้ยังไง"*)
   */
  money: { deposit: number; balance: number; total: number; unpaidJobs: number }
  /**
   * จำนวนงานของวันนี้ทั้งหมด — มาจากตัวนับที่หน้าแรกยิงอยู่แล้ว (ไม่เพิ่ม query)
   *
   * 🛑 ต้องใช้ตัวนี้ตัดสิน "มีงานวันนี้ไหม" **ห้ามใช้ยอดเงิน** — งานที่ลูกค้าจ่ายมัดจำมาตั้งแต่
   * เมื่อวานจะทำให้ `total = 0` ทั้งที่วันนี้มีงานจริงและเก็บครบแล้ว ⇒ จะขึ้นว่า "วันนี้ไม่มีงาน"
   * ซึ่งผิดข้อเท็จจริง (คลาสเดียวกับ `0` ที่แปลว่า "ไม่รู้")
   */
  jobsToday?: number
}

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MoneyTodayRow({ money, jobsToday }: MoneyTodayRowProps) {
  const empty = money.total === 0

  return (
    <div>
      {/* ── บรรทัดหลัก: รับจริงวันนี้ · มัดจำ · ยอดที่เหลือ ──
          ทรงเดียวกับแถว legend ของกราฟที่อยู่เหนือขึ้นไป (flex-wrap + gap-x-4 + text-xs)
          เพื่อให้อ่านต่อกันเป็นชุดเดียว ไม่ใช่บล็อกแปลกปลอมที่หล่นมาอยู่ท้ายการ์ด */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-700">
        <span className="inline-flex items-center gap-1.5">
          <Icon icon="cash-banknote" className="size-3.5 shrink-0 text-default-500" aria-hidden="true" />
          รับจริงวันนี้{' '}
          <b className="text-default-900 font-semibold tabular-nums">฿{baht(money.total)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {ORDER_PAYMENT_KIND_LABEL.DEPOSIT}{' '}
          <b className="text-default-800 font-semibold tabular-nums">฿{baht(money.deposit)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {ORDER_PAYMENT_KIND_LABEL.BALANCE}{' '}
          <b className="text-default-800 font-semibold tabular-nums">฿{baht(money.balance)}</b>
        </span>
      </div>

      {/**
       * ── แถบสถานะการเก็บเงินของวันนี้ ── สิ่งที่หัวหน้าถามหา ("เหลืองเขียวโอเคแล้ว")
       *
       * 🛑 **เขียว = เก็บครบจริงเท่านั้น** (Verified-Means-Green) — ห้ามเขียวตอนที่ยังมีงานค้าง
       * แม้ยอดเงินจะดูเยอะ · เหลือง = ยังมีงานให้ตามเก็บ พร้อมบอกว่ากี่งานและกดไปดูได้ที่ไหน
       *
       * 🛑 ไม่มีงานของวันนี้เลย ≠ เก็บครบแล้ว — วันที่ร้านหยุดจะขึ้นเขียว "เก็บครบ" ทั้งที่
       * ไม่มีอะไรให้เก็บ ซึ่งเป็นคำชมที่ไม่มีความหมาย จึงต้องแยกเป็นข้อความที่สาม
       */}
      <div className="mt-2.5">
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
       *
       * ยิ่งจำเป็นกว่าเดิมตั้งแต่ย้ายมาอยู่การ์ดเดียวกับยอดขาย: ตอนเป็นการ์ดแยกยังพอเดาได้ว่า
       * คนละเรื่อง แต่พออยู่ใต้เลข 225,800 ในกรอบเดียวกัน ผู้ขายจะอ่านว่า "ทำไมสองเลขไม่ตรงกัน"
       * ทันที — ประโยคนี้คือคำตอบที่ต้องมาถึงพร้อมคำถาม
       */}
      <p className="text-default-500 mb-0 mt-2 flex items-start gap-1.5 text-xs">
        <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
        <span className="min-w-0">
          {empty
            ? 'ยังไม่มีใครกดยืนยันรับเงินวันนี้ — นับเฉพาะเงินที่เข้าจริง ไม่ใช่ยอดขายตามบิล'
            : 'นับเงินที่เข้าจริงตามวันที่รับ ไม่ใช่ยอดขายตามบิล — สองเลขนี้ต่างกันได้เสมอ'}
        </span>
      </p>
    </div>
  )
}
