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
  /**
   * 🛑 เลเยอร์ปุ่มต้อง "ไม่ถูกวาด" ตอนแถวปิด ไม่ใช่แค่ถูกบังด้วย content ที่มี bg-card ทึบ
   *
   * ปุ่มทั้งสี่เป็นสีเต็ม (warning/success/default/danger) เรียงกันเป็นแถบ ถ้าขอบล่างของ content
   * กับขอบล่างของกล่องพ่อปัดเป็น device pixel ไม่ตรงกันแม้เศษเดียว (ความสูงแถวเป็นเลขทศนิยม +
   * DPR 2–3 บนมือถือ + content ถูกยกเป็นเลเยอร์แยกเพราะมี transform ติดอยู่) แถบสีนั้นจะโผล่มา
   * เป็นเส้นบางหลากสีพาดทับเส้นประคั่นแถว — เห็นเฉพาะ *บาง* แถว เพราะขึ้นกับว่าความสูงแถวนั้น
   * ตกลงตรงกับ device pixel พอดีไหม (user report 2026-08-11 "border ด้านล่างเหมือนมีสีรุ้ง ๆ")
   *
   * แยก state จาก `isOpen` ไม่ได้ เพราะตอนปิด offset กลับเป็น 0 ทันทีแต่ transform ยังวิ่ง
   * transition อีก 200ms — ซ่อนตามค่า offset จะทำให้ปุ่มวูบหายก่อนแถวเลื่อนกลับมาปิดจริง
   */
  const [actionsPainted, setActionsPainted] = useState(false)
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
    setActionsPainted(true) // นิ้วแตะแล้ว = อาจกำลังจะปัด ต้องพร้อมเผยทันทีไม่ให้ปุ่มโผล่ตามหลัง
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
    const target = axis.current === 'h' && offset < -actionsWidth / 2 ? -actionsWidth : 0
    if (axis.current === 'h') setOffset(target)
    // แตะเฉย ๆ / ปัดแนวตั้ง = transform ไม่เปลี่ยน → `transitionend` ไม่มีวันยิง ต้องเก็บเลเยอร์เอง
    if (target === 0 && offset === 0) setActionsPainted(false)
  }

  const isOpen = offset !== 0

  return (
    // overflow-hidden จำเป็นเฉพาะจอที่ปัดได้ — ตอนลากนิ้ว content เลื่อนซ้ายและจะล้นออกนอกขอบแถว
    //
    // แต่ที่ ≥1024px มันไปตัดเมนู ⋯ ของชุดปุ่ม hover ทิ้ง (เมนูเป็น absolute top-full ซึ่งอยู่ "ใต้"
    // ขอบล่างของแถวเสมอ) ผู้ใช้จึงเห็นเมนูโผล่มาแค่เสี้ยวเดียว (user report 2026-08-03)
    // ที่ ≥1024px ไม่มี touch → offset เป็น 0 ตลอด ไม่มีอะไรล้นให้ต้องตัด จึงเปิด overflow ได้ปลอดภัย
    <div className="bg-card relative overflow-hidden lg:overflow-visible">
      {/* action layer หลัง content — เผยเมื่อ content เลื่อนซ้าย */}
      <div
        className={`absolute inset-y-0 end-0 flex ${actionsPainted ? '' : 'invisible'}`}
        style={{ width: actionsWidth }}
        aria-hidden={!isOpen}
      >
        {actions}
      </div>

      <div
        className={`bg-card relative ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // 🛑 ต้องมีคู่กับ onTouchEnd เสมอ — เบราว์เซอร์ยิง `touchcancel` แทน `touchend` เมื่อมันยึด
        // gesture ไปทำ scroll เอง (ท่าที่เกิดบ่อยที่สุดในลิสต์นี้) ถ้าไม่ดัก เลเยอร์ปุ่มจะค้างสถานะ
        // "วาดอยู่" ของแถวนั้นตลอดไป = เส้นสีกลับมาโผล่เหมือนเดิมโดยไม่มีอะไรฟ้อง
        onTouchCancel={onTouchEnd}
        // แถวเลื่อนกลับมาปิดสนิทแล้ว → เลิกวาดเลเยอร์ปุ่ม (เหตุผลเต็มอยู่ที่ actionsPainted ด้านบน)
        onTransitionEnd={(e) => {
          if (e.propertyName === 'transform' && offset === 0) setActionsPainted(false)
        }}
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
