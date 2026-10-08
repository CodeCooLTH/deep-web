'use client'

/**
 * ScheduleCard — เวลาส่ง: รายวัน (switch + chip เวลา + เพิ่มเวลา) · รายเดือน (switch + วันตัดรอบ) · ข้ามถ้าไม่มีรายการ · แนบยอดสะสม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (`form-switch`/`form-checkbox`)
 *   + theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (native `<select className="form-select">` — ไม่ใช้ dropdown ของ Preline/FilterDropdown: autosave re-render บ่อย)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (chip เวลา) · theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (แถบ info)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/order-agent/OrderAgentClient.tsx (chip `bg-primary/10 text-primary` + ปุ่ม ×)
 *
 * ช่วงวันตัดรอบอ่านจาก `cycle` ที่ server คำนวณ (ห้ามคำนวณซ้ำ) · ปุ่ม/สวิตช์ที่ปิดได้ตัดสินจาก `settings-guards` · ค่าที่เปลี่ยนส่งผ่าน `onChange` (useAutosave)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatDayMonthTH } from '@/lib/format-date'
import type { SettingsPatch } from '@/lib/line-report/autosave'
import { slotLabel } from '@/lib/line-report/schedule'
import {
  CUTOFF_OPTIONS,
  ENABLE_NEEDS_TIME_HELPER,
  NEEDS_TIME_HELPER,
  TIMES_FULL_HELPER,
  addableSlots,
  canAddTime,
  canEnableSend,
  canRemoveTime,
  cutoffFromValue,
  cutoffLabel,
  cutoffToValue,
  isAutoReportOff,
  withTime,
  withoutTime,
} from '@/lib/line-report/settings-guards'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { CheckRow, SwitchRow } from './Rows'

const day = (iso: string) => formatDayMonthTH(`${iso}T00:00:00+07:00`)

export default function ScheduleCard({
  settings,
  cycle,
  canEdit,
  orderWord,
  onChange,
}: {
  settings: GroupDetailDto['settings']
  cycle: GroupDetailDto['cycle']
  canEdit: boolean
  orderWord: string
  onChange: (patch: SettingsPatch) => void
}) {
  const [pick, setPick] = useState('')
  const times = settings.dailyTimes
  const canAdd = canAddTime(times)
  const canRemove = canRemoveTime(times, settings)
  const enableOk = canEnableSend(times)
  const options = addableSlots(times)
  const attach = settings.attachCycleToDaily && settings.monthlyEnabled

  const timesHelper = !canAdd ? TIMES_FULL_HELPER : !canRemove ? NEEDS_TIME_HELPER : 'เลือกได้สูงสุด 4 เวลา ทีละ 30 นาที'

  return (
    <section className="card rounded-xl border border-default-300 shadow-sm order-2">
      <div className="card-header">
        <h5 className="card-title flex items-center gap-2">
          <Icon icon="clock" className="text-primary text-lg" aria-hidden="true" />
          เวลาส่ง
        </h5>
      </div>
      <div className="card-body">
        {isAutoReportOff(settings) && (
          <div role="status" className="bg-info/15 text-info-ink mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="info-circle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <p className="mb-0">ตอนนี้ยังไม่ได้เปิดรายงานอัตโนมัติ กลุ่มนี้จะได้รับสรุปเมื่อมีคนพิมพ์ “สรุปวันนี้” “สรุปเมื่อวาน” หรือ “สรุปเดือนนี้” เท่านั้น</p>
          </div>
        )}

        <SwitchRow
          label="รายวัน"
          sub={settings.dailyEnabled ? timesHelper : 'ปิดอยู่'}
          checked={settings.dailyEnabled}
          disabled={!canEdit || (!settings.dailyEnabled && !enableOk)}
          onChange={(v) => onChange({ dailyEnabled: v })}
        />
        {!settings.dailyEnabled && !enableOk && <p className="text-default-700 mb-0 text-xs">{ENABLE_NEEDS_TIME_HELPER}</p>}

        {/* เวลาอยู่ตลอด แม้รายวันปิด — รายเดือนส่งที่เวลาแรกของรายการนี้ */}
        <ul role="list" className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
          {times.map((m) => (
            <li key={m} className="bg-primary/10 text-primary inline-flex items-center rounded-full ps-3 text-sm font-medium tabular-nums">
              {slotLabel(m)}
              <button
                type="button"
                aria-label={`ลบเวลา ${slotLabel(m)}`}
                disabled={!canEdit || !canRemove}
                onClick={() => onChange({ dailyTimes: withoutTime(times, m) })}
                className="text-primary hover:bg-primary/15 flex size-11 items-center justify-center rounded-full disabled:opacity-40 lg:size-8"
              >
                <Icon icon="x" className="text-base" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="form-select w-auto"
            aria-label="เลือกเวลา"
            value={pick}
            disabled={!canEdit || !canAdd}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">เลือกเวลา</option>
            {options.map((o) => (
              <option key={o.minutes} value={o.minutes}>
                {o.minutes === 1440 ? '24:00 — สรุปทั้งวันที่เพิ่งจบ' : o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!canEdit || !canAdd || pick === ''}
            onClick={() => {
              onChange({ dailyTimes: withTime(times, Number(pick)) })
              setPick('')
            }}
            className="btn border-default-300 text-default-800 hover:bg-default-100 inline-flex min-h-11 items-center gap-1.5 border lg:min-h-0"
          >
            <Icon icon="plus" className="text-base" aria-hidden="true" />
            เพิ่มเวลา
          </button>
        </div>
        {!settings.dailyEnabled && <p className="text-default-700 mt-2 mb-0 text-xs">{timesHelper}</p>}

        <div className="border-default-300 my-base border-t border-dashed" />

        <SwitchRow
          label="รายเดือน"
          sub={settings.monthlyEnabled ? 'ส่งที่เวลาแรกของรายวัน ในวันถัดจากวันตัดรอบ' : 'ปิดอยู่'}
          checked={settings.monthlyEnabled}
          disabled={!canEdit || (!settings.monthlyEnabled && !enableOk)}
          onChange={(v) => onChange({ monthlyEnabled: v })}
        />
        {!settings.monthlyEnabled && !enableOk && <p className="text-default-700 mb-0 text-xs">{ENABLE_NEEDS_TIME_HELPER}</p>}
        {settings.monthlyEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="line-report-cutoff" className="text-default-800 text-sm">
              วันตัดรอบ
            </label>
            <select
              id="line-report-cutoff"
              className="form-select w-auto"
              value={cutoffToValue(settings.cutoffDay)}
              disabled={!canEdit}
              onChange={(e) => onChange({ cutoffDay: cutoffFromValue(e.target.value) })}
            >
              {CUTOFF_OPTIONS.map((d) => (
                <option key={cutoffToValue(d)} value={cutoffToValue(d)}>
                  {cutoffLabel(d)}
                </option>
              ))}
            </select>
          </div>
        )}
        {settings.monthlyEnabled && cycle && (
          <p className="text-default-700 mt-2 mb-0 text-xs">
            ตัวอย่าง: ตัดรอบ{cutoffLabel(settings.cutoffDay)} ได้รอบ {day(cycle.startIso)} – {day(cycle.endIso)} และส่งวันที่ {day(cycle.nextFireDate)}
            {times[0] !== undefined ? ` ${slotLabel(times[0])}` : ''}
          </p>
        )}

        <div className="border-default-300 my-base border-t border-dashed" />

        <CheckRow
          label="ไม่ส่งถ้าไม่มีรายการ"
          sub={`ถ้าช่วงนั้นไม่มี${orderWord}เลย ระบบจะข้ามและบันทึกในประวัติว่าข้าม`}
          checked={settings.skipWhenNoOrders}
          disabled={!canEdit}
          onChange={(v) => onChange({ skipWhenNoOrders: v })}
        />
        <CheckRow
          label="แนบยอดสะสมรอบนี้ในรายงานรายวัน"
          sub={settings.monthlyEnabled ? 'ใต้ยอดของวัน จะมียอดรวมตั้งแต่วันตัดรอบถึงวันนี้' : 'เปิดรายงานรายเดือนก่อน จึงจะรู้ว่ารอบนี้เริ่มวันไหน'}
          checked={attach}
          disabled={!canEdit || !settings.monthlyEnabled}
          onChange={(v) => onChange({ attachCycleToDaily: v })}
        />
      </div>
    </section>
  )
}
