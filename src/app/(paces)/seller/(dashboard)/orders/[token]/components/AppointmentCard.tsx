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

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// import ข้ามกลุ่มโฟลเดอร์ตาม precedent ใน CustomerPanel.tsx — ชีตเดียวใช้ร่วม 4 จุดเรียก
// (คนละ route group แต่เป็นของชิ้นเดียวกัน; ก็อปไปไว้ทั้งสองที่ = คำบนการ์ดจะเพี้ยนจากกัน)
import AppointmentSummarySheet from '@/app/(paces)/seller/(chat)/_components/AppointmentSummarySheet'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import {
  formatDateTH,
  formatDateTimeTH,
  formatDayMonthTimeRangeTH,
  formatDayMonthTimeTH,
} from '@/lib/format-date'
import RescheduleAppointmentSheet from './RescheduleAppointmentSheet'
import { APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'
import {
  appointmentOutcomeErrorMessage,
  appointmentOutcomeSuccessMessage,
} from '@/lib/appointment-outcome'
import { isTerminalAppointmentStatus, type AppointmentStatus } from '@/lib/appointments'

type Props = {
  publicToken: string
  /** ISO — ผู้เรียกต้องไม่ render การ์ดนี้เลยถ้าไม่มีช่วงเวลา (เงื่อนไขเดียวกับที่ service ตอบ 404) */
  startISO: string
  /** ISO — null = ข้อมูลเก่าที่ไม่มี serviceEnd (แสดงเวลาเริ่มอย่างเดียว) */
  endISO: string | null
  allDay: boolean
  resourceName: string | null
  /** id ของคิวงานที่รับงานนี้ — ใช้ pre-select ในแผงเลื่อนนัด */
  resourceId: string | null
  stage: AppointmentStatus
  /**
   * เลื่อนมาแล้วกี่ครั้ง (นับจาก AppointmentReschedule) — แสดงเฉพาะ > 0
   * ค่าปกติของนัดส่วนใหญ่คือ 0 การโชว์ "เลื่อนมาแล้ว 0 ครั้ง" ทุกใบคือ noise
   */
  rescheduleCount: number
  /** เหตุผลที่ลูกค้าขอเลื่อน (Order.rescheduleRequestNote) — null = ขอเลื่อนโดยไม่ระบุเหตุผล */
  rescheduleRequestNote: string | null
  /**
   * ชื่อลูกค้าสำหรับข้อความยืนยัน — กดผิดใบแล้วย้อนไม่ได้ ต้องระบุให้ชัดว่ากำลังปิดผลของใคร
   * null = ใบที่ไม่รู้ชื่อ (ผู้ซื้อ guest ที่ร้านไม่ได้กรอกชื่อ) → ตัดวลีชื่อออกจากประโยคทั้งก้อน
   */
  buyerLabel: string | null
}

export default function AppointmentCard({
  publicToken,
  startISO,
  endISO,
  allDay,
  resourceName,
  resourceId,
  stage,
  rescheduleCount,
  rescheduleRequestNote,
  buyerLabel,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'COMPLETED' | 'NO_SHOW' | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  /** ชีต "ส่งสรุปนัด" (ส่วนขยาย 00024 2026-08-11) — ชีตขอข้อมูลเองจาก token ไม่รับ prop
   *  (สรุปนัดมีเบอร์ลูกค้า ส่งเป็น prop = โยน PII ลง flight payload ทุกครั้งที่เปิดหน้า) */
  const [summaryOpen, setSummaryOpen] = useState(false)

  const meta = APPOINTMENT_STAGE_META[stage]
  const terminal = isTerminalAppointmentStatus(stage)
  /** ลูกค้าขอเลื่อนแล้วรออยู่ — การ์ดต้องชี้ทางแก้ ไม่ใช่แค่ติดป้ายบอกว่ามีปัญหา */
  const awaitingReschedule = stage === 'RESCHEDULE_REQUESTED'

  /**
   * ยังไม่ถึงเวลานัด = ปิดผลไม่ได้ (BR-RSV-34) — server บังคับด้วย 409 อยู่แล้ว ที่นี่สะท้อน
   * ล่วงหน้าเพื่อไม่ให้ผู้ใช้ต้องกดเพื่อค้นพบว่าทำไม่ได้ (BR-SOV-05)
   *
   * [สำคัญ] ต้องปลดล็อกเองเมื่อถึงเวลา ห้ามคำนวณครั้งเดียวตอน render — พฤติกรรมปกติที่สุดของ
   * งานนี้คือผู้ขาย "เปิดใบค้างไว้รอลูกค้ามาถึง" ถ้าปุ่มไม่ปลดเอง พอถึงเวลานัดจริงเขาจะเจอปุ่มเทา
   * ที่กดไม่ได้โดยไม่มี error ไม่มีคำอธิบาย ซึ่งอ่านเป็น "ระบบพัง" ไม่ใช่ "ต้องรีเฟรช"
   * ตั้ง timer นัดเดียวไปที่ขอบเวลาพอดี (ไม่ tick ทุกวินาที) และ clamp เพดานเพราะ setTimeout
   * ที่เกิน ~24.8 วัน (int32 ms) จะ overflow แล้วยิงทันที — นัดล่วงหน้าเกินนั้นค่อยว่ากันตอนเปิดใหม่
   */
  const [notStarted, setNotStarted] = useState(() => new Date(startISO).getTime() > Date.now())
  useEffect(() => {
    const msLeft = new Date(startISO).getTime() - Date.now()
    if (msLeft <= 0) {
      setNotStarted(false)
      return
    }
    setNotStarted(true)
    const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000
    if (msLeft > MAX_TIMEOUT_MS) return
    const t = setTimeout(() => setNotStarted(false), msLeft)
    return () => clearTimeout(t)
  }, [startISO])

  const submit = async (outcome: 'COMPLETED' | 'NO_SHOW') => {
    const whenText = allDay ? formatDateTH(startISO) : formatDateTimeTH(startISO)
    /**
     * ชื่อลูกค้าเป็นตัวเลือก ไม่ใช่การเติมคำว่า "ลูกค้า" ลงไปแทน — ประโยค "ให้บริการ ลูกค้า
     * ตามนัด …" อ่านสะดุดกว่าไม่มีชื่อเลย ใบที่ไม่รู้ชื่อจึงตัดวลีนั้นทิ้งทั้งก้อน
     */
    const who = buyerLabel ? `${buyerLabel} ` : ''
    /**
     * confirmSemantic ต้องตรงกับสีของปุ่มที่กดมา — ผู้ใช้อ่านสีก่อนอ่านคำ ถ้ากดปุ่มเขียวแล้ว
     * เจอปุ่มยืนยันน้ำเงินพร้อมไอคอน "?" กล่องจะอ่านเป็น "ถามเฉย ๆ ไม่ซีเรียส" ซึ่งขัดกับคำว่า
     * "ย้อนกลับไม่ได้" ที่เขียนอยู่บรรทัดล่างพอดี · ทั้งสองทางใช้ icon 'warning' เท่ากันเพราะ
     * ทั้งคู่เป็น terminal เหมือนกัน ต่างกันแค่ผลลัพธ์ ไม่ใช่ต่างกันที่ความหนัก
     */
    const ok =
      outcome === 'COMPLETED'
        ? await pacesConfirm({
            confirmSemantic: 'success',
            icon: 'warning',
            title: 'ทำเครื่องหมายว่าให้บริการแล้ว?',
            text: `ให้บริการ ${who}ตามนัด ${whenText} แล้ว · ย้อนกลับไม่ได้`,
            confirmButtonText: 'ให้บริการแล้ว',
            cancelButtonText: 'ยังไม่ใช่ตอนนี้',
          })
        : await pacesConfirm.danger(
            'บันทึกว่าลูกค้าไม่มาตามนัด?',
            `${who}ไม่มาตามนัด ${whenText} · ย้อนกลับไม่ได้`,
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
        //
        // 🛑 คำพูดย้ายไป src/lib/appointment-outcome.ts ตั้งแต่ 2026-08-11 เพราะการ์ดคิวงานรายวัน
        // ปิดผลได้จากลิสต์ด้วยแล้ว = การกระทำเดียวกันมี 2 จอ (HR16 — ห้ามพิมพ์ข้อความซ้ำที่นั่น)
        throw new Error(appointmentOutcomeErrorMessage(data.error, whenText))
      }
      pacesToast.success(appointmentOutcomeSuccessMessage(outcome))
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกผลนัดไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div
      className={cn(
        'card',
        // แถบซ้าย info = "ลูกค้ารออยู่" — สถานะเดียวในชุดนี้ที่ต้องการการลงมือของร้าน
        // ใช้สีเดียวกับป้ายสถานะของมันเอง (APPOINTMENT_STAGE_META.RESCHEDULE_REQUESTED)
        awaitingReschedule && 'border-info border-s-3',
      )}
    >
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
          {/* ไอคอนเป็นตัวบอกว่าแต่ละแถวคืออะไร ซึ่งคนที่เพิ่งเคยใช้ครั้งแรกอ่านไม่ออก —
              เติมป้ายสำหรับ screen reader โดยไม่กินที่บนจอ (คู่ไอคอน+ค่าตามแบบ CustomerDetails) */}
          <li>
            <div className="flex items-center gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                <Icon icon="calendar-event" className="text-sm" aria-hidden="true" />
              </span>
              <span className="text-default-800 text-sm font-medium">
                <span className="sr-only">วันเวลานัด </span>
                {/* นัดทั้งวันไม่มีเวลาให้แสดง — โชว์ 00:00 คือการกุข้อมูลที่ผู้ใช้ไม่ได้กรอก
                    ที่เหลือแสดงช่วงเต็ม (งาน D) — คอลัมน์ข้างมีที่ว่างมากที่สุดใน 3 surface */}
                {allDay
                  ? `${formatDateTH(startISO)} · ทั้งวัน`
                  : endISO
                    ? formatDayMonthTimeRangeTH(startISO, endISO)
                    : formatDayMonthTimeTH(startISO)}
              </span>
            </div>
          </li>
          {resourceName && (
            <li>
              <div className="flex items-center gap-2.5">
                <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                  <Icon icon="user-cog" className="text-sm" aria-hidden="true" />
                </span>
                <span className="text-default-700 truncate text-sm">
                  <span className="sr-only">คิวงาน </span>
                  {resourceName}
                </span>
              </div>
            </li>
          )}
        </ul>

        {/* ปุ่มปิดผล — หายทั้งคู่เมื่อนัดจบแล้ว (terminal) เหลือแค่ป้ายสถานะบนหัวการ์ด
            สองปุ่มน้ำหนักเท่ากันโดยตั้งใจ: ผลลัพธ์ทั้งสองทางเกิดจริงพอ ๆ กันในธุรกิจ
            การชู "ให้บริการแล้ว" เป็น primary จะอ่านเป็นระบบชี้นำว่าอยากได้คำตอบไหน */}
        {/* ข้อความที่ลูกค้าฝากไว้ตอนขอเลื่อน — เป็นข้อมูลที่ตัดทิ้งไม่ได้ จึง wrap ไม่ truncate */}
        {awaitingReschedule && (
          <div className="bg-info/10 border-info/30 mt-4 rounded-lg border p-3">
            <p className="text-default-800 mb-0 text-xs">
              {rescheduleRequestNote ? (
                <>
                  ลูกค้าขอเลื่อน:{' '}
                  <span className="text-default-700">&ldquo;{rescheduleRequestNote}&rdquo;</span>
                </>
              ) : (
                'ลูกค้าขอเลื่อนนัด โดยไม่ได้ระบุเหตุผล'
              )}
            </p>
          </div>
        )}

        {rescheduleCount > 0 && (
          <p className="text-default-500 mb-0 mt-2 text-xs">เลื่อนมาแล้ว {rescheduleCount} ครั้ง</p>
        )}

        {!terminal && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            {/* เลื่อนนัดอยู่บนสุดเพราะก่อนถึงเวลานัด ปุ่มปิดผลถูกปิดอยู่ — ตัวนี้เป็น action
                เดียวที่กดได้จริง · น้ำหนัก tonal ไม่ใช่ outline semantic เพราะเบากว่าการปิดผล
                (เลื่อนซ้ำได้ ปิดผลย้อนไม่ได้) และไม่ใช่ primary เพราะ primary สงวนให้ action
                หลักของทั้งหน้า ไม่ใช่ของการ์ดย่อย
                ไม่ผูกกับ notStarted — service ไม่ได้ห้ามเลื่อนนัดที่เลยเวลาแล้ว (ต่างจากปิดผล) */}
            {/**
             * ส่งสรุปนัดเข้าแชท (ส่วนขยาย 00024, 2026-08-11)
             *
             * อยู่เหนือ "เลื่อนนัด" เพราะเป็นงานที่ทำ **ตอนเพิ่งนัดเสร็จ** ซึ่งเป็นจังหวะที่ผู้ขาย
             * เปิดหน้านี้บ่อยที่สุด ส่วนเลื่อน/ปิดผลเกิดทีหลังคนละรอบ
             *
             * โทนเบากว่าอีกสองปุ่มโดยตั้งใจ: ส่งซ้ำได้ ไม่มีผลย้อนกลับไม่ได้ ต่างจากปิดผล/เลื่อนนัด
             *
             * ปุ่มนี้ไม่ถูกซ่อนเมื่อลูกค้าไม่มีห้องแชท — ชีตเป็นคนบอกเหตุผล (ซ่อนปุ่มแล้วร้านจะ
             * คิดว่าฟีเจอร์ไม่มี แทนที่จะรู้ว่าติดอะไร)
             */}
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="btn bg-primary/10 text-primary hover:bg-primary/20 mb-3 min-h-11 w-full"
            >
              <Icon icon="calendar-check" className="text-sm" aria-hidden="true" />
              ส่งสรุปนัด
            </button>
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 mb-3 min-h-11 w-full"
            >
              <Icon icon="calendar-repeat" className="text-sm" aria-hidden="true" />
              {awaitingReschedule ? 'เลือกเวลาใหม่ให้ลูกค้า' : 'เลื่อนนัด'}
            </button>
            {/* gap-3 + min-h-11 (44px) ไม่ใช่ค่าตั้งต้นของ .btn (36px, gap-2): ปุ่มสองตัวนี้
                ย้อนกลับไม่ได้ทั้งคู่และให้ผลตรงข้ามกัน — กดพลาดปุ่มข้าง ๆ คือกดผลที่ตรงข้าม
                โดยไม่มีทางแก้ ผู้ใช้กลุ่มเป้าหมายถือมือถือมือเดียวกลางร้าน (design.json
                ประกาศเกณฑ์ tap target ≥44px ไว้เอง) */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={notStarted || loading !== null}
                onClick={() => submit('COMPLETED')}
                className="btn border-success text-success-ink hover:bg-success/10 min-h-11 w-full sm:flex-1"
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
                className="btn border-danger text-danger-ink hover:bg-danger/10 min-h-11 w-full sm:flex-1"
              >
                <Icon
                  icon={loading === 'NO_SHOW' ? 'mdi:loading' : 'clock-off'}
                  className={cn('text-sm', loading === 'NO_SHOW' && 'animate-spin')}
                  aria-hidden="true"
                />
                ไม่มาตามนัด
              </button>
            </div>
            {/* ข้อความนี้เป็นข้อมูลที่จำเป็นที่สุดในสถานะนี้ (อธิบายว่าทำไมปุ่มกดไม่ได้) จึงใช้
                น้ำหนักเดียวกับข้อความปกติ ไม่ใช่ default-500 แบบหมายเหตุประกอบ */}
            {notStarted && (
              <p className="text-default-700 mb-0 mt-2 text-xs">
                ปิดผลได้ตั้งแต่ {allDay ? formatDateTH(startISO) : formatDateTimeTH(startISO)}
              </p>
            )}
          </div>
        )}
      </div>

      <RescheduleAppointmentSheet
        open={rescheduleOpen}
        publicToken={publicToken}
        startISO={startISO}
        endISO={endISO}
        allDay={allDay}
        resourceId={resourceId}
        rescheduleRequestNote={rescheduleRequestNote}
        onClose={() => setRescheduleOpen(false)}
      />
      {/* ชีตเดียวกับอีก 3 จุดเรียก — ทุกจุดเปิดตัวนี้ ไม่มีจุดไหน "ส่งเลย" ข้ามชีต */}
      <AppointmentSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        orderToken={publicToken}
      />
    </div>
  )
}
