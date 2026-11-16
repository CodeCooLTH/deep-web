'use client'

import { useEffect, useState } from 'react'

/** เวลาปัจจุบัน (ms) ที่ขยับทุก everyMs ขณะ active — ให้ "อีก 25 นาที" ไม่ค้างค่าเก่าระหว่างเปิดห้องไว้ */
export function useNowMs(active: boolean, everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs])
  return now
}
