'use client'

/**
 * ThreadContextBar — รวม "ที่มาของแชท" ให้เหลือบรรทัดเดียว กดกางดูรายละเอียด
 * (user report 2026-08-11 พร้อมภาพหน้าจอ prod: "เวลาที่มี reply ads, reply comment ตอนนี้
 *  panel ด้านบน มันซ้อนกันเยอะ จนใช้ยาก")
 *
 * ก่อนหน้านี้แต่ละที่มาเป็นบล็อกของตัวเองเรียงซ้อนใต้หัวเธรด — ชื่อร้าน ~28px + โฆษณา ~57px +
 * คอมเมนต์ ~57px และยังมี ThreadStatusBar/OrderProgressBar ต่อท้ายอีก เคสในภาพกินไป ~170px
 * บวกหัวเธรด 61px ≈ 29% ของจอมือถือ ก่อนจะเห็นข้อความแรก
 *
 * 🛑 นี่ไม่ใช่แพตเทิร์นใหม่ — ThreadStatusBar (2026-08-02) และ OrderProgressBar (2026-08-05)
 * ผ่านรอบยุบแบบนี้ไปแล้วด้วยเหตุผลเดียวกันเป๊ะ. โฆษณากับคอมเมนต์คือสองอันที่ตกหล่นจากรอบนั้น
 * เพราะถูกเพิ่มคนละเวลากัน
 *
 * ต่างจาก ThreadStatusBar 3 อย่าง (ตั้งใจ ห้ามทำให้เหมือนกัน):
 *   1. **พื้นโปร่ง ห้าม bg-{semantic}/15** — ตัวนั้นเป็น "คำเตือน" ตัวนี้เป็น "บริบท"
 *      สองแถบสีวางติดกันจะอ่านเป็นบล็อกเดียวที่แยกไม่ออกว่าอันไหนคือสิ่งที่ต้องรีบจัดการ
 *   2. **แถวเต็มความกว้างติดหัวแชท (border-b) ไม่ใช่การ์ดลอยที่มี padding รอบ** —
 *      user report 2026-07-26 ตัดสินไปแล้วว่าการ์ดลอยทำให้มีช่องว่างคั่นหัวแชทกับแบนเนอร์
 *      (ThreadStatusBar เป็นการ์ดลอยได้เพราะคำเตือน *ควร* ดูเหมือนของแปลกปลอมที่แทรกเข้ามา)
 *   3. ไม่มี `action` ยกขึ้นมาบนบรรทัดยุบ — ลิงก์ "ดูโฆษณา"/"ดูคอมเมนต์" พาออกนอกแอป
 *      งบพื้นที่ที่ 320px ไม่พอ และมันไม่ใช่งานที่ต้องกดทันทีแบบ "ให้บอทตอบต่อ"
 *
 * ลำดับใน items = ลำดับความสำคัญ ตัวแรกคือตัวที่โชว์ตอนยุบ — caller เป็นคนเรียง (ดู ChatThread)
 *
 * Base: ./ThreadStatusBar.tsx (โครงยุบ/กาง + truncate + badge +N + aria-expanded)
 */

