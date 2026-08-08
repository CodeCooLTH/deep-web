'use client'

/**
 * OrderDateRow — แถว "วันที่สั่งซื้อ" ในฟอร์มสร้าง/แก้ไขคำสั่งซื้อ (feature 00033)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *       (form-label + form-input) ผ่าน src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:78-90
 *       ซึ่ง copy pattern input type="datetime-local" มาแล้ว
 * Base (ชิปทางลัด "เมื่อวาน/2 วันก่อน"): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *       (คลาส `badge` + `rounded-full` + สี bg-token แบบ 15% opacity) ผ่าน StageChips ใน
 *       src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx ที่อ้าง Base เดียวกัน —
 *       เพิ่ม min-h-11 นอกเหนือจากต้นทาง (ต้นทางเป็นตัวกรองบนตาราง กดด้วยเมาส์ ที่นี่ต้องกดด้วยนิ้วบนมือถือ)
 * ปุ่ม ghost/soft: docs/system/ui-guideline/paces-component-reference.md §1
 *   (คลาส ghost ที่ Bootstrap/DaisyUI มีแต่ Paces ไม่มีจริง — ghost ที่ถูกต้องคือ `btn text-primary hover:bg-primary hover:text-white`)
 *
 * ยุบไว้เป็นค่าตั้งต้น (มติ D-7): ~95% ของการคีย์คือ "ตอนนี้" — ช่องกรอกที่โผล่ตลอดเวลา
 * เพิ่มภาระสายตาให้ทุกคนเพื่อคนส่วนน้อย
 * ผ่าน ux gate แล้ว — ดู .superpowers/sdd/2026-08-06-backdated-order-date/task-9-ux-rulings.md
 *
 * impeccable critique round (2026-08-06) — 3 ข้อ P1:
 * 1) คอนทราสต์ตก 3 จุด (text-default-500/text-danger/text-primary บน bg-primary/15) → เปลี่ยนเป็น
 *    -700/-ink token เดิมของธีม (ห้ามสลับเฉด — docs/conventions/contrast-fix-keeps-hue.md)
 * 2) input ไม่มี accessible name (label เป็น span ลอย ไม่ผูก htmlFor) + focus หายตอนแถวเปลี่ยนรูป
 *    (unmount ปุ่ม/ช่องแล้วไม่มีอะไรรับ focus ต่อ — จำลอง initial-mount guard กัน autofocus ตอนโหลดหน้า)
 * 3) ไม่มีทางลัดสำหรับเคสที่ฟีเจอร์นี้ถูกสร้างมาแก้ (คำสั่งเมื่อคืนคีย์ตอนเช้า = "เมื่อวาน" เกือบทุกครั้ง) →
 *    ชิป "เมื่อวาน/2 วันก่อน" เปลี่ยนแค่วัน คงเวลาที่กรอกไว้เดิม (ห้ามเดาเวลา — ไม่รู้ว่าลูกค้าสั่งกี่โมง)
 */
import { useId, useState, useRef, useEffect } from 'react'
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import {
  orderDateWindow,
  orderDateRejectReason,
  isOrderDateInWindow,
  ORDER_BACKDATE_DAYS,
} from '@/lib/order-date-window'
import { formatOrderDateLabel, formatDateTH } from '@/lib/format-date'
import { cn } from '@/utils/helpers'
import type { FormValues } from './OrderCreateForm'

/** ทางลัด P1-3 — เปลี่ยนแค่ "วัน" อ้างอิงจาก now แต่คงเวลาของ base (ค่าที่กรอกอยู่/now) ไว้เดิมเป๊ะ */
function shiftDayKeepTime(base: Date, referenceNow: Date, daysAgo: number): Date {
  const target = new Date(referenceNow)
  target.setDate(target.getDate() - daysAgo)
  target.setHours(base.getHours(), base.getMinutes(), 0, 0)
  return target
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const DAY_SHORTCUTS = [
  { label: 'เมื่อวาน', daysAgo: 1 },
  { label: '2 วันก่อน', daysAgo: 2 },
] as const

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
  /** ป้ายช่อง ผันตามประเภทกิจการ (ORDER_VOCAB.dateLabel) — ร้านบ้านพัก/คิวงานใช้คำต่างกัน
   *  ไม่ส่งมา = ชุดของร้านขายออนไลน์ (fail-safe เดียวกับ resolveOrderVocab) */
  dateLabel?: string
}

