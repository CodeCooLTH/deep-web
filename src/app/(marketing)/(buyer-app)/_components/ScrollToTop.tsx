'use client'

// เด้งขึ้นบนสุดทุกครั้งที่เปลี่ยน route ใน buyer-app (กันค้างตำแหน่ง scroll เดิมตอนกดเมนู)
// instant (ไม่ smooth) — ให้เข้าหน้าใหม่เหมือนโหลดสด. render null, ต้นทุนแทบเป็นศูนย์
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function ScrollToTop() {
  const pathname = usePathname()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}
