'use client'

// ≥lg (1024) = เส้นสลับเดียวกับ seller shell ทั้งตัว (ท่าเดียวกับ QueuesCalendarSwitch: mount ตัวเดียว
// ไม่ render สองชุดแล้วซ่อนด้วย CSS — display:none ไม่หยุด effect และทำ DOM ซ้ำ)
// ค่าตั้งต้นฝั่ง server = false (มือถือก่อน) แล้วสลับหลัง hydrate — ข้อมูลรายการโหลดฝั่ง client อยู่แล้วจึงไม่มีอะไรกระพริบ
import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 1024px)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