export default function OrderDateRow({ control, setValue, fromMessage, messageTooOld, dateLabel = 'วันที่สั่งซื้อ' }: Props) {
  // เปิดช่องค้างไว้เลยเมื่อค่ามาจากข้อความ — ปกติ/แก้ไขออเดอร์เดิม = ยุบ
  const [editing, setEditing] = useState(!!fromMessage)
  // ตรึงไว้ครั้งเดียว — เดิม `new Date()` ตอน render ทำให้ min/max ถูกเขียนลง DOM ใหม่ทุกครั้ง
  // ที่ฟอร์มขยับ และป้าย "วันนี้/เมื่อวาน" อ้างอิงค่าที่ขยับเงียบ ๆ (impeccable audit 2026-08-06)
  const [now] = useState(() => new Date())
  const { minMs, maxMs } = orderDateWindow(now.getTime())

  // Minor-1 (2026-08-06) — component นี้ถูก render พร้อมกัน 2 ชุดเสมอ (QuickForm มือถือ +
  // CartPanel เดสก์ท็อป ซ่อนด้วย CSS ไม่ unmount) id คงที่จึงชนกันใน DOM ทำให้ aria-describedby
  // ของชุดหนึ่งชี้ไปหาแถวของอีกชุด. useId() ให้ id ต่างกันต่อ instance โดยอัตโนมัติ
  const uid = useId()
  const inputId = `order-date-input-${uid}`
  const errorId = `order-date-error-${uid}`
  const helperId = `order-date-helper-${uid}`

  // P1-2(ข): focus ต้องตามแถวไป — ขยาย → ช่องกรอก, ยุบกลับ → ปุ่ม "เปลี่ยน" เดิม
  // skipNextFocusRef กัน autofocus ตอน mount ครั้งแรก (เส้นทางจากแชท editing เริ่มเป็น true อยู่แล้ว
  // ถ้า focus เด้งตอน mount หน้าจะกระโดด + คีย์บอร์ดมือถือเด้งขึ้นมาเอง)
  const inputRef = useRef<HTMLInputElement>(null)
  const changeButtonRef = useRef<HTMLButtonElement>(null)
  const skipNextFocusRef = useRef(true)
  useEffect(() => {
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false
      return
    }
    if (editing) {
      inputRef.current?.focus()
    } else {
      changeButtonRef.current?.focus()
    }
  }, [editing])

  return (
    <div>
      {editing ? (
        <label htmlFor={inputId} className="form-label">{dateLabel}</label>
      ) : (
        <span className="form-label">{dateLabel}</span>
      )}
      <Controller
        control={control}
        name="orderedAt"
        render={({ field }) => {
          const current = field.value ? new Date(field.value) : now
          const rejectReason = field.value ? orderDateRejectReason(current.getTime(), now.getTime()) : null
          const currentLabel = formatOrderDateLabel(current, now)

          if (!editing) {
            return (
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 truncate text-default-700">
                  <Icon icon="calendar" className="size-4 shrink-0" />
                  {currentLabel}
                </span>
                <button
                  ref={changeButtonRef}
                  type="button"
                  aria-label={`เปลี่ยน${dateLabel} ค่าปัจจุบันคือ ${currentLabel}`}
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
              {/* P1-3: ทางลัด "เมื่อวาน/2 วันก่อน" — โจทย์ตั้งต้นของฟีเจอร์นี้คือแอดมินคีย์เช้าวันรุ่งขึ้น
                  เปลี่ยนแค่วัน คงเวลาที่กรอกอยู่ในช่องไว้เดิม (ไม่เดาเวลาเอง) */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {DAY_SHORTCUTS.map(({ label, daysAgo }) => {
                  const target = shiftDayKeepTime(current, now, daysAgo)
                  const active = isSameLocalDay(current, target)
                  const outOfWindow = !isOrderDateInWindow(target.getTime(), now.getTime())
                  return (
                    <button
                      key={daysAgo}
                      type="button"
                      disabled={outOfWindow}
                      aria-pressed={active}
                      onClick={() => field.onChange(toDatetimeLocalValue(target))}
                      className={cn(
                        // min-h-11 นอกเหนือจากต้นทาง StageChips — ที่นี่กดด้วยนิ้วบนมือถือ (ดู Base ด้านบนไฟล์)
                        // text-default-800 (ไม่ใช่ -500 ของต้นทาง StageChips) — ตัวอักษร text-xs บน
                        // bg-default-100 ด้วย -500 ตกคอนทราสต์ (~2.2:1) เหมือนกับ 3 จุดที่ P1-1 แก้ในไฟล์นี้
                        // focus-visible:ring แทน focus:outline-none ลอย ๆ — ธีมไม่มี .badge:focus มาชดเชย
                        // (ยืนยันแล้ว: rg '\.badge' src/assets/css | grep focus = 0) คนใช้คีย์บอร์ด
                        // จึงมองไม่เห็นว่าตัวเองอยู่ชิปไหน — WCAG 2.4.7 (impeccable audit 2026-08-06)
                        'badge min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
                        // ไม่ใส่ ring-offset — ค่าตั้งต้นของ offset color คือขาว ซึ่งบนการ์ดโหมดมืด
                        // จะกลายเป็นวงขาวคาดรอบชิป และผมยืนยันด้วยตาไม่ได้ในรอบนี้ (dev server ไม่ขึ้น)
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        // user report 2026-08-07: "pill เมื่อวาน/2 วันก่อน ไม่เด่น"
                        // ต้นทาง StageChips เป็น *ตัวกรอง* — เทาแปลว่า "ยังไม่ได้กรองด้วยอันนี้"
                        // ชิปชุดนี้เป็น *ปุ่มลงมือ* (แตะแล้วค่าเปลี่ยนทันที) ยืมสีของ filter มาใช้จึงอ่าน
                        // เหมือนป้ายสถานะ/ปุ่มที่ถูกปิด ทั้งที่มันคือทางลัดหลักของฟีเจอร์นี้ทั้งฟีเจอร์
                        // soft-primary ไม่ใช่ solid — solid สงวนไว้ให้ปุ่มบันทึกของฟอร์ม (One Voice)
                        active ? 'bg-primary text-white' : 'bg-primary/15 text-primary hover:bg-primary hover:text-white',
                      )}
                    >
                      <Icon icon="history" className="size-3.5" />
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id={inputId}
                  type="datetime-local"
                  /**
                   * ความสูง 44px + ตัวอักษร 16px (user สั่ง 2026-08-08 "input นี้ใหญ่ไป")
                   *
                   * ประวัติ: 2026-08-07 ช่องนี้เตี้ยกว่าปุ่มข้าง ๆ 7px (user report "ไม่เท่ากัน")
                   * เลยยกทั้งคู่เป็น 47px ด้วย form-input-lg — แต่ 47px + ตัวอักษร 16px รวมกันแล้ว
                   * หนักเกินเมื่อเทียบกับช่องอื่นในฟอร์ม
                   *
                   * ลดเหลือ 44px (ยังผ่าน tap target) แต่ **คงตัวอักษรไว้ที่ 16px โดยตั้งใจ**:
                   * 🛑 iOS ซูมหน้าจอเองทุกครั้งที่โฟกัสช่องกรอกที่ font-size < 16px — ลดเป็น
                   * text-sm (13px) จะได้ช่องที่เล็กลงแลกกับหน้าจอเด้งซูมทุกครั้งที่แตะ ซึ่งแย่กว่า
                   * ปัญหาที่กำลังแก้อยู่มาก
                   *
                   * ใช้ !h-11/!text-base แทน form-input-lg เพราะ .form-input ไม่ได้ห่อ @layer
                   * จึงชนะ utility ธรรมดา (บทเรียนเดิมที่ comment ก่อนหน้าบันทึกไว้) — h-11 เป็น
                   * Tailwind scale ปกติ ไม่ใช่ arbitrary value
                   */
                  className={`form-input !h-11 !text-base flex-1${rejectReason ? ' is-invalid' : ''}`}
                  value={field.value ?? toDatetimeLocalValue(now)}
                  min={toDatetimeLocalValue(new Date(minMs))}
                  max={toDatetimeLocalValue(new Date(maxMs))}
                  // helper (ขอบเขตที่เลือกได้) ต้องถูกอ่านเสมอ ไม่ใช่โผล่ตอนพลาดไปแล้ว — มันคือสิ่งที่กันไม่ให้พลาด
                  aria-describedby={rejectReason ? `${errorId} ${helperId}` : helperId}
                  onChange={(e) => field.onChange(e.target.value || undefined)}
                />
                <button
                  type="button"
                  // h-11 (44px) — ต้องเท่าช่องข้าง ๆ เป๊ะ ไม่ใช่แค่ "อย่างน้อย" (min-h-11 เคยทำให้
                  // ต่างกัน 7px มาแล้ว user report 2026-08-07)
                  className="btn h-11 bg-primary/15 text-primary-ink"
                  onClick={() => {
                    // shouldDirty: true — นี่คือการแก้ไขของผู้ใช้จริง (ล้างวันที่ย้อนหลังกลับไปใช้
                    // "ตอนนี้") ไม่ใช่ค่า default ต้องนับเป็น dirty เหมือน field.onChange (C-1/C-2)
                    setValue('orderedAt', undefined, { shouldDirty: true })
                    setEditing(false)
                  }}
                >
                  ใช้เวลาปัจจุบัน
                </button>
              </div>
              {rejectReason && (
                <p id={errorId} className="mt-1 text-xs text-danger-ink" role="alert">
                  {rejectReason}
                </p>
              )}
              <p id={helperId} className="mt-1 text-xs text-default-700">
                ย้อนหลังได้ถึง {formatDateTH(new Date(minMs))} · ล่วงหน้าได้ถึง {formatDateTH(new Date(maxMs))}
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
          ข้อความนี้เก่ากว่า {ORDER_BACKDATE_DAYS} วัน จึงใช้เวลาปัจจุบันแทน
        </p>
      )}
    </div>
  )
}
