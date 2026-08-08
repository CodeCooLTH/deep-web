'use client'

/**
 * OrderDateFilterDropdown — ตัวกรอง "ช่วงเวลา" ที่เลือกวันเจาะจงได้ (user สั่ง 2026-08-08:
 * "เพิ่ม filter ให้ระบุวันที่ได้ เช่นวันที่ 1 สิงหา")
 *
 * Base: src/components/safepay/FilterDropdown.tsx — คัดลอกโครง trigger + panel +
 *   click-outside + Escape + `.dropdown-item` + check icon มาทั้งชุด
 *
 * ทำไมไม่แก้ FilterDropdown เดิม: มัน render ได้แค่ list ของ {value,label,badge} ล้วน
 * การยัดโหมดที่มี input เข้าไปจะกระทบ call site อื่นทุกตัวในหน้านี้ (สถานะ · พัสดุ ·
 * สถานะนัด · ขนส่ง · แถวละ N) ซึ่งไม่ได้ต้องการอะไรแบบนี้เลย
 *
 * ทำไมใช้ <input type="date"> ไม่ใช่ Flatpickr ที่ /sales กับ /expenses ใช้:
 *   1. ปฏิทินป๊อปของ Flatpickr เปิดเป็น element ในหน้า → เสี่ยงโดน overflow ของแผง
 *      dropdown/กล่อง scroll ตัด ซึ่งเป็นคลาสบั๊กที่โปรเจกต์นี้เจอซ้ำจนต้องเขียน convention
 *      (docs/conventions/scroll-container-clips-popovers.md) · native picker เปิดที่ระดับ OS
 *      ตัดไม่ได้ไม่ว่าแผงจะซ้อนอยู่ในอะไร
 *   2. มี precedent ใน (paces) แล้ว 3 จุด (bookings/BookingForm, expenses/ExpenseFormModal)
 *      ที่ใช้ `<input type="date" className="form-input">` — ไม่ใช่ UI ที่ประกอบขึ้นเอง
 *   3. หน้า orders ยังไม่เคย import Flatpickr เลย
 * ข้อแลก: chrome ของ native picker แสดงปี ค.ศ. (ข้อจำกัดของ browser — Flatpickr ที่
 * /sales,/expenses ก็แสดง ค.ศ. เหมือนกัน ไม่ใช่ regression ใหม่) จึงบังคับให้ **ป้ายบนปุ่ม
 * และในเมนูเป็น พ.ศ. เสมอ** ผ่าน formatDayMonthTH/formatDateTH ซึ่งเป็นสิ่งที่ค้างบนจอจริง
 */

import { useEffect, useState } from 'react'
import FilterDropdownShell from '@/components/safepay/FilterDropdownShell'
import Icon from '@/components/wrappers/Icon'
import { formatDateTH, formatDayMonthTH } from '@/lib/format-date'
import { ORDER_DATE_PRESETS, isSpecificDay, type OrderDatePreset } from '@/lib/order-date-filter'

type Props = {
  /** 'All' | preset | 'YYYY-MM-DD' */
  value: string
  onChange: (value: string) => void
  className?: string
}

const PRESET_ENTRIES = Object.entries(ORDER_DATE_PRESETS) as [OrderDatePreset, string][]

