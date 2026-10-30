/**
 * ป้าย "ว่างช่วงนี้ / ติดงาน HH:mm–HH:mm" + "วันนี้ N งาน" ของช่างหนึ่งคน (00086 · มติ 2026-10-30 · prototype v16)
 * ใช้ในแถวของ AssigneeSheet และช่องที่เลือกของ AssigneePicker — คำและสีชุดเดียวกัน
 */
import Icon from '@/components/wrappers/Icon'
import type { StaffLoad } from '@/lib/assignee-load'
import { formatTimeHM } from '@/lib/format-date'

export default function StaffLoadLine({ load, sameDay }: { load: StaffLoad; sameDay: boolean }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {load.clash ? (
        <span className="badge bg-warning/15 text-warning-ink inline-flex items-center gap-1">
          <Icon icon="clock" aria-hidden="true" />
          ติดงาน {formatTimeHM(load.clash.start)}–{formatTimeHM(load.clash.end)}
        </span>
      ) : (
        <span className="badge bg-success/15 text-success-ink inline-flex items-center gap-1">
          <Icon icon="check" aria-hidden="true" />
          ว่างช่วงนี้
        </span>
      )}
      <span className="text-default-700 text-xs">{sameDay ? 'วันนี้' : 'วันนั้น'} {load.dayJobs} งาน</span>
    </span>
  )
}
