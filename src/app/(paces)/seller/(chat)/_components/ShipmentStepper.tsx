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
  /** md = ในการ์ดออเดอร์ (dot size-8 เท่าโมดัลพัสดุ) · sm = แถบปักใต้หัวเธรด (dot size-5) */
  size?: 'md' | 'sm'
  /** แถบปักพื้นที่จำกัด — ปิด notice ได้ (การ์ดเปิดเสมอ) */
  showNotice?: boolean
}) {
  const progress = describeProgress(shipmentStatus, carrierStatus)
  const dotCls = size === 'md' ? 'size-7' : 'size-5'
  const iconCls = size === 'md' ? 'text-base' : 'text-xs'

  return (
    <div>
      {/* track กางเต็มความกว้าง (user 2026-08-06): จุดแรกชิดซ้ายตรงแนวโลโก้ขนส่ง จุดสุดท้ายชิดขวา
          ตรงแนวปุ่มคัดลอก — เลิกใช้ grid 4 คอลัมน์แบบเดิมที่วางจุดกลางคอลัมน์แล้วหัว-ท้ายหดเข้ากลาง
          <li> เป็น display:contents เพื่อคง semantics ของ list แต่ให้ dot/เส้นเป็น flex-sibling ตรง */}
      <ol className="flex list-none items-center ps-0">
        {SHIPMENT_STAGES.map((s, i) => {
          const reached = i <= progress.stage
          const isLast = i === SHIPMENT_STAGES.length - 1
          return (
            <li key={s.label} className="contents">
              <span
                className={`flex ${dotCls} shrink-0 items-center justify-center rounded-full ${
                  reached ? STAGE_DOT[progress.tone] : 'bg-default-100 text-default-400'
                }`}
              >
                <Icon icon={s.icon} className={iconCls} aria-hidden="true" />
              </span>
              {!isLast && (
                <span
                  className={`h-0.5 flex-1 ${i < progress.stage ? STAGE_LINE[progress.tone] : 'bg-default-200'}`}
                />
              )}
            </li>
          )
        })}
      </ol>
      {/* ป้ายแยกแถวจาก track — แรกชิดซ้าย/ท้ายชิดขวาตามตำแหน่งจุด · max-w-14 + wrap (ห้าม truncate:
          ป้ายขั้นตอนต้องอ่านครบ ยอมขึ้น 2 บรรทัดดีกว่าเห็นครึ่งคำ) กันชนกันบน bubble w-64 */}
      <div className="mt-1 flex justify-between gap-1">
        {SHIPMENT_STAGES.map((s, i) => {
          const isLast = i === SHIPMENT_STAGES.length - 1
          return (
            <span
              key={s.label}
              className={`max-w-14 text-2xs leading-tight break-words ${
                i === 0 ? 'text-start' : isLast ? 'text-end' : 'text-center'
              } ${i === progress.stage ? 'font-semibold text-default-900' : 'text-default-700'}`}
            >
              {isLast ? (progress.lastLabel ?? s.label) : s.label}
            </span>
          )
        })}
      </div>

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
