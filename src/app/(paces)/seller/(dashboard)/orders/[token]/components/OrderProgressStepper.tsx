/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/timeline/page.tsx ("Timeline with Icons")
 *
 * ปรับจาก Paces Timeline: ยกกลไก **จุดวงกลม + เส้นประเชื่อมที่ยืดตามความสูงของเนื้อหาข้าง ๆ**
 * (`after:absolute after:start-1/2 after:top-* after:bottom-0 after:w-px after:border-e
 * after:border-dashed after:border-default-300 -ms-px`) มาทั้งดุ้น แล้วตัดสิ่งที่ไม่เกี่ยวออก:
 * theme เป็น activity feed (คอลัมน์เวลา + หัวข้อ + คำอธิบาย + ชื่อผู้เขียน) ที่ไม่มีแนวคิด
 * "สถานะของขั้น" เลย — ที่นี่จึงเติม state → สี เข้าไปเอง และไม่มีคอลัมน์เวลา/ผู้เขียน
 * `after:top-4` (ไม่ใช่ `top-3` ของ theme) เพราะจุดของเราคงที่ size-8 ครึ่งหนึ่งพอดี = 16px
 *
 * ทำไมเลิกใช้ Base เดิม (checkout stepper — กล่องขอบประเรียงกันเป็นกริด): user เห็นของจริง
 * บน prod แล้วบอกว่า "ไม่สวยเลย" ซึ่งตรงกับข้อห้ามใน craft-floor ("การ์ด icon+heading+text
 * ขนาดเท่ากันเรียงเป็นตับ") อาการที่วัดได้: อ่านเป็นการ์ด 4 ใบแยกกัน ไม่ใช่เส้นทางเดียว ·
 * ทุกขั้นน้ำหนักเท่ากันจนขั้นที่กำลังรออยู่ไม่เด่น · ออเดอร์ที่เดินมาไกลเขียว 3 ใน 4 ช่อง
 * เต็มความกว้างจอ อ่านแวบแรกเหมือนจบแล้ว · เนื้อหากินไม่ถึงครึ่งกล่อง เหลือที่ว่างเป็นแถบ
 *
 * แนวนอน (md+) ไม่มีไฟล์ใน theme ให้ copy ตรง ๆ (สำรวจทั้งต้นไม้แล้ว: WizardWithProgressbar
 * เป็น fill-bar, checkout stepper เป็นกล่อง — ทั้งคู่คือปัญหาที่กำลังแก้) จึงประกอบจาก primitive
 * ที่ Hard Rule 7 ขึ้นทะเบียนไว้แล้วล้วน ๆ (`flex`/`size-*`/`rounded-full`/`border-dashed`/
 * `bg-{semantic}/15`/`text-{semantic}-ink`) — ไม่มี arbitrary value สักตัว
 *
 * เน้น 2 ชั้น ไม่ใช่ 4 ชั้นเท่ากันแบบเดิม:
 *   spotlight (current/cancelled) = จุดทึบ + ring + ตัวหนา + note เป็นป้ายสี
 *   quiet (done/upcoming)         = จุดขอบบาง + ตัวเล็ก + note เป็นบรรทัดเงียบ
 * เขียวยังสงวนให้ "เสร็จแล้วจริง" เหมือนเดิมทุกประการ — ที่ลดคือ *พื้นที่* ที่เขียวกินบนจอ
 * ไม่ใช่ความหมาย (Verified-Means-Green ไม่ถูกแตะ)
 *
 * ลำดับขั้น/สถานะทั้งหมด derive ที่ src/lib/order-progress.ts (SSOT) — ไฟล์นี้เป็น render layer ล้วน
 */

import { Fragment } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { getOrderProgress, type ProgressState, type ProgressStep } from '@/lib/order-progress'
import { formatDateTime } from '@/lib/format-date'

const STATE_DOT: Record<ProgressState, string> = {
  done: 'border-2 border-success bg-success/10',
  current: 'bg-primary ring-4 ring-primary/15',
  upcoming: 'border-2 border-default-300 bg-card',
  cancelled: 'bg-danger ring-4 ring-danger/15',
}

const STATE_ICON: Record<ProgressState, string> = {
  done: 'text-success',
  current: 'text-white',
  // เทาจางได้เพราะเป็นไอคอนของขั้นที่ยังไม่เกิด (decorative) — ตัวหนังสือข้าง ๆ ยังผ่าน AA
  upcoming: 'text-default-300',
  cancelled: 'text-white',
}

const SPOTLIGHT_PILL: Record<'current' | 'cancelled', string> = {
  // text-{semantic} บนพื้น /15 ตกคอนทราสต์ AA (วัดจริง) — ต้องเป็น token หมึกคู่กันเสมอ
  current: 'bg-primary/15 text-primary-ink',
  cancelled: 'bg-danger/15 text-danger-ink',
}

const isSpotlight = (s: ProgressState) => s === 'current' || s === 'cancelled'

const StepDot = ({ step }: { step: ProgressStep }) => (
  <span
    className={cn(
      'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full',
      STATE_DOT[step.state],
    )}
  >
    <Icon icon={step.icon} className={cn('text-base', STATE_ICON[step.state])} aria-hidden="true" />
  </span>
)

const StepBody = ({ step }: { step: ProgressStep }) => {
  const spotlight = isSpotlight(step.state)
  // ขั้นแรกส่งเวลาสร้างมาด้วยเสมอ แต่ StatusHero เหนือแถบนี้ขึ้นแถว "วันที่สร้าง" อยู่แล้ว
  // — โชว์ซ้ำในจอเดียวไม่ได้เพิ่มอะไร มีแต่ทำให้ขั้นแรกดูหนักกว่าที่ควร (SSOT ไม่ต้องแก้)
  const note = step.key === 'PLACED' ? undefined : step.note

  return (
    <>
      <p className={spotlight ? 'text-sm font-bold text-default-900' : 'text-2xs font-medium text-default-700'}>
        {step.label}
      </p>
      {note &&
        (spotlight ? (
          <span
            className={cn(
              'mt-1 inline-block rounded px-2 py-1 text-2xs font-medium',
              SPOTLIGHT_PILL[step.state as 'current' | 'cancelled'],
            )}
          >
            {note}
          </span>
        ) : (
          // เข้มกว่าป้ายข้าง ๆ (800 vs 700) โดยตั้งใจ — บรรทัดนี้มีคำเตือนเรื่องเงิน COD อยู่
          // ("รอโอนเข้าร้านตามรอบของขนส่ง") ซึ่งห้ามจมหายไปกับตัวอักษรเงียบ ๆ รอบตัว
          <p className="text-default-800 mt-0.5 text-2xs break-words">{note}</p>
        ))}
    </>
  )
}

export type OrderProgressStepperProps = {
  status: string
  fulfillmentMode: string
  paymentMethod: string | null
  slipFileId: string | null
  totalAmount: number
  /** สถานะฝั่งขนส่ง iShip — 'delivered' = ถึงมือผู้ซื้อแล้ว (มีผลกับขั้นเก็บเงิน COD เท่านั้น) */
  carrierStatus: string | null
  createdAtISO: string
  updatedAtISO: string
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

  return (
    <div className="card">
      <div className="card-body">
        {/* มือถือ: เส้นทางแนวตั้ง — 4 ขั้นเรียงแนวนอนบนจอ 360px อ่านไม่ออกแน่ */}
        <ol className="flex flex-col md:hidden">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            return (
              <li className="flex gap-x-3" key={step.key}>
                <div
                  className={cn(
                    'relative shrink-0',
                    !isLast &&
                      'after:border-default-300 after:absolute after:start-1/2 after:top-4 after:bottom-0 after:-ms-px after:w-px after:border-e after:border-dashed',
                  )}
                >
                  <StepDot step={step} />
                </div>
                <div className={cn('min-w-0 flex-1', !isLast && 'pb-4')}>
                  <StepBody step={step} />
                </div>
              </li>
            )
          })}
        </ol>

        {/* ≥768px: เส้นทางแนวนอน — max-w กันจุดกระจายไกลกันเองบนจอกว้าง (การ์ดนี้เต็มความกว้าง
            หน้า ไม่ได้อยู่ในคอลัมน์ 75%) ถ้าปล่อยยืดเต็ม 1200px+ เส้นเชื่อมจะยาวจนอ่านเป็น
            "จุดลอย 4 จุด" แทนที่จะเป็นเส้นทางเดียว */}
        <ol className="mx-auto hidden max-w-3xl items-start md:flex">
          {steps.map((step, i) => (
            <Fragment key={step.key}>
              <li className="flex w-32 shrink-0 flex-col items-center text-center">
                <StepDot step={step} />
                <div className="mt-1.5">
                  <StepBody step={step} />
                </div>
              </li>
              {i < steps.length - 1 && (
                // mt-4 = กึ่งกลางแนวตั้งของจุด size-8 พอดี · สีคงที่ทุก state โดยตั้งใจ —
                // เส้นทางเป็นกลาง ให้สีอยู่ที่จุดอย่างเดียว ไม่งั้นแถบจะกลายเป็นแถบสีทั้งเส้น
                <li aria-hidden="true" className="border-default-300 mt-4 h-px flex-1 border-t border-dashed" />
              )}
            </Fragment>
          ))}
        </ol>
      </div>
    </div>
  )
}

export default OrderProgressStepper
