'use client'

/**
 * HideAppHeaderMobile — toggle body class เพื่อซ่อน Paces app-header บน dashboard mobile
 *
 * ทำไม: V3 ให้ CommandTopBar เป็น top bar เดียวของ /dashboard ที่ <lg
 * แต่ Paces app-header (.app-header) render ระดับ layout ทุกหน้า → ซ้อนกัน
 * แก้ด้วย body class (mount เฉพาะหน้านี้) + CSS scoped <lg ใน safepay-overrides.css
 * class ถูก add ทุก viewport แต่ CSS จำกัด effect ที่ max-width:1023px → desktop ไม่กระทบ
 *
 * Base: N/A (utility client island — ไม่มี UI)
 */
import { useEffect } from 'react'

export default function HideAppHeaderMobile() {
  useEffect(() => {
    document.body.classList.add('cc-hide-appheader')
    return () => document.body.classList.remove('cc-hide-appheader')
  }, [])

  return null
}
