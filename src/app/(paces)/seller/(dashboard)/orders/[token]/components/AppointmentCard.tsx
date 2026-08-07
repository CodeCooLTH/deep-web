'use client'

/**
 * การ์ด "การนัดหมาย" ในหน้ารายละเอียดออเดอร์ (feature 00036 FR-SOV-007)
 *
 * Base: โครงการ์ด + แถวข้อมูลไอคอนวงกลม ยกจาก CustomerDetails.tsx ในโฟลเดอร์เดียวกัน
 * (`.card` > `.card-body` > `ul.space-y-2.5` > `span.btn.btn-icon.bg-light...size-6!.rounded-full`)
 *
 * ทำไมการ์ดนี้ถึงสำคัญกว่าที่หน้าตาบอก: service `setAppointmentOutcome` และ route
 * `POST /api/orders/[token]/appointment/outcome` มีมาตั้งแต่ feature 00024 และทำงานได้จริง
 * แต่ไม่มีผู้เรียกฝั่ง UI เลยสักราย (ปฏิทินคิวงานยิงแค่ GET) — แปลว่าสถานะ COMPLETED/NO_SHOW
 * เกิดขึ้นจริงในฐานไม่ได้เลยตั้งแต่วันแรก นัดทุกใบค้างที่ SCHEDULED/CONFIRMED_BY_BUYER ตลอดกาล
 * ปุ่มสองปุ่มในไฟล์นี้คือสิ่งเดียวที่ปิดวงจรนั้น
 *
 * fetch/toast/refresh เองแบบเดียวกับ ShippingAddress.tsx / ShippingCard.tsx — ไม่ผ่าน
 * OrderDetailClient.handleAction เพราะการ์ดกลุ่มนี้ทุกใบจัดการ action ของตัวเองอยู่แล้ว
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { formatDateTH, formatDateTimeTH, formatDayMonthTimeTH } from '@/lib/format-date'
import { APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'
import { isTerminalAppointmentStatus, type AppointmentStatus } from '@/lib/appointments'

type Props = {
  publicToken: string
  /** ISO — ผู้เรียกต้องไม่ render การ์ดนี้เลยถ้าไม่มีช่วงเวลา (เงื่อนไขเดียวกับที่ service ตอบ 404) */
  startISO: string
  allDay: boolean
  resourceName: string | null
  stage: AppointmentStatus
  /** ชื่อลูกค้าสำหรับข้อความยืนยัน — กดผิดใบแล้วย้อนไม่ได้ ต้องระบุให้ชัดว่ากำลังปิดผลของใคร */
  buyerLabel: string
}

