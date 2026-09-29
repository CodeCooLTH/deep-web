'use client'

import { useEffect, useState } from 'react'

/**
 * `matchMedia('(min-width: Npx)')` แบบ SSR-safe — ค่าเริ่มต้น `null` = "ยังไม่รู้" (server กับ client รอบแรก
 * ตรงกัน กัน hydration mismatch) แล้ว sync ใน effect + ฟัง change
 * ใช้เมื่อ "ไม่ mount" ชุดที่ซ่อนดีกว่าซ่อนด้วย CSS (ซ่อนด้วย CSS ยัง fetch/subscribe/poll ต่อ)
 */
export function useMinWidth(px: number): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [px])
  return matches
}
