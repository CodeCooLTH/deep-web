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
import { formatTimeHM } from '@/lib/format-date'
import { isAllDayAppointment, APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from '@/lib/appointments'
import { APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'
import type { AppointmentBoardItem } from './types'

type Props = {
  items: AppointmentBoardItem[]
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
}

export default function AppointmentDayRows({ items, showResourceName = false, onRowClick }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => {
        const start = new Date(it.start)
        const end = new Date(it.end)
        const allDay = isAllDayAppointment(start, end)
        const status = (it.appointmentStatus ?? 'SCHEDULED') as AppointmentStatus
        const meta = APPOINTMENT_STAGE_META[status] ?? APPOINTMENT_STAGE_META.SCHEDULED
        const label = APPOINTMENT_STATUS_LABEL[status] ?? APPOINTMENT_STATUS_LABEL.SCHEDULED
        const who = it.buyerName || 'ไม่ระบุชื่อ'

        const body = (
          <>
            <span className="text-dark w-14 shrink-0 text-sm font-semibold tabular-nums">
              {allDay ? (
                'ทั้งวัน'
              ) : (
                <>
                  {formatTimeHM(start)}
                  <span className="text-default-500 block text-xs font-normal">
                    – {formatTimeHM(end)}
                  </span>
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
              {it.orderNo && (
                <span className="text-default-500 block text-xs tabular-nums">#{it.orderNo}</span>
              )}
            </span>
            <span className={`badge shrink-0 ${meta.cls}`}>{label}</span>
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
                aria-label={[
                  allDay ? 'ทั้งวัน' : `${formatTimeHM(start)} ถึง ${formatTimeHM(end)}`,
                  showResourceName && it.resource?.name ? it.resource.name : null,
                  who,
                  label,
                  it.orderNo ? `เลขที่ ${it.orderNo}` : null,
                  'เปิดรายละเอียด',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                className="bg-card focus-visible:ring-primary flex w-full items-start gap-3 rounded-lg p-3 text-start transition-colors hover:bg-default-50 focus-visible:ring-2 focus-visible:outline-none"
              >
                {body}
                <Icon
                  icon="chevron-right"
                  className="text-default-400 mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="bg-card flex items-start gap-3 rounded-lg p-3">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
