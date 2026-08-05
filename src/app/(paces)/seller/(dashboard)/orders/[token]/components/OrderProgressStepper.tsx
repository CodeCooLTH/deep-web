/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx → Steps()
 *
 * copy ตรง ๆ จากธีม: โครง `<ul className="flex w-full items-center justify-between">` +
 * `<li className="flex w-full items-center">` (ตัวสุดท้าย `flex items-center` ไม่มีเส้น) +
 * วงกลม `size-9 shrink-0 rounded-full flex items-center justify-center` + เส้น `h-0.5 flex-1`
 * โครงนี้รองรับ 2-4 ขั้นได้เองด้วย flex — ไม่ต้อง map เป็น `grid-cols-${n}` ซึ่ง Tailwind
 * สแกน source ตรง ๆ ไม่เห็น (ปัญหาที่เวอร์ชันก่อนต้องมีตาราง GRID_COLS ไว้แก้)
 *
 * adapt เพิ่มจากธีม (ธีมไม่มีสิ่งเหล่านี้เลย — มันเป็น progress indicator ล้วน):
 *   - ไอคอนแทนตัวเลข 1/2/3 ในวงกลม
 *   - ป้ายชื่อขั้น + วันที่ใต้แถบ
 *   - เส้นเชื่อมเปลี่ยนสีตาม state (ธีมมีสีเดียว) — เขียว=ผ่านแล้ว เทา=ยังไม่ถึง แดง=นำไปสู่ยกเลิก
 *   - เลย์เอาต์มือถือ (ธีมมีแบบเดียว) — สรุปเหลือ 2 บรรทัด
 *
 * ที่มาของหน้าตา: user ปฏิเสธ 2 เวอร์ชันก่อน (กล่องขอบประเรียงกริด / จุดกลม+เส้นประ) แล้วเลือกจาก
 * mockup `docs/superpowers/specs/2026-08-05-order-progress-mockup-A-full.html`
 * สองข้อที่ user สั่งเองและห้ามย้อน: (1) ตัดกล่องข้อความใต้แถบทิ้ง (2) มือถือให้เห็นแค่สถานะปัจจุบัน
 * กับเวลาล่าสุด ไม่ใช่ลิสต์ครบทุกขั้น
 *
 * ลำดับขั้น/label/สถานะ derive ที่ src/lib/order-progress.ts (SSOT) — ไฟล์นี้เป็น render layer ล้วน
 */

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import {
  getOrderProgress,
  type ProgressState,
  type ProgressStep,
  type ProgressStepKey,
} from '@/lib/order-progress'
import { formatDateTime, formatDateTimeTH } from '@/lib/format-date'

const STATE_DOT: Record<ProgressState, string> = {
  done: 'bg-success',
  current: 'bg-primary ring-4 ring-primary/15',
  upcoming: 'bg-default-100',
  cancelled: 'bg-danger ring-4 ring-danger/15',
}

const STATE_ICON: Record<ProgressState, string> = {
  /**
   * ไอคอนขาวบนพื้น success วัดได้ 2.42:1 — ตก WCAG 1.4.11 ที่บังคับ ≥3:1 สำหรับ
   * graphical object แก้ด้วยการเปลี่ยน "หมึก" ของไอคอนเป็น success-ink (3.18:1 ผ่าน)
   * พื้นเขียวสดยังเป็นสีเดิมทุกพิกเซลตามที่ user อนุมัติ — ปรับความเข้ม ไม่สลับเฉด
   * (docs/conventions/contrast-fix-keeps-hue.md)
   */
  done: 'text-success-ink',
  current: 'text-white', // บนพื้น primary วัดได้ 5.12:1 ผ่าน
  // ขั้นที่ยังไม่เกิด = decorative เหมือน disabled ไม่อยู่ใต้เกณฑ์คอนทราสต์ข้อความ
  upcoming: 'text-default-400',
  cancelled: 'text-white', // บนพื้น danger วัดได้ 3.17:1 ผ่านเกณฑ์ไอคอน
}

const isSpotlight = (s: ProgressState) => s === 'current' || s === 'cancelled'

/** สีเส้นระหว่างจุด i กับ i+1 — อ่านความคืบหน้าได้จากเส้นโดยไม่ต้องนับวงกลม */
const lineClass = (from: ProgressStep, to: ProgressStep) =>
  to.state === 'cancelled' ? 'bg-danger' : from.state === 'done' ? 'bg-success' : 'bg-default-300'

