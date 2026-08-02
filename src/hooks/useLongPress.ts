'use client'

/**
 * useLongPress — "กดค้าง" บนมือถือ (user สั่ง 2026-08-02)
 *
 * ทำไมต้องมี: ปุ่มตอบกลับ/คัดลอกในเธรดแชทเป็น `lg:group-hover:flex` = ผูกกับ hover ซึ่งมือถือ
 * ไม่มี — ผลคือบนมือถือไม่ใช่แค่ "กดยาก" แต่ปุ่มไม่เคยโผล่เลยสักครั้ง กดค้างจึงเป็นทางเข้าเดียว
 * ที่เหลือ และตรงกับที่ Messenger/LINE/WhatsApp ทำอยู่แล้ว (คนใช้มือถือคาดหวังท่านี้)
 *
 * เงื่อนไขที่ทำให้ "ไม่" นับเป็นกดค้าง — สำคัญกว่าตัวจับเวลา เพราะ false positive ระหว่างเลื่อน
 * อ่านข้อความจะน่ารำคาญกว่าการไม่มีฟีเจอร์:
 *   - นิ้วขยับเกิน MOVE_TOLERANCE = ตั้งใจ scroll ไม่ใช่กดค้าง
 *   - มีนิ้วที่สอง (pinch/zoom)
 *   - ปล่อยก่อนครบเวลา
 *   - เลื่อนเธรด (scroll) ระหว่างกด
 */
import { useCallback, useEffect, useRef } from 'react'

/** 500ms — ตรงกับ threshold ที่ iOS/Android ใช้กับ context menu ของระบบ กดสั้นกว่านี้คนจะเผลอติด */
const LONG_PRESS_MS = 500
/** ขยับเกินนี้ (px) ถือว่ากำลังเลื่อนหน้าจอ ไม่ใช่กดค้าง — 10px เผื่อมือสั่นตอนกดนิ่ง ๆ */
const MOVE_TOLERANCE = 10

export type LongPressPoint = { x: number; y: number }

export function useLongPress(onLongPress: (point: LongPressPoint) => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<LongPressPoint | null>(null)
  const fired = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }, [])

  // เก็บกวาด timer ตอน unmount — ไม่งั้นเมนูอาจเด้งหลังผู้ใช้เปลี่ยนเธรดไปแล้ว
  useEffect(() => cancel, [cancel])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return cancel()
      const t = e.touches[0]
      const point = { x: t.clientX, y: t.clientY }
      start.current = point
      fired.current = false
      timer.current = setTimeout(() => {
        fired.current = true
        // สั่นสั้น ๆ ให้รู้ว่าติดแล้วโดยไม่ต้องมองจอ (Android รองรับ; iOS Safari ไม่มี — ข้ามไปเงียบ ๆ)
        navigator.vibrate?.(15)
        onLongPress(point)
      }, LONG_PRESS_MS)
    },
    [cancel, enabled, onLongPress],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!start.current) return
      const t = e.touches[0]
      if (
        Math.abs(t.clientX - start.current.x) > MOVE_TOLERANCE ||
        Math.abs(t.clientY - start.current.y) > MOVE_TOLERANCE
      ) {
        cancel()
      }
    },
    [cancel],
  )

  /** true = เพิ่งยิง long-press ไป → caller ควร preventDefault กันคลิก/เมนูของระบบตามมา */
  const didFire = useCallback(() => fired.current, [])

  return {
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      // กดค้างบน iOS จะเด้ง callout ของระบบ (คัดลอก/แชร์) ทับเมนูเรา — ปิดที่ตัว element
      onContextMenu: (e: React.MouseEvent) => {
        if (fired.current) e.preventDefault()
      },
    },
    didFire,
    cancel,
  }
}
