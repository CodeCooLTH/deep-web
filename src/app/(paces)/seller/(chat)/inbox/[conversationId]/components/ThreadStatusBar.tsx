'use client'

/**
 * ThreadStatusBar — รวม "แถบสถานะ" ของห้องแชทให้เหลือบรรทัดเดียว กดกางดูรายละเอียด
 * (user report 2026-08-02: "การขึ้น alert box เยอะ ๆ ไม่ work มันรกหน้าจอมาก")
 *
 * ก่อนหน้านี้แต่ละสถานะเป็นกล่องของตัวเองเรียงซ้อนกันใต้หัวเธรด — ทดสอบ DeepAI / บอทพัก /
 * หมดเวลาตอบ / เพจหลุดการเชื่อมต่อ ซ้อนได้พร้อมกันถึง 4 กล่อง กินพื้นที่เกินครึ่งจอมือถือ
 * ก่อนจะเห็นข้อความแรก. แต่ละกล่องอ่านครั้งเดียวก็รู้แล้ว แต่มันอยู่ค้างตลอดเวลาที่เงื่อนไข
 * ยังจริง ซึ่งอาจเป็นหลายชั่วโมง
 *
 * ยุบ "เสมอ" แม้มีสถานะเดียว (user report 2026-08-02 รอบสอง: แถบเดียวก็ยาวเต็มบรรทัดแล้ว)
 * — แต่ยกปุ่ม/ลิงก์ของสถานะแรกขึ้นมาไว้ในบรรทัดที่ยุบด้วย เพื่อไม่ให้การยุบกลายเป็นการเพิ่ม
 * จำนวนคลิกของงานที่เคยกดได้ทันที (เช่น "ให้บอทตอบต่อ")
 *
 * ลำดับใน items = ลำดับความสำคัญ: ตัวแรกคือตัวที่โชว์ตอนยุบ caller เป็นคนเรียงมา
 *
 * Base (สี/รูปทรงกล่อง): ของเดิมใน ChatThread.tsx (bg-{tone}/15 text-{tone} rounded-lg px-3 py-2)
 */

import { useState, type ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'

export type ThreadStatusTone = 'danger' | 'warning' | 'info'

export interface ThreadStatusItem {
  key: string
  tone: ThreadStatusTone
  /** tabler icon name */
  icon: string
  /** บรรทัดเดียวตอนยุบ — ต้องสั้นพอจบในบรรทัดเดียวบนมือถือ (ตัดท้ายด้วย truncate ถ้าเกิน) */
  short: string
  /** เนื้อหาเต็มตอนกาง (กล่องสีของตัวเอง) */
  detail: ReactNode
  /** ปุ่ม/ลิงก์หลัก — ยกขึ้นมาแสดงในบรรทัดที่ยุบด้วยถ้าเป็นสถานะตัวแรก */
  action?: ReactNode
}

/** class ของกล่อง/ข้อความตามโทน — เขียนเต็มคำ ไม่ประกอบสตริง เพราะ Tailwind สแกนแบบ static */
const TONE_CLS: Record<ThreadStatusTone, string> = {
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
}

export default function ThreadStatusBar({ items }: { items: ThreadStatusItem[] }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null
  const head = items[0]

  return (
    <div className="px-4 pt-4">
      {open ? (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.key}>{it.detail}</div>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-default-500 hover:text-default-700 flex items-center gap-1 text-xs font-medium"
          >
            <Icon icon="chevron-up" className="text-sm" />
            ย่อสถานะห้อง
          </button>
        </div>
      ) : (
        <div className={`${TONE_CLS[head.tone]} flex items-center gap-2 rounded-lg px-3 py-2 text-sm`}>
          <Icon icon={head.icon} className="shrink-0 text-lg" aria-hidden="true" />
          {/* min-w-0 + truncate: ข้อความสถานะยาวได้มาก ต้องยอมตัดท้ายเพื่อคงความสูง 1 บรรทัด
              (รายละเอียดเต็มอยู่ในตัวกาง จึงไม่ใช่การซ่อนข้อมูลทิ้ง) */}
          <span className="min-w-0 flex-1 truncate">{head.short}</span>
          {head.action}
          {/* +N = ยังมีสถานะอื่นอีก ต้องบอกจำนวนไม่งั้นผู้ใช้ไม่มีทางรู้ว่ามีอะไรถูกซ่อนอยู่ */}
          {items.length > 1 && (
            <span className="bg-card/60 shrink-0 rounded px-1.5 text-xs font-semibold">+{items.length - 1}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={items.length > 1 ? `ดูสถานะห้องทั้ง ${items.length} รายการ` : 'ดูรายละเอียดสถานะห้อง'}
            title="ดูรายละเอียด"
            className="hover:bg-card/50 -m-1 flex shrink-0 items-center rounded p-1"
          >
            <Icon icon="chevron-down" className="text-base" />
          </button>
        </div>
      )}
    </div>
  )
}