const StepDot = ({ step }: { step: ProgressStep }) => (
  <span
    className={cn(
      'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full',
      STATE_DOT[step.state],
    )}
  >
    {/* ขั้นที่เกิดขึ้นแล้ว/จบแล้วใช้ check/x เสมอ ไม่ใช่ไอคอนประจำขั้น (coin/truck) —
        ไอคอนประจำขั้นมีความหมายตอน "กำลังรอสิ่งนี้" ไม่ใช่ตอนที่มันผ่านไปแล้ว
        ใช้ check/x เปล่าเพราะวงกลมห่อให้อยู่แล้ว circle-check จะกลายเป็นวงกลมซ้อนวงกลม */}
    <Icon
      icon={step.state === 'done' ? 'check' : step.state === 'cancelled' ? 'x' : step.icon}
      className={cn('text-base', STATE_ICON[step.state])}
      aria-hidden="true"
    />
  </span>
)

const StepTrack = ({ steps }: { steps: ProgressStep[] }) => (
  <ol className="flex w-full items-center justify-between">
    {steps.map((step, i) => {
      const isLast = i === steps.length - 1
      return (
        <li className={cn('flex items-center', !isLast && 'w-full')} key={step.key}>
          <StepDot step={step} />
          {!isLast && <span className={cn('mx-1 h-0.5 flex-1', lineClass(step, steps[i + 1]))} />}
        </li>
      )
    })}
  </ol>
)

export type OrderProgressStepperProps = {
  status: string
  fulfillmentMode: string
  paymentMethod: string | null
  slipFileId: string | null
  totalAmount: number
  carrierStatus: string | null
  createdAtISO: string
  updatedAtISO: string
  /** เวลาที่เปิดพัสดุ/แจ้งเลขพัสดุ — วันที่จริงของขั้น "จัดส่งแล้ว" */
  shippedAtISO: string | null
  /** Order.codReceivedAt หรือเวลาที่ขนส่งส่งถึง — วันที่จริงของขั้น "เก็บเงินปลายทาง" */
  codMoneyAtISO: string | null
}