export default function AppointmentCard({
  publicToken,
  startISO,
  allDay,
  resourceName,
  stage,
  buyerLabel,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'COMPLETED' | 'NO_SHOW' | null>(null)

  const meta = APPOINTMENT_STAGE_META[stage]
  const terminal = isTerminalAppointmentStatus(stage)
  /**
   * ยังไม่ถึงเวลานัด = ปิดผลไม่ได้ (BR-RSV-34) — server บังคับด้วย 409 อยู่แล้ว ที่นี่สะท้อน
   * ล่วงหน้าเพื่อไม่ให้ผู้ใช้ต้องกดเพื่อค้นพบว่าทำไม่ได้ (BR-SOV-05)
   *
   * คำนวณตอน render ครั้งเดียวพอ ไม่ต้อง tick ทุกวินาที: ถ้าผู้ใช้เปิดหน้าค้างไว้ข้ามเวลานัดจริง
   * แล้วกด server จะเป็นคนตอบ 409 ให้เอง ซึ่งเรามี error ไทยรออยู่แล้ว
   */
  const notStarted = new Date(startISO).getTime() > Date.now()

  const submit = async (outcome: 'COMPLETED' | 'NO_SHOW') => {
    const whenText = allDay ? formatDateTH(startISO) : formatDateTimeTH(startISO)
    const ok =
      outcome === 'COMPLETED'
        ? await pacesConfirm.question(
            'ทำเครื่องหมายว่าให้บริการแล้ว?',
            `ให้บริการ ${buyerLabel} ตามนัด ${whenText} แล้ว · ย้อนกลับไม่ได้`,
            { confirmButtonText: 'ให้บริการแล้ว', cancelButtonText: 'ยังไม่ใช่ตอนนี้' },
          )
        : await pacesConfirm.warning(
            'บันทึกว่าลูกค้าไม่มาตามนัด?',
            `${buyerLabel} ไม่มาตามนัด ${whenText} · ย้อนกลับไม่ได้`,
            { confirmButtonText: 'ไม่มาตามนัด', cancelButtonText: 'ยังไม่ใช่ตอนนี้' },
          )
    if (!ok) return

    setLoading(outcome)
    try {
      const res = await fetch(`/api/orders/${publicToken}/appointment/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        // แปล error code เป็นไทยที่บอกทางออก ห้ามโยนรหัสดิบขึ้นจอ (BR-SOV-05)
        // อีก 2 เคสที่ server โยนได้คือ 403 (ร้านไม่เข้าเงื่อนไข) และ 404 (ใบนี้ไม่มีนัด)
        // ซึ่งไม่มีทางเกิดจากหน้านี้ เพราะการ์ดจะไม่ถูก render เลย — ตกไปที่ข้อความกลาง
        const message =
          data.error === 'APPOINTMENT_TERMINAL'
            ? 'นัดนี้ถูกปิดผลไปแล้ว'
            : data.error === 'APPOINTMENT_NOT_STARTED'
              ? 'ยังไม่ถึงเวลานัด ปิดผลได้เมื่อถึงเวลา'
              : 'บันทึกผลนัดไม่สำเร็จ กรุณาลองใหม่'
        throw new Error(message)
      }
      pacesToast.success(outcome === 'COMPLETED' ? 'บันทึกว่าให้บริการแล้ว' : 'บันทึกว่าไม่มาตามนัด')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกผลนัดไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-2">
        <h4 className="card-title">การนัดหมาย</h4>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
            meta.cls,
          )}
        >
          <Icon icon={meta.icon} className="shrink-0 text-sm" aria-hidden="true" />
          {meta.label}
        </span>
      </div>
      <div className="card-body">
        <ul className="mb-0 list-none space-y-2.5 p-0">
          <li>
            <div className="flex items-center gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                <Icon icon="calendar-event" className="text-sm" aria-hidden="true" />
              </span>
              <span className="text-default-800 text-sm font-medium">
                {/* นัดทั้งวันไม่มีเวลาให้แสดง — โชว์ 00:00 คือการกุข้อมูลที่ผู้ใช้ไม่ได้กรอก */}
                {allDay ? `${formatDateTH(startISO)} · ทั้งวัน` : formatDayMonthTimeTH(startISO)}
              </span>
            </div>
          </li>
          {resourceName && (
            <li>
              <div className="flex items-center gap-2.5">
                <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                  <Icon icon="armchair" className="text-sm" aria-hidden="true" />
                </span>
                <span className="text-default-700 truncate text-sm">{resourceName}</span>
              </div>
            </li>
          )}
        </ul>

        {/* ปุ่มปิดผล — หายทั้งคู่เมื่อนัดจบแล้ว (terminal) เหลือแค่ป้ายสถานะบนหัวการ์ด
            สองปุ่มน้ำหนักเท่ากันโดยตั้งใจ: ผลลัพธ์ทั้งสองทางเกิดจริงพอ ๆ กันในธุรกิจ
            การชู "ให้บริการแล้ว" เป็น primary จะอ่านเป็นระบบชี้นำว่าอยากได้คำตอบไหน */}
        {!terminal && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={notStarted || loading !== null}
                onClick={() => submit('COMPLETED')}
                className="btn border-success text-success-ink hover:bg-success/10 w-full sm:flex-1"
              >
                <Icon
                  icon={loading === 'COMPLETED' ? 'mdi:loading' : 'circle-check-filled'}
                  className={cn('text-sm', loading === 'COMPLETED' && 'animate-spin')}
                  aria-hidden="true"
                />
                ให้บริการแล้ว
              </button>
              <button
                type="button"
                disabled={notStarted || loading !== null}
                onClick={() => submit('NO_SHOW')}
                className="btn border-danger text-danger-ink hover:bg-danger/10 w-full sm:flex-1"
              >
                <Icon
                  icon={loading === 'NO_SHOW' ? 'mdi:loading' : 'clock-off'}
                  className={cn('text-sm', loading === 'NO_SHOW' && 'animate-spin')}
                  aria-hidden="true"
                />
                ไม่มาตามนัด
              </button>
            </div>
            {notStarted && (
              <p className="text-default-500 mb-0 mt-2 text-xs">
                ปิดผลได้ตั้งแต่ {allDay ? formatDateTH(startISO) : formatDateTimeTH(startISO)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
