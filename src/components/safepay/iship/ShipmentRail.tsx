'use client'

/**
 * ShipmentRail — แถบสถานะพัสดุแบบ "งูเลื้อย" 2 แถว (ขาไป + ขากลับ)
 *
 * แถว 1 เดินซ้าย→ขวา · แถว 2 เดินขวา→ซ้าย **จบที่ซ้ายสุดตรงกับจุดออกเดินทางพอดี**
 * = ของกลับมาที่เดิม อ่านออกโดยไม่ต้องอ่านคำ (นี่คือทั้งหมดที่ทำให้รูปแบบนี้ถูกเลือก
 * ⇒ ห้ามให้แถว 2 ชิดขวาหรือย่อความกว้าง มันจะกลายเป็นแถบที่บังเอิญกลับด้านเฉย ๆ)
 *
 * 🛑 component เดียวสำหรับ **ทุกจอ Paces ที่วาดแถบนี้** — เดิมแต่ละจอวาดเอง แล้ว
 * `ParcelTimeline` ฝั่งผู้ซื้อ drift ไปคนละชุด key จนพัสดุที่ส่งถึงแล้วโชว์ "สร้างพัสดุ"
 * และแถบเตือน "พัสดุมีปัญหา" ไม่เคยขึ้นเลยสักครั้ง (`tsc` มองไม่เห็นเพราะ prop เป็น `string`)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/timeline/page.tsx ("Timeline with Icons"
 *       — relative + absolute + เส้นเชื่อมระหว่างจุด) ย่อ/ปรับเป็นแนวนอน 2 แถว
 */

import { Fragment } from 'react'

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { SHIPMENT_STAGES } from '@/lib/iship/status'
import type { ReturnLeg } from '@/lib/iship/return-timeline'

/**
 * 🛑 ครึ่งหนึ่งของขนาดจุดพอดี ทั้งคู่อยู่บนสเกล 0.25rem ของ Tailwind (`size-8`=2rem ⇒ `end-4`=1rem)
 * **ไม่ใช่ arbitrary value** จึงไม่ต้องขอ carve-out ตาม HR7
 */
const ELBOW_X = { sm: 'end-3', lg: 'end-4' } as const
const DOT_SIZE = { sm: 'size-6', lg: 'size-8' } as const
const DOT_ICON = { sm: 'text-xs', lg: 'text-base' } as const
const LABEL_W = { sm: 'w-6', lg: 'w-8' } as const

const TONE_SOLID = {
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
} as const
const TONE_LINE = { success: 'bg-success', warning: 'bg-warning' } as const
const TONE_INK = { success: 'text-success-ink', warning: 'text-warning-ink' } as const

export interface ShipmentRailProps {
  /** จุดที่ไปถึงบนแถว 1 (0–3) */
  stage: number
  /** override จุดสุดท้ายของแถว 1 — มาจาก `describeProgress()` */
  lastLabel?: string
  lastIcon?: string
  /** class ของจุด "ปัจจุบัน" บนแถว 1 — SSOT เดียวกับทุกจอ (`shipmentCurrentDotCls`) */
  currentDotCls: string
  /** แถวที่ 2 — `null` = ออเดอร์ปกติ ไม่วาดแถว 2 เลย */
  leg: ReturnLeg | null
  size?: 'sm' | 'lg'
  /** วาดคำใต้จุดไหม (แถบจิ๋วในตารางไม่มีที่พอ) */
  labels?: boolean
  /**
   * ประโยคเดียวที่อธิบายทั้งแถบให้ screen reader
   *
   * 🛑 ใช้ `role="group"` เมื่อมีคำจริงใต้จุด **ห้ามใช้ `role="img"`** — `img` บังให้ AT
   * ไม่อ่านลูกเลย ป้ายทั้งแถบจะเงียบสนิท (ไม่ใช่แค่อ่านไม่ครบ) ส่วนแถบที่เป็นไอคอนล้วน
   * (`labels=false`) ใช้ `img` ถูกแล้วเพราะไม่มีอะไรให้อ่านอยู่แล้ว
   */
  ariaLabel: string
}