const OrderProgressStepper = (props: OrderProgressStepperProps) => {
  const steps = getOrderProgress({
    status: props.status,
    fulfillmentMode: props.fulfillmentMode,
    paymentMethod: props.paymentMethod,
    slipFileId: props.slipFileId,
    totalAmount: props.totalAmount,
    carrierStatus: props.carrierStatus,
    createdAtLabel: formatDateTime(props.createdAtISO),
    updatedAtLabel: formatDateTime(props.updatedAtISO),
  })

  if (steps.length === 0) return null

  /**
   * วันที่จริงต่อขั้น — key ที่ไม่มีในนี้คือขั้นที่ระบบ **ไม่มีข้อมูลจริง** จะขึ้น "—" ไม่ใช่เดาให้
   * โดยเฉพาะขั้นชำระเงินของการโอน: ฐานข้อมูลไม่มี `paidAt` เลย การเอา updatedAt มาแปะทุกช่อง
   * จะได้เวลาเดียวกันหมดซึ่งเป็นเท็จ
   * ใช้ formatDateTimeTH ("04 ส.ค. 2569 19:58") ไม่ใช่ formatDateTime ("2569-08-04 19:58:23")
   * เพราะช่องใต้จุดกว้างราว 1/4 ของการ์ด แบบยาวจะตัดบรรทัดจนอ่านไม่ออก
   */
  const dateByKey: Partial<Record<ProgressStepKey, string>> = {
    PLACED: formatDateTimeTH(props.createdAtISO),
    ...(props.shippedAtISO ? { SHIPPED: formatDateTimeTH(props.shippedAtISO) } : {}),
    ...(props.codMoneyAtISO ? { COD_MONEY: formatDateTimeTH(props.codMoneyAtISO) } : {}),
    ...(props.status === 'CONFIRMED' ? { CONFIRMED: formatDateTimeTH(props.updatedAtISO) } : {}),
    ...(props.status === 'CANCELLED' ? { CANCELLED: formatDateTimeTH(props.updatedAtISO) } : {}),
  }

  // บรรทัดรอง: ขั้นที่เกิดแล้ว → วันที่จริง · ขั้นที่กำลังรอ → ข้อความสถานะจาก SSOT · ยังไม่ถึง → "—"
  const secondaryOf = (step: ProgressStep): string | undefined => {
    if (step.state === 'done' || step.state === 'cancelled') return dateByKey[step.key] ?? step.note
    if (step.state === 'current') return step.note
    return undefined
  }

  /**
   * คำเตือน "ขนส่งเก็บเงินให้แล้ว · รอโอนเข้าร้านตามรอบของขนส่ง" ถูกแทนที่ด้วยวันที่บนหน้าจอ
   * ตามที่ user สั่งให้ตัดกล่องข้อความออก — เก็บไว้เป็น tooltip เพื่อไม่ให้ข้อความที่กันร้าน
   * เข้าใจผิดว่าเงินเข้าบัญชีแล้ว หายไปจากระบบทั้งหมด
   */
  const tooltipOf = (step: ProgressStep): string | undefined =>
    step.key === 'COD_MONEY' && step.state === 'done' && dateByKey.COD_MONEY ? step.note : undefined

  // จุดที่ควรเพ่งบนมือถือ: ขั้นที่กำลังรอ/ยกเลิก — ถ้าไม่มีแล้ว (ทุกขั้นเสร็จ) ใช้ขั้นสุดท้าย
  const spotlightStep = steps.find((s) => isSpotlight(s.state)) ?? steps[steps.length - 1]
  const spotlightIndex = steps.indexOf(spotlightStep)
  const isComplete = spotlightStep.state === 'done' && spotlightIndex === steps.length - 1
  // เหตุการณ์ล่าสุดที่มีเวลาจริง — ขั้นที่กำลังรออยู่ยังไม่เกิดจึงไม่มีเวลาของตัวเอง
  // สิ่งที่ตอบได้จริงคือ "ครั้งสุดท้ายที่ออเดอร์นี้ขยับคือเมื่อไหร่"
  const lastEvent = [...steps].reverse().find((s) => s.state === 'done' || s.state === 'cancelled')
  const lastEventDate = lastEvent ? secondaryOf(lastEvent) : undefined

  return (
    <div className="card">
      <div className="card-body">
        {/* ═══ ≥768px: แถบ + ป้ายและวันที่ใต้ทุกจุด ═══ */}
        <div className="hidden md:block">
          <StepTrack steps={steps} />
          <div className="mt-2.5 flex w-full items-start justify-between gap-1">
            {steps.map((step, i) => {
              const isFirst = i === 0
              const isLast = i === steps.length - 1
              const isDate = step.state === 'done' || step.state === 'cancelled'
              const secondary = secondaryOf(step)

              return (
                <div
                  className={cn(
                    'min-w-0 flex-1',
                    // หัวท้ายชิดขอบ ไม่งั้นป้ายของจุดริมล้นออกนอกการ์ด
                    isFirst ? 'text-left' : isLast ? 'text-right' : 'text-center',
                  )}
                  key={step.key}
                >
                  <p
                    className={
                      isSpotlight(step.state)
                        ? 'text-default-900 text-xs font-bold'
                        : 'text-default-700 text-2xs font-medium'
                    }
                  >
                    {step.label}
                  </p>
                  <span
                    className={cn(
                      'mt-0.5 block text-2xs',
                      // วันที่ห้ามตัดบรรทัด ส่วนข้อความสถานะยอมให้พันบรรทัดได้
                      isDate ? 'whitespace-nowrap' : 'break-words',
                      step.state === 'current' && 'text-primary-ink font-semibold',
                      step.state === 'cancelled' && 'text-danger-ink font-semibold',
                      (step.state === 'done' || step.state === 'upcoming') && 'text-default-700',
                    )}
                    title={tooltipOf(step)}
                  >
                    {secondary ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══ <768px: แถบเดียวกัน แต่สรุปเหลือ 2 บรรทัด (user สั่งเอง — ห้ามกลับไปเป็นลิสต์ทุกขั้น) ═══ */}
        <div className="md:hidden">
          <StepTrack steps={steps} />
          <div className="mt-3.5">
            <div className="flex items-baseline gap-2">
              <p className="text-default-900 text-md font-bold">{spotlightStep.label}</p>
              {spotlightStep.state === 'current' && (
                <span className="bg-default-100 text-default-700 ms-auto shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-semibold whitespace-nowrap">
                  ขั้นที่ {spotlightIndex + 1} จาก {steps.length}
                </span>
              )}
              {isComplete && (
                <span className="bg-success/15 text-success-ink ms-auto shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-semibold whitespace-nowrap">
                  เสร็จสมบูรณ์
                </span>
              )}
            </div>
            {lastEvent && lastEventDate && (
              <p className="text-default-700 mt-1 text-2xs">
                ล่าสุด: {lastEvent.label} · {lastEventDate}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderProgressStepper
