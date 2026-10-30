'use client'

/**
 * AppointmentDayRows — รายการนัดของ "หนึ่งวัน" (เวลา | ใครจอง | สถานะ)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentDateSheet.tsx
 *   (บล็อก `<ul className="flex flex-col gap-2">` ใต้หัวรายการ — ยกมาทั้งดุ้น ไม่ได้ออกแบบใหม่)
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/calendar/components/CalendarPage.tsx
 *
 * ทำไมต้องแยกไฟล์: แถวนี้ถูกใช้ 3 จอ (ชีตเลือกวันของ /orders/new · ชีตที่เปิดจากแชท ·
 * บอร์ดคิวงานบนมือถือ) ถ้าปล่อยให้ก็อปกันไป เวลาแก้ทรงแถวจะแก้ไม่ครบแล้วจอเดียวกันของผู้ขาย
 * จะพูดคนละภาษา — ปัญหาเดียวกับที่ชุดสีสถานะเคยถูกประกาศเป็นที่ที่สามแล้วเพี้ยนไป 2 ช่อง
 * (เหตุผลเต็มอยู่ที่หัว src/lib/appointment-stage.ts)
 *
 * คำ/สี/ไอคอนของสถานะมาจาก SSOT (`APPOINTMENT_STAGE_META` + `APPOINTMENT_STATUS_LABEL`)
 * ที่นี่ไม่ตั้งคำใหม่แม้แต่คำเดียว
 */

