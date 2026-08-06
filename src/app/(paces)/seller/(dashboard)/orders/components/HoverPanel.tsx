'use client'

/**
 * HoverPanel — panel ลอยตอน hover สำหรับ cell ในตารางออเดอร์ (2026-08-06)
 *
 * ทำไมต้อง portal ระดับ body: cell อยู่ใน `.table-wrapper` ซึ่งเป็น overflow-auto
 * (custom/_table.css) — panel แบบ absolute ใน cell จะโดน clip ที่ขอบกล่อง scroll
 * (แถวบนสุดเปิดขึ้นบนแล้วหัวหาย) และดัน scrollbar แนวนอนเพี้ยน
 *
 * ตำแหน่งคำนวณตอน mouseenter จาก getBoundingClientRect (position: fixed):
 * เปิดขึ้นบนเป็นหลัก — ที่ว่างเหนือ trigger ไม่พอค่อยเปิดลงล่าง · เลื่อน wheel = ปิด
 * (ตำแหน่ง fixed ไม่เลื่อนตามเนื้อหา ปล่อยค้างไว้จะลอยผิดที่)
 *
 * panel เป็น display-only (pointer-events-none) — เมาส์ออกจาก trigger คือปิด
 * ไม่มี interaction ใน panel โดยเจตนา (hover-panel ที่ต้องเอาเมาส์ไปคลิกข้างใน = กับดัก)
 */

import { useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** เนื้อหาที่วางในตาราง (จุด hover) */
  trigger: ReactNode
  /** เนื้อ panel — การ์ดพร้อมกรอบ/เงาให้แล้วจากตัวนี้ */
  children: ReactNode
  /** ความกว้าง panel (px) — ใช้ clamp ขอบจอ */
  width?: number
  className?: string
}

export default function HoverPanel({ trigger, children, width = 320, className }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null)

  const open = () => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
    // ที่ว่างเหนือ trigger ไม่พอ (แถวบนสุดของจอ) → เปิดลงล่างแทน
    const below = r.top < 340
    setPos({ top: below ? r.bottom + 8 : r.top - 8, left, below })
  }

  return (
    <div
      ref={anchorRef}
      onMouseEnter={open}
      onMouseLeave={() => setPos(null)}
      onWheel={() => setPos(null)}
      className={className}
    >
      {trigger}
      {pos &&
        createPortal(
          <div
            /* positioning จำเป็นต้องเป็นค่าคำนวณ runtime — token แทนไม่ได้ */
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width,
              transform: pos.below ? undefined : 'translateY(-100%)',
              zIndex: 40,
            }}
            className="border-default-200 bg-card pointer-events-none rounded-lg border shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  )
}
