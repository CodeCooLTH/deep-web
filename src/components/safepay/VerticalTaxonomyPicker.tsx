'use client'

/**
 * VerticalTaxonomyPicker — หน้าเลือกประเภทร้านค้าแบบ 2 ขั้น (feature 00030 FR-BKU-01/02)
 *
 * ทำไมต้องมีไฟล์นี้: เดิมหน้าเลือกประเภทร้านเขียนแยกกัน 2 ที่ (Personal onboarding กับ
 * Business creation) ด้วยการ์ด 3 ใบเรียงเท่ากัน — ป้ายไม่ขนานกันจนคนอ่านแล้วเดาไม่ออกว่า
 * ร้านตัวเองอยู่ใบไหน ("สินค้าและบริการ" ฟังเหมือนครอบ "ขายออนไลน์" อยู่ในตัว) และเพราะ
 * เป็นคนละไฟล์ แก้ที่หนึ่งอีกที่ก็ไม่ตาม
 *
 * ของใหม่ถามเป็นลำดับที่คนคิดจริง: **มีจัดส่งไหม** → ถ้าไม่มี **ลูกค้ามาแล้วกลับ หรือค้างคืน**
 * "แล้วกลับ" กับ "ค้างคืน" คือความต่างเชิงโครงสร้างจริงของสองระบบ (คิวต่อวัน vs ช่วงวันคูณ
 * ราคาต่อคืน) เขียนออกมาเป็นภาษาที่ตัดสินได้โดยไม่ต้องรู้ศัพท์ระบบ
 *
 * ค่าที่บันทึกจริงยังเป็น 3 ค่าเดิมของ Shop.vertical ทุกประการ — 2 ขั้นเป็นแค่วิธีถาม
 * ไม่ใช่ค่าใหม่ ไม่มี migration ไม่แตะ CHECK constraint
 *
 * controlled component: `value` เป็น null ได้เมื่อผู้ใช้เลือกหมวด "รับนัดหมายและจอง" แล้ว
 * แต่ยังไม่เลือกหมวดย่อย — parent ใช้ null นี้ปิดปุ่มถัดไป (ไม่ต้องคำนวณเอง)
 *
 * Base: ธีม Paces ไม่มี component "radio card" ให้ copy ตรง ๆ (radio ของธีมเป็น form-radio
 *       แถวเรียบ ๆ — form/elements/components/ChecksRadioSwitches.tsx:193-231) จึงประกอบจาก
 *       primitive ของธีม 2 ชิ้น:
 *         - สถานะเลือกอยู่ = ui/cards/page.tsx:67 `card border-primary border-2`
 *         - เส้นประคั่น    = .card-header ของ Paces (border-b border-dashed border-default-300)
 *       ปรับ content: 2 ใบต่อขั้น, ไอคอนนำ, พื้นจมหนึ่งระดับสำหรับขั้นย่อย
 * Spec: docs/superpowers/specs/2026-08-04-feature-00030-vertical-picker-design.md
 * Copy: docs/20 - Features/00030 - Booking Business UX Unification/UX-Copy.md §7
 */

import Icon from '@/components/wrappers/Icon'
import type { ShopVertical } from '@/lib/lodging'
import { useState } from 'react'

/**
 * ประโยคเตือนว่าเลือกแล้วเปลี่ยนไม่ได้ — export เพื่อให้ทั้ง 2 ทางเข้าใช้ "ประโยคเดียวกัน"
 * โดยที่แต่ละที่ยังวางในตำแหน่ง/สไตล์ของตัวเองได้ (onboarding = subtitle กลางจอ,
 * business = บรรทัดใต้ label ของฟิลด์)
 *
 * ของเดิมเป็นคนละประโยคกัน และฝั่ง business วางไว้ **ใต้** การ์ด = เตือนหลังคนตัดสินใจไปแล้ว
 */
export const VERTICAL_LOCK_NOTICE = 'ไม่สามารถเปลี่ยนแปลงภายหลังได้'

/** หมวดใหญ่ขั้นที่ 1 — ไม่ใช่ค่าที่บันทึกลง DB เป็นแค่ทางแยกของคำถาม */
type Category = 'SALES' | 'BOOKING'

type Choice = {
  /** null = การ์ดนี้พาไปขั้นที่ 2 ไม่ได้ตั้งค่าเอง */
  vertical: ShopVertical | null
  label: string
  desc: string
  icon: string
}

const STEP1: Choice[] = [
  {
    vertical: 'ONLINE_SALES',
    label: 'ขายของออนไลน์',
    desc: 'ลูกค้าสั่งแล้วคุณจัดส่งให้',
    icon: 'truck-delivery',
  },
  {
    vertical: null,
    label: 'รับนัดหมายและจอง',
    desc: 'ลูกค้านัดวันแล้วมาที่ร้าน หรือมาเข้าพัก',
    icon: 'calendar-event',
  },
]

const STEP2: Choice[] = [
  {
    vertical: 'SERVICE_QUEUE',
    label: 'มาใช้บริการแล้วกลับ',
    desc: 'เช่น ร้านตกแต่งรถ ร้านนวด คลินิก — กำหนดได้ว่าวันหนึ่งรับได้กี่คิว',
    icon: 'calendar-check',
  },
  {
    vertical: 'LODGING',
    label: 'มาพักค้างคืน',
    desc: 'เช่น บ้านพัก รีสอร์ต — คิดราคาต่อคืน จองข้ามหลายคืนได้',
    icon: 'bed',
  },
]

