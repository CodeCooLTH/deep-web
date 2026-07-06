'use client'

// ใส่ class .m-app-shell ที่ <body> ตอนอยู่ในแอปมือถือ (/m) → body เป็นขาว (paper)
// กัน gap เทาโผล่ใต้ bottom nav ถ้า root fixed inset-0 ไม่ถึงขอบล่างเป๊ะบน iOS.
// ถอด class ตอนออกจาก /m (desktop/tablet body ยังเทา default ให้ card เด่น)
import { useEffect } from 'react'

export default function MBodyBg() {
  useEffect(() => {
    document.body.classList.add('m-app-shell')
    return () => document.body.classList.remove('m-app-shell')
  }, [])
  return null
}