export default function ShipmentRail({
  stage,
  lastLabel,
  lastIcon,
  currentDotCls,
  leg,
  size = 'lg',
  labels = true,
  ariaLabel,
}: ShipmentRailProps) {
  const last = SHIPMENT_STAGES.length - 1
  const stepLabel = (i: number) => (i === last ? (lastLabel ?? SHIPMENT_STAGES[i].label) : SHIPMENT_STAGES[i].label)
  const stepIcon = (i: number) => (i === last ? (lastIcon ?? SHIPMENT_STAGES[i].icon) : SHIPMENT_STAGES[i].icon)

  const dot = (
    icon: string,
    state: 'current' | 'reached' | 'future',
    currentCls: string,
    /**
     * 🛑 วงแหวนบอก "จุดที่ยืนอยู่ตอนนี้" — จำเป็นเฉพาะแถว 2 เคสคืนของ
     *
     * เคสนั้น `originTone === 'success'` ⇒ จุดปัจจุบัน · จุดที่ผ่านมาแล้ว · จุดปลายทาง
     * ได้ `bg-success` **เหมือนกันหมดทั้งสามสถานะ** (ปลายทางเขียวเป็นมติ user) ⇒ ผู้ขาย
     * บอกไม่ได้เลยว่าของอยู่ตรงไหน นอกจากอ่านว่าคำไหนตัวหนา — ซึ่งแถบที่ไม่มีคำ
     * (`labels=false`) ไม่มีให้อ่าน (impeccable audit 2026-08-26)
     *
     * แก้ด้วย **รูปร่าง** ไม่ใช่สี เพราะสีถูกล็อกด้วยมติ user แล้ว
     */
    ringTone?: 'success' | 'warning',
    /** สีของจุดที่ "ผ่านมาแล้ว" — ไม่ส่ง = เขียวตามเดิม (เส้นทางที่สำเร็จ) */
    reachedCls?: string,
  ) => (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        DOT_SIZE[size],
        ringTone === 'success' && 'ring-success ring-offset-card ring-2 ring-offset-2',
        ringTone === 'warning' && 'ring-warning ring-offset-card ring-2 ring-offset-2',
        state === 'current'
          ? currentCls
          : state === 'reached'
            ? // เส้นทางที่ผ่านมาแล้ว — ใช้สีเดียวกับจุดปัจจุบันเมื่อผู้เรียกส่ง tone ของตัวเองมา
              // (แถวตีกลับ: ผ่านมาแล้วต้องไม่เขียว เพราะมันคือเส้นทางที่ล้มเหลว)
              (reachedCls ?? 'bg-success text-white')
            : 'bg-default-100 text-default-500',
      )}
    >
      <Icon icon={icon} className={DOT_ICON[size]} aria-hidden="true" />
    </span>
  )

  /** ป้ายหนึ่งช่อง — `align` คือตำแหน่ง **บนจอ** ไม่ใช่ลำดับใน array (แถว 2 กลับทิศ) */
  const label = (text: string, align: 'start' | 'center' | 'end', strong: boolean) => (
    <span
      className={cn(
        'flex shrink-0',
        LABEL_W[size],
        align === 'start' ? 'justify-start' : align === 'end' ? 'justify-end' : 'justify-center',
      )}
    >
      <span
        className={cn(
          'text-2xs leading-tight whitespace-nowrap',
          strong ? 'text-default-900 font-semibold' : 'text-default-700',
        )}
      >
        {text}
      </span>
    </span>
  )

  // ── แถว 1 : ขาไป ────────────────────────────────────────────────────────────
  const row1 = (
    <div className="flex items-center">
      {SHIPMENT_STAGES.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && (
            <span
              className={cn(
                'h-0.5 flex-1',
                // ช่วงสุดท้ายเป็นสีของ "ผลลัพธ์" — ตีกลับต้องไม่ได้เส้นเขียวพาไปถึงจุดจบ
                i <= stage ? (i === last && leg ? TONE_LINE[leg.originTone] : 'bg-success') : 'bg-default-200',
              )}
            />
          )}
          {dot(stepIcon(i), i === stage ? 'current' : i < stage ? 'reached' : 'future', currentDotCls)}
        </Fragment>
      ))}
    </div>
  )

  const row1Labels = labels && (
    <div className="mt-1.5 flex items-start">
      {SHIPMENT_STAGES.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 && <span className="flex-1" />}
          {label(stepLabel(i), i === 0 ? 'start' : i === last ? 'end' : 'center', i === stage)}
        </Fragment>
      ))}
    </div>
  )

  /**
   * 🛑 `role` ต้องคิดจาก `labels` **ไม่ใช่จากว่ามีขากลับไหม**
   *
   * รอบแรกกิ่งนี้เขียน `role="img"` ตายตัว ทั้งที่ยังเรนเดอร์ `row1Labels` (ข้อความไทยจริง)
   * และ `labels` มีค่าตั้งต้นเป็น `true` โดยไม่มี call site ไหนส่งค่ามาเลย ⇒ **ออเดอร์ปกติ
   * ซึ่งคือเกือบทั้งระบบ ได้แถบที่ screen reader อ่านไม่เห็นป้ายสักคำ** (`img` บังให้ AT
   * ทิ้งลูกทั้งหมด = เงียบทั้งบล็อก ไม่ใช่แค่อ่านไม่ครบ)
   *
   * docblock ของ prop `ariaLabel` ในไฟล์นี้เขียนกฎข้อนี้ไว้เองอยู่แล้ว — กิ่งที่มีขากลับทำถูก
   * ส่วนกิ่งนี้ทำผิด **ตัวที่ผิดคือกิ่งที่เดินบ่อยกว่า** (impeccable critique จับได้ 2026-08-25)
   */
  const role = labels ? 'group' : 'img'

  if (!leg) {
    return (
      <div role={role} aria-label={ariaLabel}>
        {row1}
        {row1Labels}
      </div>
    )
  }

  const n = leg.dots.length

  /**
   * ── เคสตีกลับ : แถวเดียว เดินซ้าย→ขวาปกติ ────────────────────────────────
   *
   * ไม่วาดขาไป เพราะจุดแรกของแถวนี้ ("ส่งไม่สำเร็จ") พูดแทนมันหมดแล้ว — วาดขาไปอีกแถว
   * คือเล่าเรื่องเดิมซ้ำด้วยที่ 4 จุด (user สั่ง 2026-08-27)
   *
   * ⇒ ไม่มีงูเลื้อย ไม่มีข้อศอก ไม่มีลูกศรย้อน — เพราะไม่มีอะไรให้บรรจบกับอะไร
   * ทิศทางกลับด้านมีความหมายก็ต่อเมื่อมี "ขาไป" ให้เทียบเท่านั้น
   */
  if (leg.standalone) {
    return (
      <div role={role} aria-label={ariaLabel}>
        <div className="flex items-center">
          {leg.dots.map((d, i) => (
            <Fragment key={`s-${d.label}-${i}`}>
              {i > 0 && (
                <span
                  className={cn(
                    'h-0.5 flex-1',
                    i <= leg.stage ? (i === n - 1 ? TONE_LINE.success : TONE_LINE.warning) : 'bg-default-200',
                  )}
                />
              )}
              {dot(
                d.icon,
                i === leg.stage ? 'current' : i < leg.stage ? 'reached' : 'future',
                // ปลายทาง = เขียว (มติ user) แยกจาก "ส่งสำเร็จ" ด้วยไอคอน `building-store`
                i === n - 1 ? TONE_SOLID.success : TONE_SOLID.warning,
                undefined,
                TONE_SOLID.warning,
              )}
            </Fragment>
          ))}
        </div>
        {labels && (
          <div className="mt-1.5 flex items-start">
            {leg.dots.map((d, i) => (
              <Fragment key={`sl-${d.label}-${i}`}>
                {i > 0 && <span className="flex-1" />}
                {label(d.label, i === 0 ? 'start' : i === n - 1 ? 'end' : 'center', i === leg.stage)}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── แถว 2 : ขากลับ (เดินขวา→ซ้าย) ───────────────────────────────────────────
  const mid = Math.floor((n - 1) / 2) // segment ที่จะสอดลูกศรบอกทิศ (ปัดลง)

  const row2 = (
    <div className="flex flex-row-reverse items-center">
      {leg.dots.map((d, i) => (
        <Fragment key={`${d.label}-${i}`}>
          {i > 0 && (
            <>
              <span className={cn('h-0.5 flex-1', i <= leg.stage ? TONE_LINE[leg.originTone] : 'bg-default-200')} />
              {/* ลูกศรบอกทิศ — สอดเป็น flex item ระหว่าง segment ไม่ใช่วางทับเส้นแล้วเจาะพื้นหลัง
                  ⇒ ไม่ต้องรู้ว่าการ์ดใบนี้วางอยู่บนพื้นสีอะไร (มือถือวางบน body ไม่ใช่ card)
                  ห้ามใช้ emoji ตาม HR12 — เป็น icon จริง */}
              {i - 1 === mid && (
                <Icon
                  icon="caret-left-filled"
                  className={cn('shrink-0 text-sm', TONE_INK[leg.originTone])}
                  aria-hidden="true"
                />
              )}
              <span className={cn('h-0.5 flex-1', i <= leg.stage ? TONE_LINE[leg.originTone] : 'bg-default-200')} />
            </>
          )}
          {dot(
            d.icon,
            i === leg.stage ? 'current' : i < leg.stage ? 'reached' : 'future',
            // จุดที่ยืนอยู่บนขากลับ: ถึงร้านแล้ว = เขียว (มติ user 2026-08-24 "เขียวเหมือนกัน"
            // แยกจาก "ส่งสำเร็จ" ด้วย **รูปร่างไอคอน** `building-store` ไม่ใช่ด้วยสี)
            // ยังกลับไม่ถึง = ส้ม (งานยังไม่จบ ของยังไม่อยู่ในมือใคร)
            i === n - 1 ? TONE_SOLID.success : TONE_SOLID[leg.originTone],
            i === leg.stage && i !== n - 1 ? leg.originTone : undefined,
          )}
        </Fragment>
      ))}
    </div>
  )

  const row2Labels = labels && (
    <div className="mt-1.5 flex flex-row-reverse items-start">
      {leg.dots.map((d, i) => (
        <Fragment key={`l-${d.label}-${i}`}>
          {i > 0 && <span className="flex-1" />}
          {/* i=0 อยู่ **ขวาสุดบนจอ** เพราะ row-reverse ⇒ align ต้องกลับด้านตามไปด้วย */}
          {label(d.label, i === 0 ? 'end' : i === n - 1 ? 'start' : 'center', i === leg.stage)}
        </Fragment>
      ))}
    </div>
  )

  return (
    // role="group" ไม่ใช่ "img" เมื่อมีคำจริงใต้จุด — ดูเหตุผลที่ prop `ariaLabel`
    <div role={role} aria-label={ariaLabel}>
      {row1}
      {row1Labels}

      {/* ข้อศอก — เส้นตั้งที่ขอบขวา ตรงกับศูนย์กลางจุดที่ 4 พอดี (`end-4` = ครึ่งของ `size-8`) */}
      <div className={cn('relative', size === 'sm' ? 'h-3' : 'h-4')} aria-hidden="true">
        <span className={cn('absolute inset-y-0 w-0.5', ELBOW_X[size], TONE_LINE[leg.originTone])} />
      </div>

      {row2}
      {row2Labels}

    </div>
  )
}