import Icon from '@/components/wrappers/Icon'
import { formatDayMonthTH, formatTimeHM } from '@/lib/format-date'
import { isAllDayAppointment, APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from '@/lib/appointments'
import { APPOINTMENT_STAGE_META, appointmentStageBadge } from '@/lib/appointment-stage'
import { ARRIVAL_MODE_META } from '@/lib/arrival-mode'
import { SERVICE_STATUS_META, serviceArrivalOf, serviceProgressBadge } from '@/lib/service-status'
import { assigneeAriaSuffix } from '@/lib/technician-jobs'
import AssigneeWhoLine from './AssigneeWhoLine'
import type { AppointmentBoardItem, AppointmentDayApiItem } from './types'

/**
 * แถวรายเดือน (ชีตเลือกวัน) ไม่มีผู้รับผิดชอบ/ความคืบหน้า — คีย์เหล่านี้มีเฉพาะแถวรายวัน (00086 P3)
 * จึงเป็น optional: ผู้เรียกที่ไม่เปิด `showAssignee` ส่งแถวรายเดือนได้เหมือนเดิม
 * createdAt/arrivalMode: ตัดสิน "หน้าร้าน → รับงานแล้ว" ด้วยตัวเดียวกับ AppointmentDayCard (MINOR-2)
 * start/end = null: งานที่ยังไม่ระบุเวลา (กลุ่ม "ยังไม่ระบุเวลา" ของหน้างานของฉัน · 00086 M1) — แถวอื่นมีเวลาเสมอ
 */
type RowItem = Omit<AppointmentBoardItem, 'start' | 'end'> & {
  start: string | null
  end: string | null
} & Partial<
    Pick<AppointmentDayApiItem, 'assignee' | 'serviceStartedAt' | 'serviceFinishedAt' | 'serviceClosedAt' | 'createdAt' | 'arrivalMode'>
  >

/** คอลัมน์เวลาของงานที่ยังไม่ระบุเวลา — คำ/ไอคอนจาก SSOT แบบการมา (ไม่ตั้งคำใหม่) */
const UNSCHEDULED = ARRIVAL_MODE_META.UNSCHEDULED

type Props = {
  items: RowItem[]
  /**
   * เติมชื่อคิวงานนำหน้าชื่อลูกค้า — เปิดเมื่อรายการรวมหลายคิว (ภาพรวมทั้งร้าน)
   *
   * อยู่บรรทัดเดียวกับชื่อลูกค้า ไม่แยกบรรทัด: รายการรวมทุกคิวยาวกว่าอยู่แล้ว การเพิ่มบรรทัด
   * ที่สามทำให้เห็นนัดต่อจอน้อยลงโดยไม่ได้ข้อมูลเพิ่ม (สูตรเดียวกับ AppointmentCalendar.tsx)
   */
  showResourceName?: boolean
  /**
   * กดแถวแล้วไปไหน — ไม่ส่ง = แถวเป็นข้อมูลเฉย ๆ กดไม่ได้
   *
   * ชีตที่เปิดจากฟอร์ม **ห้ามส่ง**: ผู้ใช้กำลังกรอกร่างค้างอยู่ กดออกไปแล้วสิ่งที่พิมพ์ไว้หาย
   * ส่วนบอร์ดใน /queues ส่งได้ เพราะที่นั่นไม่มีร่างอะไรค้าง
   */
  onRowClick?: (orderToken: string) => void
  /**
   * 00086 P3 — บรรทัดผู้รับผิดชอบ + ป้ายระหว่างทำงาน (กำลังให้บริการ / ทำเสร็จ · รอปิดงาน)
   * 🛑 ค่าตั้งต้นปิด: ชีตเลือกวันของฟอร์มสร้างงาน (AppointmentDateSheet) ต้องหน้าตาเดิมทุกตัวอักษร
   * เปิดเฉพาะหน้าแรกช่าง (TodayJobs) และหน้า "งานของฉัน"
   */
  showAssignee?: boolean
  /**
   * 00086 P3 — คอลัมน์เวลาแสดงวันที่บรรทัดบน (กลุ่ม "ค้างจากวันก่อน" — งานข้ามวัน เวลาอย่างเดียวอ่านผิดวัน)
   * ค่าตั้งต้นปิด = คอลัมน์เวลาเดิม
   */
  showDate?: boolean
  /**
   * 00086 (QA 2026-10-30) — ป้ายสถานะแบบงานบริการ (กำลังให้บริการ · ทำเสร็จ · รอปิดงาน · หน้าร้าน = "รอเริ่มงาน")
   * โดยไม่เปิดบรรทัดผู้รับผิดชอบ — รายการวันของบอร์ด /queues จอกลาง (ชีตมือถือใช้ AppointmentDayCard ซึ่งพูดแบบนี้อยู่แล้ว)
   * ไม่ส่ง = ตาม showAssignee (ผลเดิม)
   */
  serviceBadges?: boolean
}

export default function AppointmentDayRows({
  items,
  showResourceName = false,
  onRowClick,
  showAssignee = false,
  showDate = false,
  serviceBadges = showAssignee,
}: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => {
        // ไม่มีเวลา (start/end = null) = งานยังไม่ระบุเวลา — ไม่ new Date(null) (ได้ 1 ม.ค. 1970 แทนที่จะบอกว่าไม่มี)
        const start = it.start != null ? new Date(it.start) : null
        const end = it.end != null ? new Date(it.end) : null
        const timed = start && end ? { start, end } : null
        const allDay = timed ? isAllDayAppointment(timed.start, timed.end) : false
        const status = (it.appointmentStatus ?? 'SCHEDULED') as AppointmentStatus
        // ป้ายระหว่างทำงานมาจากตัวตัดสินเดียวกับการ์ด "งานนี้" (service-status) — เฉพาะเมื่อเปิด showAssignee
        const progress = serviceBadges ? serviceProgressBadge(it) : null
        /**
         * ป้ายสำรองเมื่อยังไม่เริ่มงาน — showAssignee (หน้าแรกช่าง/งานของฉัน) ใช้ตัวตัดสินเดียวกับ AppointmentDayCard (MINOR-2)
         * ⇒ งานหน้าร้านขึ้น "รอเริ่มงาน" ทุกจอ ไม่ใช่ "นัดแล้ว" ที่นี่แต่ "รอเริ่มงาน" บนตารางงาน
         * ไม่มีเวลา = ไม่มีนัด ⇒ "รอเริ่มงาน" (deriveServiceStatus: !hasAppointment → WALK_IN)
         * ปิด showAssignee (ชีตเลือกวันของฟอร์มสร้างงาน) = ป้ายนัดเดิมทุกตัวอักษร
         */
        const fallback = serviceBadges
          ? timed
            ? appointmentStageBadge(status, serviceArrivalOf({ arrivalMode: it.arrivalMode, serviceStart: it.start, createdAt: it.createdAt }))
            : { label: SERVICE_STATUS_META.WALK_IN.seller, cls: SERVICE_STATUS_META.WALK_IN.cls }
          : {
              label: APPOINTMENT_STATUS_LABEL[status] ?? APPOINTMENT_STATUS_LABEL.SCHEDULED,
              cls: (APPOINTMENT_STAGE_META[status] ?? APPOINTMENT_STAGE_META.SCHEDULED).cls,
            }
        const meta = progress ?? fallback
        const label = progress?.label ?? fallback.label
        const who = it.buyerName || 'ไม่ระบุชื่อ'

        const body = (
          <>
            <span className="text-dark w-14 shrink-0 text-sm font-semibold tabular-nums">
              {!timed ? (
                // ไอคอนบรรทัดบน + คำบรรทัดล่าง = จังหวะสองบรรทัดเดียวกับ "เวลาเริ่ม / – เวลาจบ"
                <span className="text-warning-ink block text-xs font-medium leading-tight">
                  <Icon icon={UNSCHEDULED.icon} className="block size-4" aria-hidden="true" />
                  {UNSCHEDULED.label}
                </span>
              ) : (
                <>
                  {showDate && (
                    <span className="text-default-700 block text-xs font-medium">{formatDayMonthTH(timed.start)}</span>
                  )}
                  {allDay ? (
                    'ทั้งวัน'
                  ) : (
                    <>
                      {formatTimeHM(timed.start)}
                      <span className="text-default-500 block text-xs font-normal">
                        – {formatTimeHM(timed.end)}
                      </span>
                    </>
                  )}
                </>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-dark block truncate text-sm font-medium">
                {showResourceName && it.resource?.name ? (
                  <>
                    <span className="text-default-500 font-normal">{it.resource.name} · </span>
                    {who}
                  </>
                ) : (
                  who
                )}
              </span>
              {/* truncate ให้ตรงกับบรรทัดชื่อเหนือมัน — `.card` มี break-words ซึ่ง inherit ลงมา
                  เลขออเดอร์ 17 ตัวจึงไม่ล้นออกนอกกล่องแต่ **หักบรรทัดกลางคำ 3 บรรทัด** แทน
                  ทำให้แถวสูงไม่เท่ากันทั้งรายการ (impeccable audit 2026-08-11) */}
              {it.orderNo && (
                <span className="text-default-500 block truncate text-xs tabular-nums">
                  #{it.orderNo}
                </span>
              )}
              {showAssignee && <AssigneeWhoLine name={it.assignee?.displayName ?? null} />}
              {/* critique P1-10 — showAssignee (งานของฉัน "ทั้งร้าน"): ป้ายเป็นบรรทัดที่ 3 ในคอลัมน์นี้
                  ที่ 390px ป้ายยาว ("ทำเสร็จ · รอปิดงาน") เป็น sibling แล้วกินคอลัมน์จนชื่อลูกค้า/ผู้รับผิดชอบถูกตัด
                  (flex-wrap ของแถวไม่ช่วย — คอลัมน์ flex-1 หดก่อนตัดสิน wrap) · ไม่ส่ง showAssignee = ตำแหน่งเดิม */}
              {showAssignee && <span className={`badge mt-1 ${meta.cls}`}>{label}</span>}
            </span>
            {/* 🛑 ที่ 320px คอลัมน์ชื่อเหลือ ~40px (≈3 ตัวอักษรไทย) เมื่อป้าย "ลูกค้ายืนยันแล้ว"
                กินไป ~92px — flex ตัดสิน wrap จากขนาดเนื้อหาเต็ม *ก่อน* หด (flex-header-truncation.md)
                จึงใช้ flex-wrap ที่แถว: ชื่อยาว = ป้ายตกบรรทัดใหม่เอง ชื่อสั้น = อยู่แถวเดียวเหมือนเดิม
                ป้ายกับ chevron ห่อรวมกันเพื่อให้ตกบรรทัดไปด้วยกัน ไม่ใช่แยกกันคนละบรรทัด */}
            {!showAssignee && <span className={`badge shrink-0 ${meta.cls}`}>{label}</span>}
          </>
        )

        return (
          <li key={it.orderToken}>
            {onRowClick ? (
              /* ปุ่มจริง ไม่ใช่ div ที่ผูก onClick — ต้อง Tab ถึงและ Enter ได้
                 ชื่อสำหรับ AT ประกอบเองเพราะเนื้อในเป็นชิ้นส่วนหลายชิ้น ถ้าปล่อยให้ AT อ่านเอง
                 จะได้ "09:00 – 10:00 ช่างเอ · สมชาย #DP… นัดแล้ว" ซึ่งอ่านไม่ออกว่าปุ่มนี้ทำอะไร */
              <button
                type="button"
                onClick={() => onRowClick(it.orderToken)}
                /* 🛑 ชื่อจากผู้เขียนบน <button> **แทนที่** เนื้อในทั้งก้อน ไม่ได้เติมเข้าไป —
                   ป้ายสั้น ๆ ว่า "เปิดรายละเอียดของ สมชาย" จึงทำให้ผู้ใช้ screen reader ไม่ได้ยิน
                   เวลา ชื่อคิว และสถานะเลยสักตัว ทั้งที่สามอย่างนั้นคือเนื้อหาทั้งหมดของแถว
                   และแถวเดียวกันนี้ในชีต (ไม่ส่ง onRowClick) เป็น <span> ที่อ่านครบ
                   = รายการเดียวกันอ่านได้ไม่เท่ากันสองจอ. ประกอบประโยคให้ครบ อย่าตัดทิ้ง */
                /* `·` ถูก screen reader ข้ามเป็นความว่าง — ชิ้นส่วนต่อกันจึงฟังเป็นรายการ
                   ไม่ใช่ประโยค · และคำที่บอกว่า "กดแล้วจะเกิดอะไร" ต้องมาก่อน ไม่ใช่ท้ายสุด
                   (ไม่ตัดข้อมูลออกสักตัว แค่เรียงใหม่ + เติมคำเชื่อม) */
                aria-label={
                  `เปิดรายละเอียดนัดของ ${who}` +
                  (showResourceName && it.resource?.name ? ` ประเภทงาน ${it.resource.name}` : '') +
                  (!timed
                    ? ` ${UNSCHEDULED.label}`
                    : (showDate ? ` วันที่ ${formatDayMonthTH(timed.start)}` : '') +
                      (allDay ? ' ทั้งวัน' : ` เวลา ${formatTimeHM(timed.start)} ถึง ${formatTimeHM(timed.end)}`)) +
                  ` สถานะ ${label}` +
                  (it.orderNo ? ` เลขที่ ${it.orderNo}` : '') +
                  // 00086 P3 — who-line อยู่ในเนื้อใน ซึ่งถูกชื่อนี้แทนที่ ⇒ ต้องต่อเข้าไปเอง
                  (showAssignee ? assigneeAriaSuffix(it.assignee) : '')
                }
                className="bg-card focus-visible:ring-primary flex w-full flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg p-3 text-start transition-colors hover:bg-default-50 focus-visible:ring-2 focus-visible:outline-none"
              >
                {body}
                <Icon
                  icon="chevron-right"
                  className="text-default-400 mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="bg-card flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg p-3">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
