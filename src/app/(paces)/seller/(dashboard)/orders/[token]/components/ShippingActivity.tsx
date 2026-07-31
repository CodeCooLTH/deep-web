/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/projects/activity/components/ExpandedActivity.tsx
 *
 * ปรับจาก Paces "Expended Activity Stream":
 * - copy layout skeleton (icon-in-dashed-circle ซ้าย + เส้น dashed แนวตั้ง, title+badge, เวลาขวา, description)
 * - DROP แถว user avatar+link ของ demo → แทนด้วย actor label ("ระบบ"/"ผู้ขาย"/"ผู้ซื้อ")
 *   เพราะ SafePay ไม่เก็บ per-event human actor (Hard Rule 6: adapt asset เข้า data จริง ไม่ปล่อย demo ค้าง)
 * - data ยัง derive จาก state machine จริงของ order SafePay (logic เดิมคงทั้งหมด — แก้เฉพาะ render layer):
 *   (PENDING → SHIPPED → CONFIRMED ; NO_SHIPPING: PENDING → CONFIRMED ; * → CANCELLED)
 * - badge สี/dot สี map ตาม state: done=success, SHIPPED active=primary(น้ำเงิน), pending=default-300, cancelled=danger
 * - แสดง shipmentTracking provider/trackingNo ถ้ามี (PHYSICAL orders) ใต้ actor; เลขพัสดุ font-mono ได้ (latin/ตัวเลข)
 * - คง: empty-state ที่ชัดเจน ถ้า status ไม่รู้จัก
 */

import { cn } from '@/utils/helpers'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { ORDER_STATUS_META } from '@/lib/order-display'

// actor ที่รับผิดชอบแต่ละ step (SafePay ไม่มี per-event user record → label ธรรมดา)
// key เปลี่ยนจาก order.status ดิบ → step แนวคิด (T14 P3) เพราะ PAYMENT ไม่ใช่ status จริงใน schema
const STEP_ACTOR: Record<string, string> = {
  PLACED: 'ระบบ',
  PAYMENT: 'ผู้ซื้อ',
  SHIPPED: 'ผู้ขาย',
  CONFIRMED: 'ผู้ซื้อ',
  CANCELLED: 'ระบบ',
}

/**
 * T14 P3 fix: เดิม STATUS_LABELS keyed ตาม order.status ดิบ (4 ค่า) แล้ว render เฉพาะ
 * "step ที่ผ่านมาแล้ว 1 step + step ถัดไป 1 step" (windowed 2 แถว) — PENDING โชว์ได้แค่ 2 แถว
 * ทั้งที่ spec §3 (ตาราง "Per-state เนื้อหา") ต้องการ 4 แถวเสมอสำหรับ order ที่มีการจัดส่ง:
 * สั่งซื้อ ● → รอผู้ซื้อชำระเงิน/ชำระเงิน ● → รอจัดส่ง/จัดส่ง ● → รอผู้ซื้อยืนยันรับของ/ยืนยันรับของ ●
 *
 * เปลี่ยนมาเป็น step แนวคิด (STEP_ORDER) ที่ไม่ผูกกับ order.status ตรง ๆ — "ชำระเงิน" เป็น step
 * แทรกระหว่าง PLACED กับ SHIPPED ที่ schema ไม่มี status แยก (derive จาก status ปัจจุบันเทียบตำแหน่ง
 * ใน STEP_ORDER แทน) ทุก step ที่ยังไม่ถึงต้องใช้ pendingTitle/pendingDesc รูป "รอ…" เท่านั้น
 * ห้ามใช้ doneTitle (อดีตกาล) กับ step ที่ isDone=false เด็ดขาด (นี่คือบั๊กเดิม — ดู StepRow ด้านล่าง)
 */
type StepKey = 'PLACED' | 'PAYMENT' | 'SHIPPED' | 'CONFIRMED'

