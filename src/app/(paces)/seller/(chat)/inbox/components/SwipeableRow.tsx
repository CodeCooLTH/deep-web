'use client'

/**
 * SwipeableRow — ปัดซ้ายเพื่อเผยปุ่ม action (feat 00018, mobile) — แทนปุ่ม ⋮ ใหญ่ต่อแถว (user request
 * 2026-07-23 "mobile รู้กันว่าปัดได้"). ปุ่ม ⋮ ยังอยู่บน desktop (ไม่มี touch → ไม่ปัด)
 *
 * touch-action: pan-y — บอกเบราว์เซอร์ให้จัดการ scroll แนวตั้งเอง แล้วส่ง gesture แนวนอนมาให้ JS
 * (ไม่ต้อง preventDefault ซึ่ง React touch listener เป็น passive ทำไม่ได้) — วิธีมาตรฐานของ swipe list
 *
 * Base: theme/paces card row — actions layer วางหลัง content ที่เลื่อน (bg-card ทึบปิดไว้ตอนปิด)
 */
import { useRef, useState } from 'react'

type Props = {
  /** ปุ่ม action ที่เผยเมื่อปัดซ้าย (parent ส่งมา — pin/resolve/hide) */
  actions: React.ReactNode
  /** ความกว้างรวมของโซน action (px) — เท่ากับจำนวนปุ่ม × ความกว้างปุ่ม */
  actionsWidth?: number
  children: React.ReactNode
}

export default function SwipeableRow({ actions, actionsWidth = 156, children }: Props) {
  const [offset, setOffset] = useState(0) // translateX ปัจจุบัน (0 ปิด, -actionsWidth เปิดเต็ม)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const baseOffset = useRef(0)
  const axis = useRef<'h' | 'v' | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    baseOffset.current = offset
    axis.current = null
    setDragging(true)
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (axis.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (axis.current !== 'h') return // ปัดแนวตั้ง → ปล่อยให้ scroll (touch-action: pan-y)
    let next = baseOffset.current + dx
    if (next > 0) next = 0
    if (next < -actionsWidth) next = -actionsWidth
    setOffset(next)
  }

  function onTouchEnd() {
    setDragging(false)
    if (axis.current === 'h') setOffset(offset < -actionsWidth / 2 ? -actionsWidth : 0)
  }

  const isOpen = offset !== 0

  return (
    <div className="bg-card relative overflow-hidden">
      {/* action layer หลัง content — เผยเมื่อ content เลื่อนซ้าย */}
      <div className="absolute inset-y-0 end-0 flex" style={{ width: actionsWidth }} aria-hidden={!isOpen}>
        {actions}
      </div>

      <div
        className={`bg-card relative ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // เปิดอยู่แล้วแตะเนื้อหา = ปิดก่อน (ไม่ให้ลิงก์เด้งไปหน้าเธรด) — คลิกจริงบน desktop offset=0 เสมอ
        onClickCapture={(e) => {
          if (isOpen) {
            e.preventDefault()
            e.stopPropagation()
            setOffset(0)
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
