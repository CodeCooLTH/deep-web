'use client'

/**
 * OrderDateRow — แถว "วันที่สั่งซื้อ" ในฟอร์มสร้าง/แก้ไขคำสั่งซื้อ (feature 00033)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *       (form-label + form-input) ผ่าน src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:78-90
 *       ซึ่ง copy pattern input type="datetime-local" มาแล้ว
 * ปุ่ม ghost/soft: docs/system/ui-guideline/paces-component-reference.md §1
 *   (คลาส ghost ที่ Bootstrap/DaisyUI มีแต่ Paces ไม่มีจริง — ghost ที่ถูกต้องคือ `btn text-primary hover:bg-primary hover:text-white`)
 *
 * ยุบไว้เป็นค่าตั้งต้น (มติ D-7): ~95% ของการคีย์คือ "ตอนนี้" — ช่องกรอกที่โผล่ตลอดเวลา
 * เพิ่มภาระสายตาให้ทุกคนเพื่อคนส่วนน้อย
 * ผ่าน ux gate แล้ว — ดู .superpowers/sdd/2026-08-06-backdated-order-date/task-9-ux-rulings.md
 */
import { useState } from 'react'
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { orderDateWindow, orderDateRejectReason } from '@/lib/order-date-window'
import { formatOrderDateLabel, formatDateTH } from '@/lib/format-date'
import type { FormValues } from './OrderCreateForm'

/** Date → ค่าของ input type="datetime-local" ("YYYY-MM-DDTHH:mm" เวลาเครื่อง) */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Props = {
  control: Control<FormValues>
  setValue: UseFormSetValue<FormValues>
  /** ค่านี้มาจากเวลาของข้อความในแชท (feature 00033 §9.4) — โชว์ชิปบอกที่มา + เปิดช่องค้างไว้เอง
   *  ผู้ขายต้องเห็นทันทีว่ากำลังลงวันย้อนหลังอยู่ */
  fromMessage?: boolean
  /** เวลาข้อความต้นทางเก่ากว่าเพดานย้อนหลัง จึงไม่ได้เติมให้ (Task 10 ฝั่งแชทเป็นคนคำนวณค่านี้ —
   *  ที่นี่แค่เปิดทางรับมาโชว์ชิปเตือน) */
  messageTooOld?: boolean
}

export default function OrderDateRow({ control, setValue, fromMessage, messageTooOld }: Props) {
  // เปิดช่องค้างไว้เลยเมื่อค่ามาจากข้อความ — ปกติ/แก้ไขออเดอร์เดิม = ยุบ
  const [editing, setEditing] = useState(!!fromMessage)
  const now = new Date()
  const { minMs, maxMs } = orderDateWindow(now.getTime())

  return (
    <div>
      <span className="form-label">วันที่สั่งซื้อ</span>
      <Controller
        control={control}
        name="orderedAt"
        render={({ field }) => {
          const current = field.value ? new Date(field.value) : now
          const rejectReason = field.value ? orderDateRejectReason(current.getTime(), now.getTime()) : null

          if (!editing) {
            return (
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 truncate text-default-700">
                  <Icon icon="calendar" className="size-4 shrink-0" />
                  {formatOrderDateLabel(current, now)}
                </span>
                <button
                  type="button"
                  className="btn min-h-11 text-primary hover:bg-primary hover:text-white"
                  onClick={() => setEditing(true)}
                >
                  เปลี่ยน
                </button>
              </div>
            )
          }

          return (
            <>
              <div className="flex items-center gap-2">
                <input
                  id="order-date-input"
                  type="datetime-local"
                  className={`form-input flex-1${rejectReason ? ' is-invalid' : ''}`}
                  value={field.value ?? toDatetimeLocalValue(now)}
                  min={toDatetimeLocalValue(new Date(minMs))}
                  max={toDatetimeLocalValue(new Date(maxMs))}
                  aria-describedby={rejectReason ? 'order-date-error' : undefined}
                  onChange={(e) => field.onChange(e.target.value || undefined)}
                />
                <button
                  type="button"
                  className="btn min-h-11 bg-primary/15 text-primary"
                  onClick={() => {
                    setValue('orderedAt', undefined)
                    setEditing(false)
                  }}
                >
                  ตอนนี้
                </button>
              </div>
              {rejectReason && (
                <p id="order-date-error" className="mt-1 text-xs text-danger" role="alert">
                  {rejectReason}
                </p>
              )}
              <p className="mt-1 text-xs text-default-500">
                ย้อนหลังได้ถึง {formatDateTH(new Date(minMs))}
              </p>
            </>
          )
        }}
      />

      {fromMessage && (
        <span className="badge mt-2 bg-info/15 text-info-ink">
          <Icon icon="message" className="size-3.5" />
          ใช้เวลาจากข้อความ
        </span>
      )}
      {messageTooOld && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-warning-ink">
          <Icon icon="alert-triangle" className="size-3.5 shrink-0" />
          ข้อความเก่าเกินกำหนด — ใช้เวลาปัจจุบัน
        </p>
      )}
    </div>
  )
}