const STEP_ORDER: StepKey[] = ['PLACED', 'PAYMENT', 'SHIPPED', 'CONFIRMED']

const STEP_DEFS: Record<StepKey, { doneTitle: string; doneDesc: string; pendingTitle: string; pendingDesc: string; icon: string }> = {
  PLACED: {
    doneTitle: 'สั่งซื้อแล้ว',
    doneDesc: 'ผู้ขายสร้างคำสั่งซื้อแล้ว',
    pendingTitle: 'สั่งซื้อแล้ว', // PLACED เป็น done เสมอ (order มีอยู่แปลว่าสั่งซื้อแล้ว) — ไม่ใช้ branch pending จริง
    pendingDesc: 'ผู้ขายสร้างคำสั่งซื้อแล้ว',
    icon: 'file-plus',
  },
  PAYMENT: {
    doneTitle: 'ชำระเงินแล้ว',
    doneDesc: 'ผู้ซื้อชำระเงินเรียบร้อย',
    pendingTitle: 'รอผู้ซื้อชำระเงิน',
    pendingDesc: 'รอผู้ซื้อยืนยันตัวตนและชำระเงิน',
    icon: 'credit-card',
  },
  SHIPPED: {
    doneTitle: 'จัดส่งแล้ว',
    doneDesc: 'ผู้ขายส่งสินค้าออกแล้ว',
    pendingTitle: 'รอจัดส่ง',
    pendingDesc: 'รอผู้ขายแจ้งเลขพัสดุและจัดส่งสินค้า',
    icon: 'truck',
  },
  CONFIRMED: {
    doneTitle: 'ผู้ซื้อยืนยันรับของ',
    doneDesc: 'ผู้ซื้อยืนยันรับสินค้า/บริการเรียบร้อย',
    pendingTitle: 'รอผู้ซื้อยืนยันรับของ',
    pendingDesc: 'รอผู้ซื้อกดยืนยันว่าได้รับสินค้า/บริการแล้ว',
    icon: 'circle-check-filled',
  },
}

// PLACED + CANCELLED — ใช้เฉพาะ branch ยกเลิก (ไม่ได้อยู่ใน step แนวคิด 4 ขั้น)
const CANCELLED_LABEL = { title: 'ยกเลิกแล้ว', description: 'คำสั่งซื้อถูกยกเลิก', icon: 'circle-x' }

/**
 * tone (จาก ORDER_STATUS_META) → class ของวงกลม dashed + icon
 * ต้องเขียน class เต็มแบบ static — Tailwind สแกน source ตรง ๆ `border-${tone}` จะไม่ถูก generate
 */
const TONE_ACCENT: Record<string, { ring: string; icon: string }> = {
  warning: { ring: 'border-warning', icon: 'text-warning' },
  info: { ring: 'border-info', icon: 'text-info' },
  success: { ring: 'border-success', icon: 'text-success' },
  danger: { ring: 'border-danger', icon: 'text-danger' },
}

export type ShippingActivityData = {
  status: string
  /** fulfillmentMode snapshot — ใช้กำหนด SHIPPED step visibility (spec §2) */
  fulfillmentMode: string
  createdAtISO: string
  /**
   * เวลาที่ออเดอร์เปลี่ยนสถานะล่าสุด — ใช้เป็นเวลาของ step ปัจจุบัน
   * เดิม step หลังจาก "สร้างออเดอร์" ไม่มีเวลาเลย (เช่น "จัดส่งแล้ว" ลอย ๆ ไม่รู้ส่งวันไหน)
   * ยังไม่ใช่ timestamp ต่อ event จริง (schema ไม่มี) — เป็นค่าที่ใกล้เคียงที่สุดที่มี
   */
  updatedAtISO: string
  shipmentTracking?: {
    provider: string
    trackingNo: string
  } | null
}

interface ShippingActivityProps {
  data: ShippingActivityData
}

