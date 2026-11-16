'use client'

/**
 * useSwipeToReply — ปัดข้อความในเธรดเพื่อตอบกลับ (เท่าแอปผู้ขาย SwipeToReply · user สั่ง 2026-11-16)
 *
 * จับที่ระดับ container ตัวเดียวแบบเดียวกับ useLongPress (hook เรียกในลูปไม่ได้) แล้ว resolve แถวจาก
 * `[data-message-id]` ที่นิ้วแตะ · ผู้เรียกบอกว่าแถวนั้น "ของเราไหม / ตอบได้ไหม" ผ่าน resolve()
 *
 * ขยับ DOM ตรง ๆ (style.transform) ไม่ผ่าน state — touchmove ยิงทุกเฟรม ถ้า setState ทั้งเธรด re-render ทุกเฟรม
 * เลื่อน "ลูกของแถว" ไม่ใช่ตัวแถว ไอคอนตอบกลับ (ลูกที่เราเติมเข้าไป) จึงอยู่กับที่ข้างบับเบิลเหมือนแอป
 * กติการะยะ/ล็อกแนวนอน: lib/chat-swipe-reply.ts (ตัวเลขเท่าแอป)
 */
import { useCallback, useEffect, useRef } from 'react'

import { useStableCallback } from '@/hooks/useStableCallback'
import { swipeDistance, swipeIconOpacity, swipeLock, swipeOffset, swipeReached } from '@/lib/chat-swipe-reply'

export type SwipeRowInfo<T> = { message: T; mine: boolean }

const ICON_ATTR = 'data-swipe-reply-icon'
/** tabler arrow-back-up — ไอคอนเดียวกับเมนู "ตอบกลับ" (แอปใช้ตัวเดียวกัน) · สร้างด้วย createElementNS (ไม่ต่อสตริง HTML) */
function replyIconSvg(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({ width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  for (const d of ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1']) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

type Active<T> = {
  row: HTMLElement
  info: SwipeRowInfo<T>
  x0: number
  y0: number
  state: 'pending' | 'swipe'
  dx: number
  buzzed: boolean
  icon: HTMLElement | null
  prevPosition: string
}

export function useSwipeToReply<T>(resolve: (messageId: string) => SwipeRowInfo<T> | null, onReply: (message: T) => void) {
  const active = useRef<Active<T> | null>(null)
  // ไม่เขียน ref ระหว่าง render (react-hooks/refs) — useStableCallback อัปเดตใน layout effect
  const resolveRow = useStableCallback(resolve)
  const reply = useStableCallback(onReply)

  const kids = (row: HTMLElement) => Array.from(row.children).filter((el): el is HTMLElement => !el.hasAttribute(ICON_ATTR))

  /** เด้งกลับ + เก็บไอคอน — เรียกทั้งตอนปล่อยนิ้วและตอน unmount */
  const release = useCallback(() => {
    const a = active.current
    active.current = null
    if (!a || a.state !== 'swipe') return
    for (const el of kids(a.row)) {
      el.style.transition = 'transform 200ms cubic-bezier(.2,.9,.3,1.2)'
      el.style.transform = ''
    }
    const icon = a.icon
    if (icon) {
      icon.style.transition = 'opacity 150ms'
      icon.style.opacity = '0'
    }
    window.setTimeout(() => {
      for (const el of kids(a.row)) el.style.transition = ''
      icon?.remove()
      a.row.style.position = a.prevPosition
    }, 220)
  }, [])

  useEffect(() => release, [release])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    active.current = null
    if (e.touches.length !== 1) return
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-message-id]')
    const id = row?.getAttribute('data-message-id')
    const info = id ? resolveRow(id) : null
    if (!row || !info) return
    const t = e.touches[0]
    active.current = { row, info, x0: t.clientX, y0: t.clientY, state: 'pending', dx: 0, buzzed: false, icon: null, prevPosition: row.style.position }
  }, [resolveRow])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const a = active.current
    if (!a) return
    const t = e.touches[0]
    const dx = t.clientX - a.x0
    if (a.state === 'pending') {
      const lock = swipeLock(dx, t.clientY - a.y0, a.info.mine)
      if (lock === 'cancel') {
        active.current = null
        return
      }
      if (lock === 'pending') return
      a.state = 'swipe'
      // ไอคอนวงกลมเทา + ลูกศรตอบกลับ ข้างบับเบิล (ลูกค้า = ซ้าย · เรา = ขวา) — เท่าแอป
      a.row.style.position = 'relative'
      const icon = document.createElement('span')
      icon.setAttribute(ICON_ATTR, '')
      icon.setAttribute('aria-hidden', 'true')
      icon.className = `bg-default-200 text-default-900 pointer-events-none absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full ${a.info.mine ? 'end-2' : 'start-2'}`
      icon.appendChild(replyIconSvg())
      icon.style.opacity = '0'
      a.row.appendChild(icon)
      a.icon = icon
      for (const el of kids(a.row)) el.style.transition = ''
    }
    a.dx = swipeDistance(dx, a.info.mine)
    const off = swipeOffset(a.dx)
    for (const el of kids(a.row)) el.style.transform = `translateX(${a.info.mine ? -off : off}px)`
    if (a.icon) {
      const o = swipeIconOpacity(a.dx)
      a.icon.style.opacity = String(o)
      a.icon.style.scale = String(0.6 + 0.4 * o)
    }
    if (swipeReached(a.dx) && !a.buzzed) {
      a.buzzed = true
      // Android สั่น · iOS Safari ไม่มี vibrate — ข้ามเงียบ ๆ (เท่า useLongPress)
      navigator.vibrate?.(10)
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    const a = active.current
    if (a?.state === 'swipe' && swipeReached(a.dx)) reply(a.info.message)
    release()
  }, [release, reply])

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: release }
}