interface Props {
  /** null = เลือกหมวด "รับนัดหมายและจอง" แล้วแต่ยังไม่เลือกหมวดย่อย → parent ปิดปุ่มถัดไป */
  value: ShopVertical | null
  onChange: (v: ShopVertical | null) => void
  /** 1 = onboarding (shell แคบ max-w-md) · 2 = ฟอร์มสร้างธุรกิจ (กว้าง) */
  columns?: 1 | 2
  /** ปิดการกดระหว่าง submit — ของเดิมไม่เคย disable จึงเป็น false เป็นค่าตั้งต้น */
  disabled?: boolean
}

function ChoiceCard({
  choice,
  selected,
  disabled,
  onSelect,
}: {
  choice: Choice
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-2.5 rounded-lg border-2 p-3 ${
        selected ? 'border-primary bg-primary/5' : 'border-default-200'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {/* radio ยังอยู่ใน DOM (คีย์บอร์ด/screen reader ต้องใช้) แต่ซ่อนจากสายตา — การ์ดบอกว่า
          "เลือกอยู่" ด้วยขอบ+พื้นอยู่แล้ว มีจุดกลมอีกคือพูดซ้ำครั้งที่สาม */}
      <input
        type="radio"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      {/* focus ring ต้องไม่หายไปพร้อม radio ที่มองไม่เห็น */}
      <span
        aria-hidden="true"
        className="peer-focus-visible:ring-primary pointer-events-none absolute inset-0 rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2"
      />
      {selected && (
        /* สัญญาณ "ยืนยันแล้ว" คนละหน้าที่กับขอบ+พื้น (ซึ่งเป็นสัญญาณผิว) — การเลือกนี้แก้ทีหลังไม่ได้
           จึงสมควรมีเครื่องหมายที่อ่านออกทันทีว่าอันนี้แหละที่เลือก */
        <Icon icon="circle-check-filled" className="text-primary absolute top-2 right-2 size-4" />
      )}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon icon={choice.icon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="text-dark block text-sm font-medium">{choice.label}</span>
        <span className="text-default-400 mt-0.5 block text-xs">{choice.desc}</span>
      </span>
    </label>
  )
}

export default function VerticalTaxonomyPicker({
  value,
  onChange,
  columns = 1,
  disabled = false,
}: Props) {
  /**
   * หมวดใหญ่เก็บเป็น state ของตัวเองเพราะ value=null บอกไม่ได้ว่าผู้ใช้อยู่หมวดไหน
   * (null เกิดเฉพาะตอนเลือก BOOKING แล้วยังไม่เลือกย่อย — ถ้า derive จาก value อย่างเดียว
   *  ขั้นที่ 2 จะหายไปทันทีที่ผู้ใช้ยังไม่ได้เลือกอะไร ซึ่งคือทางตัน)
   */
  const [category, setCategory] = useState<Category>(
    value === 'SERVICE_QUEUE' || value === 'LODGING' ? 'BOOKING' : 'SALES',
  )
  /**
   * จำหมวดย่อยที่เคยเลือกไว้ — สลับไป "ขายของออนไลน์" แล้วกลับมา ต้องเห็นตัวเดิมยัง highlight
   * ไม่ใช่เริ่มใหม่ (ลด friction ตอนกดพลาด ซึ่งเกิดง่ายเพราะเลือกผิดแล้วแก้ไม่ได้)
   */
  const [lastSub, setLastSub] = useState<ShopVertical | null>(
    value === 'SERVICE_QUEUE' || value === 'LODGING' ? value : null,
  )

  const gridClass = columns === 2 ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'grid grid-cols-1 gap-2'

  const pickCategory = (c: Category) => {
    setCategory(c)
    // SALES ตั้งค่าได้ทันทีไม่มีขั้นที่ 2 · BOOKING คืนค่าที่เคยเลือก (หรือ null = ยังไม่ครบ)
    onChange(c === 'SALES' ? 'ONLINE_SALES' : lastSub)
  }

  const pickSub = (v: ShopVertical) => {
    setLastSub(v)
    onChange(v)
  }

  return (
    <div>
      <div className={gridClass}>
        {STEP1.map((c) => {
          const isSales = c.vertical === 'ONLINE_SALES'
          return (
            <ChoiceCard
              key={c.label}
              choice={c}
              disabled={disabled}
              selected={isSales ? category === 'SALES' : category === 'BOOKING'}
              onSelect={() => pickCategory(isSales ? 'SALES' : 'BOOKING')}
            />
          )
        })}
      </div>

      {category === 'BOOKING' && (
        /* คั่นด้วยเส้นประ — ยืม signature ของ .card-header (Paces) มาใช้เป็น section divider
           แทนการซ้อนการ์ดในการ์ด ซึ่งเป็น anti-pattern ที่ DESIGN.md ห้ามไว้ */
        <div className="border-default-300 mt-4 border-t border-dashed pt-4">
          {/* พื้นจมลงหนึ่งระดับ (สีเดียวกับพื้นหน้าเว็บ) — เส้นประอย่างเดียวคอนทราสต์ ~1.1:1
              วัดจากของจริงบน prod แล้วว่าตาไม่เห็น จึงต้องมีรูปทรงช่วยบอกการจัดกลุ่มด้วย */}
          <div className="bg-default-100 rounded-lg p-3">
            {/* หัวข้อขั้นย่อยต้องเบากว่า .form-label ของฟิลด์แม่ ไม่งั้นอ่านเป็นฟิลด์พี่น้องกัน */}
            <p className="text-default-500 mb-2 text-xs font-medium">ลูกค้ามาแบบไหน</p>
          <div className={gridClass}>
            {STEP2.map((c) => (
              <ChoiceCard
                key={c.label}
                choice={c}
                disabled={disabled}
                selected={value === c.vertical}
                onSelect={() => pickSub(c.vertical as ShopVertical)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