const ShippingActivity = ({ data }: ShippingActivityProps) => {
  const { status, fulfillmentMode, createdAtISO, updatedAtISO, shipmentTracking } = data

  const isCancelled = status === 'CANCELLED'

  // ถ้า fulfillmentMode=NO_SHIPPING/PICKUP ไม่มี step "จัดส่ง" — ตัดออก (spec §3 ShippingActivity,
  // G-1: PICKUP ปฏิบัติเหมือน NO_SHIPPING ตามมติ user)
  const visibleSteps = fulfillmentMode === 'SHIPPED'
    ? STEP_ORDER
    : STEP_ORDER.filter((s) => s !== 'SHIPPED')

  // จำนวน step ที่ "เสร็จแล้วจริง" นับจาก STEP_ORDER เต็ม (ไม่ใช่ visibleSteps ที่ถูก filter)
  // เพื่อไม่ให้ index เพี้ยนเวลา SHIPPED ถูกตัดออกสำหรับ NO_SHIPPING/PICKUP
  const doneCount =
    status === 'CONFIRMED' ? STEP_ORDER.length : status === 'SHIPPED' ? 3 : status === 'PENDING' ? 1 : 0

  // สร้าง timeline items: ถ้า cancelled → 2 แถว (สั่งซื้อ + ยกเลิก) ตามเดิม
  // ไม่ cancelled → **ครบทุก step ที่ visible เสมอ** (T14 P3 fix — เดิมโชว์แค่ done+1 step ถัดไป)
  const timelineItems: Array<{
    key: string
    title: string
    description: string
    icon: string
    isDone: boolean
    isCurrent: boolean
    time?: string
  }> = []

  if (isCancelled) {
    // แสดง "สั่งซื้อแล้ว" เป็นจุดเริ่ม (done) แล้วตามด้วย CANCELLED
    const placed = STEP_DEFS.PLACED
    timelineItems.push({
      key: 'PLACED',
      title: placed.doneTitle,
      description: placed.doneDesc,
      icon: placed.icon,
      isDone: true,
      isCurrent: false,
      time: formatDateTime(createdAtISO),
    })
    timelineItems.push({
      key: 'CANCELLED',
      title: CANCELLED_LABEL.title,
      description: CANCELLED_LABEL.description,
      icon: CANCELLED_LABEL.icon,
      // isDone/isCurrent ไม่ใช้กับแถวนี้ — เรนเดอร์เช็ค item.key==='CANCELLED' แยกเป็นกรณีพิเศษ
      // (เหตุการณ์ "ยกเลิกแล้ว" เกิดขึ้นแล้วจริง แต่ไม่ใช่ tone success เหมือน step ที่เสร็จปกติ)
      isDone: false,
      isCurrent: false,
      // เวลายกเลิก = ครั้งสุดท้ายที่ออเดอร์ถูกแตะ
      time: formatDateTime(updatedAtISO),
    })
  } else {
    visibleSteps.forEach((stepKey) => {
      const canonicalIdx = STEP_ORDER.indexOf(stepKey)
      const def = STEP_DEFS[stepKey]
      const isDone = canonicalIdx < doneCount
      const isCurrent = canonicalIdx === doneCount // step ถัดไปทันทีหลัง done ล่าสุด

      timelineItems.push({
        key: stepKey,
        title: isDone ? def.doneTitle : def.pendingTitle,
        description: isDone ? def.doneDesc : def.pendingDesc,
        icon: def.icon,
        isDone,
        isCurrent,
        // เวลาต้องผูกกับ "เสร็จแล้วจริง" (isDone) เท่านั้น — ห้ามแปะเวลาให้ step ที่ยังไม่ถึง
        // (แม้จะเป็น step ถัดไปทันที/isCurrent ก็ตาม) เพราะจะดูเหมือนมีอะไรเกิดขึ้นไปแล้วทั้งที่ยังไม่
        // เกิด (T14 P3 แก้รอบ 2 — จุดเดิมผูกกับ isCurrent ทำให้ step ที่ยัง "รอ..." โชว์เวลาจริง)
        // step แรก (PLACED) = เวลาสร้างเสมอ; step ที่ตรงกับ order.status จริง = เวลาเปลี่ยนสถานะล่าสุด
        // step ที่เสร็จแล้วตรงกลางอื่น ๆ ยังไม่มีเวลา (schema ไม่ได้เก็บ timestamp ต่อ event)
        time: !isDone
          ? undefined
          : canonicalIdx === 0
            ? formatDateTime(createdAtISO)
            : stepKey === status
              ? formatDateTime(updatedAtISO)
              : undefined,
      })
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ประวัติคำสั่งซื้อ</h4>
      </div>
      <div className="card-body p-5 sm:p-7.5">
        {timelineItems.length === 0 ? (
          // P5 (T14): text-default-400 บนพื้นขาว = 2.46:1 ไม่ผ่าน AA → default-700 (~4.69:1)
          <p className="text-default-700 text-sm text-center py-4">ไม่มีข้อมูลสถานะ</p>
        ) : (
          <div>
            {timelineItems.map((item, idx) => {
              const isLast = idx === timelineItems.length - 1

              // ── สี/ป้ายของแต่ละ step ───────────────────────────────────────────
              // เดิม hardcode map ซ้อนขึ้นมาเองที่นี่ ทำให้สถานะเดียวกันคนละสีกับ badge ใน
              // StatusHero บนหน้าจอเดียวกัน (SHIPPED: ฟ้า vs น้ำเงิน) และ PENDING ขึ้นเขียวทั้งที่
              // ออเดอร์ยังไม่จบ (เขียว = "ยืนยันแล้ว" เท่านั้น) → ยึด ORDER_STATUS_META เป็น SSOT
              //
              // meta ของ status จริงปัจจุบัน — item.key เป็น step แนวคิด ไม่ใช่ status เสมอไป
              // (เช่น PAYMENT ไม่มีใน ORDER_STATUS_META) จึงผูก badge/accent กับ SSOT ได้เฉพาะแถวที่
              // item.key ตรงกับ status จริง ๆ (isRealStatusRow) เท่านั้น
              const meta = ORDER_STATUS_META[status]
              // แถว CANCELLED เป็นกรณีพิเศษเสมอ (ไม่ผ่าน isDone/isCurrent ปกติ) — ต้องเป็น danger
              // เท่านั้น ไม่ตกไปโซน "step อนาคต" (เคยเป็นบั๊กเงียบตอน refactor เป็น step แนวคิด)
              const isCancelledRow = item.key === 'CANCELLED'
              // T14 P3 (แก้รอบ 2): เดิมผูก badge=meta.label (เช่น "จัดส่งแล้ว") เข้ากับ "step ถัดไปที่
              // ยังไม่ถึง" (item.isCurrent) โดยตรง — พอ title แถวนั้นเป็น pendingTitle ("รอผู้ซื้อยืนยัน
              // รับของ") จะกลายเป็นขัดกันเองแบบเดียวกับบั๊กเดิมที่กำลังแก้ (title บอก "รอ" แต่ badge
              // บอกอดีตกาล) → badge/accent ที่ผูกกับ SSOT ต้องใช้เฉพาะแถวที่ "เสร็จแล้วจริง" และ
              // item.key ตรงกับ order.status ตรง ๆ เท่านั้น (isRealStatusRow) — แถวที่ยังไม่ถึง
              // (ไม่ว่าจะเป็น step ถัดไปทันทีหรือไกลกว่านั้น) ใช้ badge "รอ" เป็นกลางเสมอ ไม่มีทาง
              // ไปอ้างป้ายของสถานะจริงที่ยังไม่เกิดขึ้น — item.isCurrent เหลือหน้าที่แค่ไฮไลต์ ring สี
              // (บอก "นี่คือ step ที่กำลังจะเกิดต่อไป" โดยไม่ยืนยันข้อความใด ๆ)
              const isRealStatusRow = !isCancelledRow && item.isDone && item.key === status
              const isFuture = !isCancelledRow && !item.isDone

              const accent = isCancelledRow
                ? TONE_ACCENT.danger
                : isFuture
                  ? item.isCurrent
                    ? TONE_ACCENT[meta?.tone ?? 'warning'] // step ถัดไปทันที — ไฮไลต์ ring เฉย ๆ ไม่แตะ badge
                    : { ring: 'border-default-300', icon: 'text-default-300' } // ไกลกว่านั้น — เทาจาง
                  : isRealStatusRow
                    ? TONE_ACCENT[meta?.tone ?? 'success']
                    : TONE_ACCENT.success

              // badge: แถวที่ "เสร็จแล้ว + ตรงกับ status จริง" ใช้ label/สีชุดเดียวกับ StatusHero
              // เป๊ะ ๆ (คงที่ — title แถวนี้ก็เป็น doneTitle อดีตกาลเหมือนกัน ไม่ขัดกัน)
              // แถวที่เสร็จแล้วแถวอื่นบอกแค่ "เสร็จแล้ว" · แถวที่ยังไม่ถึง (ทุกกรณี) บอกแค่ "รอ"
              const badge = isCancelledRow
                ? { label: ORDER_STATUS_META.CANCELLED.label, className: ORDER_STATUS_META.CANCELLED.cls }
                : isFuture
                  ? { label: 'รอ', className: 'bg-default-100 text-default-800' }
                  : isRealStatusRow && meta
                    ? { label: meta.label, className: meta.cls }
                    : { label: 'เสร็จแล้ว', className: 'bg-success/15 text-success-ink' }

              // actor: แสดงเฉพาะ step ที่เกิดขึ้นแล้วจริง (isDone) — รวมแถว isRealStatusRow ด้วย
              // (ต่างจากเดิมที่กันแถว "current" ออก — ตอนนี้ isCurrent ไม่ใช่แถว done อีกแล้ว)
              const actor = isCancelledRow
                ? STEP_ACTOR.CANCELLED
                : item.isDone
                  ? STEP_ACTOR[item.key]
                  : null

              return (
                <div className="flex gap-x-base" key={item.key}>
                  {/* คอลัมน์ซ้าย: icon-in-dashed-circle + เส้น dashed แนวตั้ง (ซ่อนที่ step สุดท้าย) */}
                  <div
                    className={cn(
                      'after:border-default-300 relative after:absolute after:start-1/2 after:top-7 after:bottom-0 after:w-px after:border-e -ms-px after:border-dashed shrink-0',
                      isLast ? 'after:hidden' : ''
                    )}
                  >
                    <div className="relative z-10 flex items-center justify-center">
                      <div className={cn('flex size-7.5 items-center justify-center rounded-full border border-dashed', accent.ring)}>
                        <Icon icon={item.icon} className={cn('text-lg', accent.icon)} />
                      </div>
                    </div>
                  </div>

                  {/* คอลัมน์ขวา: title+badge / เวลา / description / actor — min-w-0 ให้ข้อความไทยพันบรรทัดได้ */}
                  <div className={cn('flex-1 min-w-0', isLast ? '' : 'pb-5')}>
                    {/* T12 (browser QA fix, S-3 mockup): เดิม flex justify-between วาง [title+badge] กับ
                        [เวลา] บรรทัดเดียวกัน — คอลัมน์ขวาแคบ (~363px ที่ lg:col-span-1) บีบทุกอย่างจน
                        title/badge/เวลาตัด 3-4 บรรทัด ตอนนี้ stack เป็นดีฟอลต์ (title+badge บรรทัดบน,
                        เวลาบรรทัดล่าง) แล้วค่อยกลับมาเป็นแถวเดียวที่ sm (ตอน<1024 การ์ดนี้ยังกว้างเต็ม
                        คอลัมน์เดียว มีที่พอ) ก่อนบีบกลับเป็น stack อีกครั้งที่ lg (จุดที่ grid หัก 25%
                        ให้คอลัมน์นี้แคบลงจริง — ตรงกับที่ QA วัดได้) */}
                    <div className="mb-1.25 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 lg:flex-col lg:items-start lg:gap-1">
                      {/* title ต้องไม่ใช่ heading จริง (h5) — theme ต้นทาง (ExpandedActivity.tsx) ซ้อน
                          badge <span> ไว้ใน <h5> ทำให้เกิด heading ปลอมซ้ำหลายอันต่อหน้า + screen-reader
                          outline พัง (S-3). ใช้ <p> + badge เป็น sibling แทน — WCAG AA เป็น non-negotiable
                          ใน PRODUCT.md จึงจงใจไม่ copy จุดนี้ตรง ๆ จาก theme (Hard Rule 6 อนุญาตให้ adapt
                          เมื่อ theme เองผิด)
                          ขนาด/สีที่ใช้มาจาก design spec 2026-07-31-seller-order-detail-v5-design.md §4
                          (`text-md font-medium text-default-800`) — ไม่ใช่ "เหมือน h5 เดิม": h5 ของ Paces
                          ไม่ได้ set font-size ใน _reboot.css จึง inherit token --text-body + --color-body-color
                          ของเดิม การเปลี่ยนมาเป็น --text-md/--color-default-800 จึงเป็นการเปลี่ยนตาม spec
                          โดยตั้งใจ ไม่ใช่ของที่บังเอิญเท่ากัน */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        {/* P5 (T14): default-400 บนพื้นขาว = 2.46:1 ไม่ผ่าน AA → step อนาคต default-700
                            (~4.69:1) / step เสร็จแล้ว-ปัจจุบัน default-800 (~11.5:1) ยัง maintain hierarchy
                            (อนาคตจางกว่า) แต่ผ่านทั้งคู่ */}
                        <p className={cn('text-md font-medium', isFuture ? 'text-default-700' : 'text-default-800')}>
                          {item.title}
                        </p>
                        <span className={cn('badge badge-label whitespace-nowrap shrink-0', badge.className)}>{badge.label}</span>
                      </div>
                      {(item.time || isFuture) && (
                        <span className="text-xs whitespace-nowrap shrink-0 text-default-700">
                          {item.time ?? 'รอดำเนินการ'}
                        </span>
                      )}
                    </div>
                    {/* break-words ให้ข้อความไทยยาวพันบรรทัดได้ในคอลัมน์แคบ */}
                    {/* P5 (T14): text-default-400 บน body text (description) = 2.46:1 ไม่ผ่าน AA
                        → text-default-700 (~4.69:1) เสมอ — border-default-300/after:border-default-300
                        (เส้น divider, decorative) ไม่แตะ (Hard Rule: ห้ามแตะ 300/400 ที่เป็นเส้น/ไอคอน) */}
                    <p className="mb-1.25 text-sm break-words text-default-700">
                      {item.description}
                    </p>
                    {actor && <span className="text-default-700 text-xs">{actor}</span>}
                    {/* shipment tracking info สำหรับ SHIPPED step */}
                    {item.key === 'SHIPPED' && shipmentTracking && (
                      <p className="text-default-700 text-xs mt-0.5">
                        {shipmentTracking.provider} · เลขพัสดุ:{' '}
                        {/* T11 fix: ของเดิมใช้ font-mono จริง (ไม่ใช่แค่ comment) — ผิด design spec §4
                            "ห้าม font-mono กับเลขพัสดุ" (Anuphan ไม่มี mono → fallback Courier หลุดธีม,
                            feedback_font_mono_breaks_anuphan) ใช้ tabular-nums + tracking-wide แทน
                            เหมือน OrderFactsCard.tsx */}
                        <span className="tabular-nums tracking-wide">{shipmentTracking.trackingNo}</span>
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShippingActivity
