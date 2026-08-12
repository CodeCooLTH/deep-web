'use client'

/**
 * AppointmentDayList — รายการนัดของหนึ่งวัน จัดกลุ่มตามช่วงเวลา (ส่วนขยาย 2026-08-11)
 *
 * Base (หัวกลุ่ม + เส้นประคั่น + การ์ดในลิสต์):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 *   (`h6.text-xs.font-bold.text-default-400` คั่นกลุ่ม + `after:border-dashed`)
 *
 * 🛑 ทำไมต้องจัดกลุ่ม: ของเดิมพิมพ์ "09:00 / –10:00" ซ้ำห้าบรรทัดติดกันสำหรับนัดที่เวลาเดียวกัน
 * ทั้งที่มันคือค่าเดียวกัน ส่วนตัวที่ต่างกันจริง (ชื่อคน) ถูกบีบให้เล็กกว่า — สิ่งที่ซ้ำทุกใบ
 * ต้องยกไปพูดครั้งเดียว
 *
 * ตรรกะทั้งหมด (จัดกลุ่ม / ยุบกลุ่ม / โผล่ปุ่ม) อยู่ที่ src/lib/appointment-day-view.ts
 * ที่นี่มีแต่การวาด — เขียนกลับด้านแล้วเทส [blocker] ที่นั่นต้องแดง
 */

import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatTimeHM } from '@/lib/format-date'
import { groupAppointmentsBySlot, isSlotFullyClosed } from '@/lib/appointment-day-view'
import AppointmentDayCard from './AppointmentDayCard'
import type { AppointmentDayApiItem } from './types'

type Props = {
  items: AppointmentDayApiItem[]
  showResourceName?: boolean
  /** true = วันที่กำลังดูคือวันนี้ → วาดเส้น "ตอนนี้" คั่นกลุ่ม */
  isToday: boolean
  /** เวลาปัจจุบัน — ผู้เรียกถือไว้ตัวเดียวและเดินเองทุกนาที (ดู AppointmentDaySheet) */
  now: Date
  onChanged: () => void
}

/** กลุ่มที่ปิดผลครบแล้วเริ่มต้นเป็น "ยุบ" — ผู้ใช้กางเองได้ และสถานะการกางไม่ข้ามวัน */
export default function AppointmentDayList({
  items,
  showResourceName = false,
  isToday,
  now,
  onChanged,
}: Props) {
  const groups = useMemo(() => groupAppointmentsBySlot(items), [items])
  /** คีย์ของกลุ่มที่ผู้ใช้กดกางเอง — เก็บเป็น "ข้อยกเว้น" ไม่ใช่สถานะของทุกกลุ่ม
   *  (กลุ่มที่ยังไม่ปิดผลไม่มีสิทธิ์ยุบอยู่แล้ว จึงไม่ต้องมีสถานะ) */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const nowMs = now.getTime()

  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group, gi) => {
        const collapsible = isSlotFullyClosed(group.items)
        const open = !collapsible || expanded.has(group.key)
        const first = new Date(group.items[0].start).getTime()
        /**
         * เส้น "ตอนนี้" คั่น **ก่อน** กลุ่มแรกที่ยังมาไม่ถึง — วาดได้ครั้งเดียวต่อวัน
         * และเฉพาะตอนดูวันนี้ (วันอื่นคำว่า "ตอนนี้" ไม่มีความหมาย)
         * กลุ่มทั้งวันไม่นับ: มันไม่มีตำแหน่งในลำดับเวลา
         */
        const prevStart = gi > 0 ? new Date(groups[gi - 1].items[0].start).getTime() : -Infinity
        const showNowLine =
          isToday && !group.allDay && first > nowMs && prevStart <= nowMs

        return (
          <li key={group.key}>
            {showNowLine ? (
              <div className="mb-2 flex items-center gap-2" aria-hidden="true">
                <span className="bg-primary size-2 shrink-0 rounded-full" />
                <span className="bg-primary/40 h-px flex-1" />
                <span className="text-primary-ink text-2xs font-semibold tabular-nums">
                  ตอนนี้ {formatTimeHM(now)}
                </span>
              </div>
            ) : null}

            {collapsible && !open ? (
              /* ปิดผลครบทั้งกลุ่ม = ยุบเหลือบรรทัดเดียว · เหลือค้างใบเดียวก็กางทั้งกลุ่ม
                 (เกณฑ์อยู่ที่ isSlotFullyClosed — กลุ่มว่างไม่ยุบ) */
              <button
                type="button"
                onClick={() => setExpanded((s) => new Set(s).add(group.key))}
                className="border-default-300 bg-card hover:bg-default-50 flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed px-3 text-start"
              >
                <span className="text-default-500 text-sm font-semibold tabular-nums">
                  {group.allDay ? 'ทั้งวัน' : group.label}
                </span>
                <span className="text-default-500 truncate text-xs">
                  {group.items.length} นัด · จบแล้วทั้งกลุ่ม
                </span>
                <Icon icon="chevron-down" className="text-default-400 ms-auto size-4 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <>
                <div className="flex items-baseline gap-2 px-1 pt-1 pb-1.5">
                  <h5 className="text-default-800 text-sm font-semibold tabular-nums">
                    {group.allDay ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Icon icon="sun" className="size-3.5" aria-hidden="true" />
                        ทั้งวัน
                      </span>
                    ) : (
                      group.label
                    )}
                  </h5>
                  {/* 🛑 หน่วยต้องเป็น "นัด" ให้ตรงกับตัวนับบนหัวชีต — เดิมเขียน "คิว" ซึ่งชนกับ
                      คำว่า "คิวงาน" ที่ในระบบนี้แปลว่า *ช่างผู้รับงาน* (seller-menu.ts:71-72)
                      "2 คิว" จึงอ่านได้ว่า "ช่าง 2 คน" ซึ่งผิด (impeccable clarify 2026-08-12) */}
                  <span className="text-default-500 ms-auto text-2xs">{group.items.length} นัด</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {group.items.map((it) => (
                    <li key={it.orderToken}>
                      <AppointmentDayCard
                        item={it}
                        showResourceName={showResourceName}
                        now={now}
                        onChanged={onChanged}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        )
      })}

      {/* ทุกกลุ่มผ่านไปหมดแล้วและเป็นวันนี้ → เส้นตอนนี้ไปอยู่ท้ายสุด (ไม่งั้นมันจะหายไปเฉย ๆ
          ในวันที่งานเสร็จหมดตั้งแต่เช้า ซึ่งเป็นวันที่ผู้ขายอยากเห็นมากที่สุดว่า "จบแล้ว") */}
      {isToday &&
      groups.length > 0 &&
      groups.every((g) => g.allDay || new Date(g.items[0].start).getTime() <= nowMs) ? (
        <li aria-hidden="true">
          <div className="flex items-center gap-2">
            <span className="bg-primary size-2 shrink-0 rounded-full" />
            <span className="bg-primary/40 h-px flex-1" />
            <span className="text-primary-ink text-2xs font-semibold tabular-nums">
              ตอนนี้ {formatTimeHM(now)}
            </span>
          </div>
        </li>
      ) : null}
    </ul>
  )
}
