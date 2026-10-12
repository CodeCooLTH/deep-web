'use client'

/**
 * การ์ด "การนัดหมาย" ในหน้ารายละเอียดออเดอร์ (feature 00036 FR-SOV-007)
 *
 * Base: โครงการ์ด + แถวข้อมูลไอคอนวงกลม ยกจาก CustomerDetails.tsx ในโฟลเดอร์เดียวกัน
 * (`.card` > `.card-body` > `ul.space-y-2.5` > `span.btn.btn-icon.bg-light...size-6!.rounded-full`)
 *
 * feature 00073 — ปุ่ม "ให้บริการแล้ว / ไม่มาตามนัด" ย้ายไปการ์ด "งานนี้" (ServiceJobCard) เป็น "ปิดงาน"
 * กดครั้งเดียว (ผล + เงิน + วันปิดงาน) ซึ่งแสดงกับงาน walk-in ด้วย — การ์ดนี้เหลือข้อมูลนัด + เลื่อนนัด + ส่งสรุป
 *
 * fetch/toast/refresh เองแบบเดียวกับ ShippingAddress.tsx / ShippingCard.tsx — ไม่ผ่าน
 * OrderDetailClient.handleAction เพราะการ์ดกลุ่มนี้ทุกใบจัดการ action ของตัวเองอยู่แล้ว
 */

