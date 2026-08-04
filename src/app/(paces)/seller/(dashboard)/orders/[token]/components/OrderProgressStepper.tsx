/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/checkout/page.tsx (บรรทัด 20-46)
 *
 * ปรับจาก Paces "Checkout stepper" (`<ul className="relative grid grid-cols-1 gap-1.5 md:grid-cols-4">`
 * + กล่อง `px-4 py-2.5 flex items-center justify-center gap-2.5 rounded border border-dashed
 * border-default-300` + Icon + label):
 *
 * - DROP พฤติกรรม JS ของ Preline ทั้งหมด (`data-hs-stepper`, `data-hs-stepper-nav-item`,
 *   `<a href="#">`, ปุ่ม back/next) — แถบนี้เป็น "สถานะอ่านอย่างเดียว" ไม่ใช่ตัวนำทางฟอร์ม
 *   กดไม่ได้จึงต้องไม่เป็นลิงก์ (affordance หลอก) และ `hs-stepper-active:`/`hs-stepper-success:`
 *   ใช้ไม่ได้เพราะ pseudo-class พวกนั้นทำงานได้ต่อเมื่อปลั๊กอิน Preline เป็นคน toggle class ให้
 *   → คุมสีเองจาก state จริงของออเดอร์แทน (STATE_BOX/STATE_ICON/STATE_LABEL ด้านล่าง)
 * - จำนวนช่องไม่คงที่ (2-4 ตามเส้นทางชำระเงิน/จัดส่ง/ยกเลิก) — theme ฮาร์ดโค้ด `md:grid-cols-4`
 *   ที่นี่ต้องเป็นตาราง static ต่อจำนวน (GRID_COLS) เพราะ Tailwind สแกน source ตรง ๆ
 *   `md:grid-cols-${n}` จะไม่ถูก generate
 * - เพิ่มบรรทัดรอง (note) ใต้ชื่อขั้น: theme มีแค่ icon+label แต่แถบนี้ต้องบอกเวลา และต้องบอก
 *   เงื่อนไข COD ("รอโอนเข้าร้านตามรอบของขนส่ง") ซึ่งถ้าตัดทิ้งจะกลายเป็นการยืนยันว่าเงินเข้าร้าน
 *   แล้วทั้งที่ระบบไม่มีข้อมูลนั้น (ดูหัวไฟล์ src/lib/order-progress.ts)
 * - สี: theme ใช้ `text-success` บนพื้น `bg-success/10` ซึ่งวัดจริงแล้วตกคอนทราสต์ AA (2.11:1)
 *   ตัวหนังสือจึงใช้ token คู่ `text-{semantic}-ink` แทน ส่วนไอคอนยังเป็น `text-{semantic}` เต็ม
 *   (ไอคอนคือสัญญาณสี ไม่ใช่ข้อความ — เกณฑ์คอนทราสต์คนละข้อ)
 *
 * ลำดับขั้น/สถานะทั้งหมด derive ที่ src/lib/order-progress.ts (SSOT) — ไฟล์นี้เป็น render layer ล้วน
 */

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { getOrderProgress, type ProgressState } from '@/lib/order-progress'
import { formatDateTime } from '@/lib/format-date'

// Tailwind ต้องเห็น class เต็ม ๆ ใน source — ห้ามประกอบสตริงเอง (ดูคอมเมนต์หัวไฟล์)
const GRID_COLS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
}

const STATE_BOX: Record<ProgressState, string> = {
  done: 'bg-success/10 border-success',
  // ขั้นที่กำลังรออยู่: ใช้พื้น light เหมือน `hs-stepper-active:bg-light/50` ของ theme
  // เส้นขอบเป็น primary เพื่อให้ตากวาดเจอก่อนช่องอื่น โดยไม่ไปแย่งความหมายของเขียว (=เสร็จแล้ว)
  current: 'bg-light/50 border-primary',
  upcoming: 'border-default-300',
  cancelled: 'bg-danger/15 border-danger',
}

const STATE_ICON: Record<ProgressState, string> = {
  done: 'text-success',
  current: 'text-primary',
  // เทาจางได้เพราะเป็นไอคอนของขั้นที่ยังไม่เกิด (decorative) — ข้อความข้าง ๆ ยังผ่าน AA
  upcoming: 'text-default-300',
  cancelled: 'text-danger',
}

const STATE_LABEL: Record<ProgressState, string> = {
  done: 'text-success-ink',
  current: 'text-default-800',
  upcoming: 'text-default-700',
  cancelled: 'text-danger-ink',
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
        <ul className={cn('relative grid grid-cols-1 gap-1.5', GRID_COLS[steps.length] ?? 'md:grid-cols-4')}>
          {steps.map((step) => (
            <li key={step.key}>
              <div
                className={cn(
                  'flex items-center gap-2.5 rounded border border-dashed px-4 py-2.5',
                  STATE_BOX[step.state],
                )}
              >
                <Icon icon={step.icon} className={cn('shrink-0 text-2xl', STATE_ICON[step.state])} aria-hidden="true" />
                {/* min-w-0 ให้ข้อความไทยยาว ๆ พันบรรทัดได้ในช่องแคบ (4 ช่องเท่ากันบนจอ md) */}
                <span className="min-w-0">
                  <span className={cn('text-md block font-semibold', STATE_LABEL[step.state])}>{step.label}</span>
                  {step.note && (
                    <span className="text-default-700 block text-xs font-normal break-words">{step.note}</span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default OrderProgressStepper
