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
 * panel กดของข้างในได้ (แก้ 2026-08-06): เดิมเป็น display-only (pointer-events-none) +
 * ปิดทันทีที่เมาส์ออกจาก trigger — แต่ในการ์ดพัสดุมีปุ่ม "คัดลอกเลขพัสดุ" อยู่จริง
 * พอขยับเมาส์ไปหาปุ่ม เมาส์ก็หลุด trigger ก่อน = panel หายไปต่อหน้า กดไม่ได้เลย (user เจอบน prod)
 *
 * กติกาใหม่: trigger กับ panel ถือเป็นพื้นที่เดียวกัน — ออกจากอันไหนก็ตั้งเวลาปิดไว้
 * CLOSE_GRACE ms แล้วถ้าเมาส์ไปโผล่อีกอันทัน (ระหว่างข้ามช่องว่าง 16px) ก็ยกเลิกการปิด
 *
 * สำคัญ: พื้นที่ hover เท่ากับกล่องของ `className` ที่ผู้เรียกส่งมา ไม่ใช่ขนาดเนื้อหา —
 * ตัว wrapper เป็น <div> ธรรมดาซึ่งกว้างเต็ม cell ผู้เรียกที่วางไว้ในตารางต้องส่ง
 * `w-fit`/`inline-flex` มาเองเสมอ ไม่งั้นที่ว่างขวามือของ cell ก็เปิด panel ด้วย
 * (user เจอบน prod 2026-08-07: "hover ห่างมาก ๆ ก็ขึ้น panel")
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** เวลาที่ให้เมาส์ข้ามช่องว่างระหว่าง trigger กับ panel — สั้นพอที่จะไม่รู้สึกว่า panel ค้าง */
const CLOSE_GRACE = 160

interface Props {
  /** เนื้อหาที่วางในตาราง (จุด hover) */
  trigger: ReactNode
  /** เนื้อ panel — การ์ดพร้อมกรอบ/เงาให้แล้วจากตัวนี้ */
  children: ReactNode
  /** ความกว้าง panel (px) — ใช้ clamp ขอบจอ */
  width?: number
  /**
   * ความสูงโดยประมาณของ panel (px) — ใช้ตัดสินว่าเปิดลงล่างได้ไหม
   *
   * วัดจริงไม่ได้ตอนคำนวณเพราะยังไม่ mount — ผู้เรียกที่รู้ว่า panel ตัวเองสูงกว่าค่าตั้งต้น
   * ต้องส่งมาเอง ไม่งั้นมันจะเปิดลงล่างแล้วท้าย panel หลุดขอบจอ (ประมาณเกินไว้ = เปิดขึ้นบน
   * ซึ่งปลอดภัยเสมอ, ประมาณขาด = เนื้อหาท้าย panel ถูกตัดหาย)
   */
  estimatedHeight?: number
  className?: string
  /**
   * เรียกตอน panel เปิด — ให้ผู้เรียกโหลดข้อมูลแบบ lazy ได้ (เช่นยิงถามสถานะพัสดุจาก iShip)
   * ผู้เรียกเป็นคนกันยิงซ้ำเอง ตัวนี้เรียกทุกครั้งที่เมาส์เข้า
   */
  onOpen?: () => void
}

export default function HoverPanel({
  trigger,
  children,
  width = 320,
  estimatedHeight = 320,
  className,
  onOpen,
}: Props) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setPos(null), CLOSE_GRACE)
  }
  const closeNow = () => {
    cancelClose()
    setPos(null)
  }

  // component ถูกถอดออกระหว่างนับถอยหลัง (เปลี่ยนหน้า/กรองตาราง) → setState บนของที่ unmount แล้ว
  useEffect(() => cancelClose, [])

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
    cancelClose()
    // เปิดค้างอยู่แล้ว (กลับมาจาก panel ระหว่างนับถอยหลัง) → ห้ามคำนวณใหม่
    // ไม่งั้น panel กระโดดไปเกาะเคอร์เซอร์ตำแหน่งใหม่ = ของที่กำลังจะกดเลื่อนหนีมือ
    if (pos) return
    const left = Math.min(Math.max(8, e.clientX - 24), window.innerWidth - width - 8)
    const below = window.innerHeight - e.clientY > estimatedHeight
    setPos({ top: below ? e.clientY + 16 : e.clientY - 16, left, below })
    onOpen?.()
  }

  return (
    <div
      ref={anchorRef}
      onMouseEnter={open}
      /**
       * onMouseOver (bubble) ไม่ใช่ onMouseEnter อย่างเดียว — panel เป็น portal ที่
       * DOM อยู่ใต้ body แต่ React ถือว่าเป็น "ลูก" ของ div นี้ enter/leave ของ React
       * จึงคิดจาก React tree: ย้ายเมาส์จาก trigger ไป panel = ไม่ออกจาก div นี้ (ไม่มี
       * leave) และย้ายกลับจาก panel มา trigger ก็ = ไม่ได้เข้าใหม่ (ไม่มี enter) →
       * ตัวนับถอยหลังที่ panel ตั้งไว้ตอน leave จะไม่มีใครยกเลิก แล้ว panel หุบทั้งที่
       * เมาส์ยังอยู่บน trigger. mouseover bubble ขึ้นมาจากทุกจุดในซับทรี (รวม portal)
       * = "ยังอยู่ในพื้นที่" ที่เชื่อถือได้ตัวเดียว
       */
      onMouseOver={cancelClose}
      onMouseLeave={scheduleClose}
      onWheel={closeNow}
      className={className}
    >
      {trigger}
      {pos &&
        createPortal(
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            /* fixed ไม่เลื่อนตามเนื้อหา — เลื่อนหน้าแล้วปล่อยค้างไว้จะลอยผิดที่ */
            onWheel={closeNow}
            /* positioning จำเป็นต้องเป็นค่าคำนวณ runtime — token แทนไม่ได้ */
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width,
              transform: pos.below ? undefined : 'translateY(-100%)',
              zIndex: 40,
            }}
            className="border-default-200 bg-card rounded-lg border shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  )
}
