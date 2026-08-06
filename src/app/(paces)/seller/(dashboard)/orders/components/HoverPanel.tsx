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
  /**
   * เรียกตอน panel เปิด — ให้ผู้เรียกโหลดข้อมูลแบบ lazy ได้ (เช่นยิงถามสถานะพัสดุจาก iShip)
   * ผู้เรียกเป็นคนกันยิงซ้ำเอง ตัวนี้เรียกทุกครั้งที่เมาส์เข้า
   */
  onOpen?: () => void
}

export default function HoverPanel({ trigger, children, width = 320, className, onOpen }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null)

  /**
   * ตำแหน่งอิง "เมาส์" ไม่ใช่กล่อง trigger (แก้ 2026-08-06)
   *
   * เดิมคำนวณจาก getBoundingClientRect ของ trigger แล้วดันขึ้นบนเสมอ ซึ่งพอ trigger
   * เป็นบล็อกสูง ๆ (บล็อก "จัดส่งโดย" ทั้งก้อน) panel จะไปโผล่เหนือบล็อกทั้งอัน =
   * ไกลจากจุดที่เมาส์อยู่จนดูเหมือนของคนละชิ้น (user เจอบน prod)
   *
   * ตอนนี้เกาะพิกัดเมาส์: ที่ว่างใต้เคอร์เซอร์พอ (>PANEL_SPACE) ก็เปิดลงล่าง ไม่พอค่อย
   * เปิดขึ้นบน — ไม่ใช่ "ขึ้นบนไว้ก่อน" เหมือนเดิม
   */
  const open = (e: React.MouseEvent) => {
    const left = Math.min(Math.max(8, e.clientX - 24), window.innerWidth - width - 8)
    // 320 = ความสูงโดยประมาณของ panel ที่ยาวที่สุด (การ์ดพัสดุพร้อมไทม์ไลน์+ประวัติ)
    // ไม่วัดจริงเพราะยังไม่ mount ตอนคำนวณ — ประมาณเกินไว้ดีกว่าเปิดลงล่างแล้วล้นจอ
    const below = window.innerHeight - e.clientY > 320
    setPos({ top: below ? e.clientY + 16 : e.clientY - 16, left, below })
    onOpen?.()
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
