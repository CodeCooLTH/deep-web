'use client'

// เด้ง main กลับบนสุดทุกครั้งเปลี่ยน route (main เป็น scroll container ของ app-shell ไม่ใช่ window)
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function MScrollReset() {
  const pathname = usePathname()
  useEffect(() => {
    document.getElementById('m-scroll')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}
