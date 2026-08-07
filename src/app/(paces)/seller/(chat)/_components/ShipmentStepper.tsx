'use client'

/**
 * ShipmentStepper — แถบความคืบหน้าพัสดุ 4 ขั้น ใช้ร่วมกันทุกที่ที่โชว์ progress ในแชท
 * (การ์ดออเดอร์ bubble/right panel + แถบสถานะออเดอร์ใต้หัวเธรด — งาน Order Progress 2026-08-05)
 *
 * แยกออกมาเพื่อให้ stepper "หน้าตาเดียวกันทุกที่" ตามเจตนา operate: ผู้ขายเรียนรู้ครั้งเดียว
 * ใช้ได้ทุกจุด — ห้ามมีเวอร์ชันที่วาดเองต่างไปจากโมดัลพัสดุเดิม
 *
 * Base: src/components/safepay/iship/ShipmentStatusView.tsx (STAGE_DOT/STAGE_LINE + <ol> 4 ขั้น
 *       + notice box) — โทนสีมาจาก describeProgress() เดิม ไม่ตัดสินสีเองที่นี่
 */

import Icon from '@/components/wrappers/Icon'
import { NOTICE_BOX } from '@/components/safepay/iship/tone'
import { SHIPMENT_STAGES, describeProgress } from '@/lib/iship/status'

/**
 * class เต็มคำทุกตัว — Tailwind สแกนซอร์สแบบข้อความ ประกอบสตริง `bg-${tone}` จะไม่ถูกสร้าง
 * (ชุดเดียวกับ ShipmentStatusView — คัดลอกโดยเจตนา ไม่ export ข้ามไฟล์เพราะเป็น impl detail
 * ของการ render ไม่ใช่ SSOT ของสี; SSOT จริงคือ tone จาก describeProgress)
 */
const STAGE_DOT: Record<string, string> = {
  progress: 'bg-primary text-white',
  delivered: 'bg-success text-white',
  diverted: 'bg-default-300 text-white',
  stopped: 'bg-default-100 text-default-400',
}

const STAGE_LINE: Record<string, string> = {
  progress: 'bg-primary',
  delivered: 'bg-success',
  diverted: 'bg-default-300',
  stopped: 'bg-default-200',
}

export default function ShipmentStepper({
  shipmentStatus,
  carrierStatus,
  size = 'md',
  showNotice = true,
}: {
  /** OrderShipment.status ('PENDING'|'CREATED'|'FAILED'|'CANCELLED') */
  shipmentStatus: string
  /** สถานะล่าสุดจากขนส่ง (null = ขนส่งยังไม่อัปเดต) */
  carrierStatus: string | null
  /** md = ในการ์ดออเดอร์ (dot size-7) · sm = แถบสถานะใต้หัวเธรด (dot size-6 เท่าโมดัลพัสดุย่อ) */
  size?: 'md' | 'sm'
  /** แถบปักพื้นที่จำกัด — ปิด notice ได้ (การ์ดเปิดเสมอ) */
  showNotice?: boolean
}) {
  const progress = describeProgress(shipmentStatus, carrierStatus)
  const dotCls = size === 'md' ? 'size-7' : 'size-6'
  const iconCls = size === 'md' ? 'text-base' : 'text-sm'

  return (
    <div>
      {/* grid 4 คอลัมน์ + ป้ายอยู่ใต้จุดของตัวเอง — โครงเดียวกับโมดัลพัสดุเป๊ะ ๆ (Base ของไฟล์นี้)
          user เทียบสองจอแล้วสั่งให้เหมือนกัน 2026-08-07
          เคยลองเป็น track กางเต็มความกว้าง + ป้าย justify-between (2026-08-06) แต่ป้ายที่ถูกบีบ
          ด้วย max-w-14 ตกบรรทัดกลางคำ ("รับเข้าระบบ / แล้ว") ทุกครั้งที่ขั้นนั้นมีชื่อยาว —
          คอลัมน์เท่ากันให้ที่ป้ายมากกว่าและทำให้ทุกจอวางตัวเหมือนกัน
          ครึ่งเส้นด้านนอกของจุดหัว-ท้ายต้องโปร่ง ไม่งั้นแถบยื่นเลยจุดปลายออกไปทั้งสองข้าง */}
      <ol className="grid list-none grid-cols-4 ps-0">
        {SHIPMENT_STAGES.map((s, i) => {
          const reached = i <= progress.stage
          const isLast = i === SHIPMENT_STAGES.length - 1
          return (
            <li key={s.label} className="flex flex-col items-center gap-1">
              <div className="flex w-full items-center">
                <span
                  className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : reached ? STAGE_LINE[progress.tone] : 'bg-default-200'}`}
                />
                <span
                  className={`flex ${dotCls} shrink-0 items-center justify-center rounded-full ${
                    reached ? STAGE_DOT[progress.tone] : 'bg-default-100 text-default-400'
                  }`}
                >
                  <Icon icon={s.icon} className={iconCls} aria-hidden="true" />
                </span>
                <span
                  className={`h-0.5 flex-1 ${isLast ? 'bg-transparent' : i < progress.stage ? STAGE_LINE[progress.tone] : 'bg-default-200'}`}
                />
              </div>
              {/* ห้าม truncate: ป้ายขั้นตอนต้องอ่านครบ ยอมขึ้น 2 บรรทัดดีกว่าเห็นครึ่งคำ */}
              <span
                className={`text-center text-2xs leading-tight ${
                  i === progress.stage ? 'font-semibold text-default-900' : 'text-default-700'
                }`}
              >
                {isLast ? (progress.lastLabel ?? s.label) : s.label}
              </span>
            </li>
          )
        })}
      </ol>

      {showNotice && progress.notice && (
        <p
          className={`mb-0 mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-2xs ${
            NOTICE_BOX[progress.notice.tone] ?? NOTICE_BOX.secondary
          }`}
        >
          <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{progress.notice.text}</span>
        </p>
      )}
    </div>
  )
}