import { useState } from 'react'
// import ข้ามกลุ่มโฟลเดอร์ตาม precedent ใน CustomerPanel.tsx — ชีตเดียวใช้ร่วม 3 จุดเรียก
// (คนละ route group แต่เป็นของชิ้นเดียวกัน; ก็อปไปไว้ทั้งสองที่ = คำบนการ์ดจะเพี้ยนจากกัน)
import AppointmentSummarySheet from '@/app/(paces)/seller/(chat)/_components/AppointmentSummarySheet'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { ARRIVAL_MODE_META, resolveArrivalMode } from '@/lib/arrival-mode'
import {
  formatDateTH,
  formatDayMonthTimeRangeTH,
  formatDayMonthTimeTH,
} from '@/lib/format-date'
import RescheduleAppointmentSheet from './RescheduleAppointmentSheet'
import { APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'
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
   * เวลาที่เปิดบิล — ใช้ derive "วิธีเข้ารับบริการ" (หัวหน้าถาม 2026-08-15)
   *
   * 🛑 ต้องรับ `createdAt` เข้ามา ไม่ใช่คำนวณจาก `startISO` อย่างเดียว — ตัวที่แยก
   * "จองล่วงหน้า" ออกจาก "เดินเข้ามา" คือ *ระยะห่างระหว่างเวลานัดกับเวลาที่เปิดบิล*
   * ไม่ใช่ตัวเวลานัดเอง
   */
  createdAtISO: string
  /**
   * 00071 P3 — เลื่อนนัด = O3 · ซ่อนปุ่มที่บทบาทไม่มีสิทธิ์ (ตัวบังคับจริงอยู่ที่ route)
   * (ปิดผล/ปิดงาน O4 ย้ายไป ServiceJobCard แล้ว — feature 00073)
   */
  canReschedule?: boolean
  /**
   * ส่งสรุปนัดเข้าแชท = H1 (ต้องมีห้องแชทให้ส่ง · และสรุปนัดมียอด/มัดจำ จึงไม่ให้ผู้ไม่เห็นเงินเปิดชีตนี้)
   * ค่าตั้งต้น false — ผู้เรียกต้องส่ง `can(roles,'H1')` เอง (00071 P3 · S-15)
   */
  canSendSummary?: boolean
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
  createdAtISO,
  canReschedule = true,
  canSendSummary = false,
}: Props) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  /** ชีต "ส่งสรุปนัด" (ส่วนขยาย 00024 2026-08-11) — ชีตขอข้อมูลเองจาก token ไม่รับ prop
   *  (สรุปนัดมีเบอร์ลูกค้า ส่งเป็น prop = โยน PII ลง flight payload ทุกครั้งที่เปิดหน้า) */
  const [summaryOpen, setSummaryOpen] = useState(false)

  const meta = APPOINTMENT_STAGE_META[stage]
  const terminal = isTerminalAppointmentStatus(stage)
  /** ลูกค้าขอเลื่อนแล้วรออยู่ — การ์ดต้องชี้ทางแก้ ไม่ใช่แค่ติดป้ายบอกว่ามีปัญหา */
  const awaitingReschedule = stage === 'RESCHEDULE_REQUESTED'

  const arrival = resolveArrivalMode({ serviceStart: startISO, createdAt: createdAtISO })

  return (
    <div
      className={cn(
        'card',
        // แถบซ้าย info = "ลูกค้ารออยู่" — สถานะเดียวในชุดนี้ที่ต้องการการลงมือของร้าน
        // ใช้สีเดียวกับป้ายสถานะของมันเอง (APPOINTMENT_STAGE_META.RESCHEDULE_REQUESTED)
        awaitingReschedule && 'border-info border-s-3',
      )}
    >
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h4 className="card-title">การนัดหมาย</h4>
        {/**
          * ชิป "วิธีเข้ารับบริการ" — โผล่เฉพาะ "เดินเข้ามา" (ไม่ใช่ค่าปกติของร้านจอง)
          * "จองล่วงหน้า" เป็นค่าปกติ ติดป้ายทุกใบจะกลายเป็นเสียงรบกวนที่ตาข้ามไปเอง
          * (การ์ดนี้ render เฉพาะใบที่มีเวลานัดแล้ว ⇒ ไม่มีเคส "ยังไม่ระบุเวลา" มาถึงที่นี่)
          */}
        {arrival === 'WALK_IN' && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
              ARRIVAL_MODE_META.WALK_IN.cls,
            )}
            title={ARRIVAL_MODE_META.WALK_IN.hint}
          >
            <Icon icon={ARRIVAL_MODE_META.WALK_IN.icon} className="shrink-0 text-sm" aria-hidden="true" />
            {ARRIVAL_MODE_META.WALK_IN.label}
          </span>
        )}
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
                  <span className="sr-only">ประเภทงาน </span>
                  {resourceName}
                </span>
              </div>
            </li>
          )}
        </ul>

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

        {/* ผู้ดูที่เลื่อนไม่ได้ (เช่นฝ่ายช่าง) เห็นคำขอแต่ไม่มีปุ่ม — บอกว่าต้องให้ใครทำต่อ */}
        {awaitingReschedule && !canReschedule && !terminal && (
          <p className="text-default-700 mb-0 mt-2 text-xs">ลูกค้าขอเลื่อนนัด ให้เจ้าของร้านหรือผู้ดูแลเลือกเวลาใหม่</p>
        )}

        {rescheduleCount > 0 && (
          <p className="text-default-500 mb-0 mt-2 text-xs">เลื่อนมาแล้ว {rescheduleCount} ครั้ง</p>
        )}

        {/* ไม่มีปุ่มสักอัน = ไม่ต้องมีเส้นประโดดเดี่ยว */}
        {!terminal && (canSendSummary || canReschedule) && (
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
             * โทนเบากว่าอีกสองปุ่มโดยตั้งใจ — **ไม่ใช่เพราะ "ส่งซ้ำได้ ไม่มีผลย้อนกลับไม่ได้"**
             * (คำนั้นเคยเขียนไว้ตรงนี้และ **ผิด**: ข้อความที่ออกไปหาลูกค้าแล้วถอนคืนไม่ได้ และระบบ
             * ไม่มี idempotent guard — กดสองครั้งลูกค้าได้การ์ดสองใบ) เหตุผลจริงคือมันไม่ใช่
             * action ที่ปิดจบของการ์ดใบนี้ ปิดผล/เลื่อนนัดต่างหากที่เป็น
             *
             * ปุ่มนี้ไม่ถูกซ่อนเมื่อลูกค้าไม่มีห้องแชท — ชีตเป็นคนบอกเหตุผล (ซ่อนปุ่มแล้วร้านจะ
             * คิดว่าฟีเจอร์ไม่มี แทนที่จะรู้ว่าติดอะไร)
             */}
            {canSendSummary && (
              <button
                type="button"
                onClick={() => setSummaryOpen(true)}
                className="btn bg-primary/10 text-primary-ink hover:bg-primary/20 mb-3 min-h-11 w-full"
              >
                <Icon icon="calendar-check" className="text-sm" aria-hidden="true" />
                ส่งสรุปนัด
              </button>
            )}
            {canReschedule && (
              <button
                type="button"
                onClick={() => setRescheduleOpen(true)}
                className="btn bg-default-100 text-default-800 hover:bg-default-200 mb-3 min-h-11 w-full"
              >
                <Icon icon="calendar-repeat" className="text-sm" aria-hidden="true" />
                {awaitingReschedule ? 'เลือกเวลาใหม่ให้ลูกค้า' : 'เลื่อนนัด'}
              </button>
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
      {/* ชีตเดียวกับอีก 2 จุดเรียก — ทุกจุดเปิดตัวนี้ ไม่มีจุดไหน "ส่งเลย" ข้ามชีต */}
      <AppointmentSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        orderToken={publicToken}
      />
    </div>
  )
}