import { useState, type ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'

export interface ThreadContextItem {
  key: string
  /** ภาพย่อ 20px (รูปโฆษณา / ปกโพสต์) — null = ใช้ icon แทน */
  thumbUrl: string | null
  /** tabler icon — ทั้ง fallback ของภาพย่อ และไอคอนนำเมื่อไม่มีภาพ */
  icon: string
  /**
   * คำนำที่บอก **ประเภท** ของที่มา — "จากโฆษณา" | "จากคอมเมนต์"
   *
   * `null` = รายการนี้เป็นประโยคสมบูรณ์ในตัวเอง ไม่ต้องมีจุดคั่น (เช่นแถวชื่อร้าน ซึ่งอ่านว่า
   * "ตอบในนามร้าน BT Premium" — เติม `·` หลังวลีที่มีกริยาจะกลายเป็น "ตอบในนามร้าน · BT Premium"
   * ซึ่งอ่านสะดุด ต่างจาก "จากโฆษณา · เรามาแล้วครับ!" ที่เป็นคู่ ประเภท·เนื้อหา จริง ๆ)
   */
  label: string | null
  /** เนื้อหาสำคัญที่สุดของรายการนั้น 1 บรรทัด (ตัดท้ายด้วย truncate ถ้าเกิน) */
  short: string
  /** การ์ดเต็มตอนกาง — JSX ก้อนเดิมยกมาทั้งดุ้น ไม่แก้เนื้อใน */
  detail: ReactNode
  /** ธงว่าภาพย่อโหลดไม่ขึ้น — ตกไปใช้ icon เหมือนกิ่ง "ไม่มีรูป" ไม่ใช่กล่องขาวเปล่า */
  thumbBroken?: boolean
}

/**
 * 🛑 ไม่มีตราสามเหลี่ยม "โพสต์วิดีโอ" บนภาพย่อของบรรทัดยุบโดยตั้งใจ
 *
 * การ์ดเต็มใช้ภาพ 40px + วงกลม 20px จึงอ่านออก แต่บรรทัดนี้ภาพย่อแค่ 20px วงกลมจะเหลือ ~12px
 * และสามเหลี่ยมข้างในเล็กกว่าขั้นเล็กสุดของ type ramp — ได้จุดดำที่บังภาพย่อโดยไม่สื่ออะไร
 * สัญญาณ "เป็นวิดีโอ" ยังอยู่ครบในตัวกาง ซึ่งเป็นที่ที่ผู้ขายระบุตัวโพสต์จริง ๆ อยู่แล้ว
 */

export default function ThreadContextBar({ items }: { items: ThreadContextItem[] }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null
  const head = items[0]

  if (open) {
    return (
      <>
        {items.map((it) => (
          <div key={it.key}>{it.detail}</div>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="border-default-200 text-default-700 hover:bg-default-100 flex shrink-0 items-center gap-1.5 border-b px-4 py-1.5 text-xs font-medium"
        >
          <Icon icon="chevron-up" className="text-sm" />
          ย่อที่มาของแชท
        </button>
      </>
    )
  }

  return (
    <div className="border-default-200 flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs">
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        {head.thumbUrl && !head.thumbBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={head.thumbUrl} alt="" className="size-5 rounded object-cover" />
        ) : (
          <span className="bg-default-200 text-default-700 flex size-5 items-center justify-center rounded">
            <Icon icon={head.icon} className="text-xs" aria-hidden="true" />
          </span>
        )}
      </span>
      {head.label && <span className="text-default-700 shrink-0">{head.label} ·</span>}
      {/* min-w-0 + truncate: คงความสูง 1 บรรทัดเสมอ — เนื้อหาเต็มอยู่ในตัวกาง ไม่ใช่การซ่อนทิ้ง */}
      <span className="text-default-800 min-w-0 flex-1 truncate">{head.short}</span>
      {/* +N = ยังมีที่มาอื่นอีก ต้องบอกจำนวน ไม่งั้นผู้ใช้ไม่มีทางรู้ว่ามีอะไรถูกซ่อนอยู่
          ใช้ bg-default-100 ไม่ใช่ bg-card/60 แบบ ThreadStatusBar — แถบนี้พื้นโปร่ง สีจาง
          บนพื้นโปร่งจะมองไม่เห็นว่าเป็น badge */}
      {items.length > 1 && (
        <span className="bg-default-100 text-default-800 text-2xs shrink-0 rounded px-1.5 font-semibold">
          +{items.length - 1}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          items.length > 1 ? `ดูที่มาของแชททั้ง ${items.length} รายการ` : 'ดูรายละเอียดที่มาของแชท'
        }
        title="ดูรายละเอียด"
        aria-expanded={false}
        className="hover:bg-default-100 -m-1 flex shrink-0 items-center rounded p-1"
      >
        <Icon icon="chevron-down" className="text-base" />
      </button>
    </div>
  )
}