export default function OrderDateFilterDropdown({ value, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  /** สลับระหว่างรายการค่าสำเร็จรูป กับช่องเลือกวัน — ไม่ปิดแผงตอนสลับ */
  const [mode, setMode] = useState<'list' | 'custom'>('list')

  // เปิดแผงใหม่ทุกครั้งเริ่มที่รายการเสมอ ไม่ค้างโหมดจากครั้งก่อน
  useEffect(() => {
    if (!open) setMode('list')
  }, [open])

  const customDay = isSpecificDay(value) ? value : null
  const isActive = value !== 'All'
  const triggerLabel = customDay
    ? formatDayMonthTH(`${customDay}T00:00:00+07:00`)
    : (ORDER_DATE_PRESETS[value as OrderDatePreset] ?? 'ช่วงเวลา')

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <FilterDropdownShell
      isActive={isActive}
      open={open}
      onOpenChange={setOpen}
      className={className}
      panelClassName='min-w-52'
      /* โหมด custom ไม่ใช่เมนู — ประกาศ "menu" ค้างไว้จะบอก assistive tech ผิด */
      haspopup={mode === 'list' ? 'menu' : 'dialog'}
      triggerContent={
        <>
          <Icon icon='calendar' className='text-base' />
          {value === 'All' ? 'ช่วงเวลา' : triggerLabel}
        </>
      }
    >
      {/* role อยู่ที่เนื้อหา ไม่ใช่เปลือก — สองโหมดเป็นคนละชนิด (list = เมนูให้เลือก ·
          custom = กลุ่มควบคุมที่มี input) ถ้าประกาศ role="menu" ที่เปลือก โหมด custom จะ
          กลายเป็น "เมนูที่ไม่มีรายการ" ในสายตา screen reader (audit P2-1) */}
      {mode === 'list' ? (
        <div role='menu' aria-orientation='vertical'>
          {PRESET_ENTRIES.map(([key, label]) => {
            const active = value === key
            return (
              <button
                key={key}
                type='button'
                role='menuitem'
                className={`dropdown-item ${active ? 'active' : ''}`}
                onClick={() => pick(key)}
              >
                {active ? (
                  <Icon icon='check' className='text-primary size-4 shrink-0' />
                ) : (
                  <span className='size-4 shrink-0' aria-hidden='true' />
                )}
                <span className='min-w-0 flex-1 truncate text-start'>{label}</span>
              </button>
            )
          })}

          {/* เส้นประคั่น — signature ของ Paces (ไม่ใช่เส้นทึบ) บอกว่าของข้างล่างเป็นคนละชนิด
                  กับค่าสำเร็จรูปข้างบน: อันนั้นเลือกแล้วจบ อันนี้เปิดขั้นตอนต่อ */}
          <div className='border-default-300 my-1 border-t border-dashed' aria-hidden='true' />

          <button
            type='button'
            role='menuitem'
            className={`dropdown-item ${customDay ? 'active' : ''}`}
            onClick={() => setMode('custom')}
          >
            {customDay ? (
              <Icon icon='check' className='text-primary size-4 shrink-0' />
            ) : (
              <span className='size-4 shrink-0' aria-hidden='true' />
            )}
            <span className='min-w-0 flex-1 text-start'>
              <span className='block truncate'>เลือกวันที่...</span>
              {/* ในเมนูมีที่พอ จึงโชว์ พ.ศ. เต็มรูป ต่างจากปุ่มที่ต้องสั้น */}
              {customDay && (
                <span className='text-default-500 block truncate text-xs'>
                  {formatDateTH(`${customDay}T00:00:00+07:00`)}
                </span>
              )}
            </span>
            <Icon icon='chevron-right' className='text-default-400 size-4 shrink-0' />
          </button>
        </div>
      ) : (
        <div className='p-2' role='group' aria-label='เลือกวันที่เจาะจง'>
          <button
            type='button'
            onClick={() => setMode('list')}
            className='text-default-600 hover:text-default-900 mb-2 inline-flex items-center gap-1 text-xs'
          >
            <Icon icon='chevron-left' className='size-4' aria-hidden='true' />
            กลับ
          </button>
          <div className='input-icon-group'>
            <Icon icon='calendar-search' className='input-icon' />
            <input
              type='date'
              className='form-input'
              aria-label='เลือกวันที่ของคำสั่งซื้อ'
              defaultValue={customDay ?? ''}
              onChange={e => {
                // ค่าที่ native คืนคือ "YYYY-MM-DD" ปฏิทินสากล ตรงรูปกับ thaiDayKey พอดี
                // (ดูคอมเมนต์ที่ thaiDayKey: เป็นคีย์ ค.ศ. ไม่ใช่ค่าแสดงผล) จึงเทียบตรงได้
                if (e.target.value) pick(e.target.value)
              }}
            />
          </div>
        </div>
      )}
    </FilterDropdownShell>
  )
}
