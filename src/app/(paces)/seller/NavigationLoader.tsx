'use client'

/**
 * NavigationLoader — global preloading overlay ระหว่างเปลี่ยนหน้า (seller/Paces)
 *
 * ทำไม: Next App Router รอ server data ก่อน commit หน้าใหม่ → กดลิงก์แล้ว "ค้าง" ดูเหมือนช้า.
 * overlay นี้เด้งทับทันทีที่คลิกลิงก์ภายใน → ผู้ใช้เห็นระบบตอบสนองไว ๆ แล้วปิดเมื่อหน้าใหม่มาถึง.
 *
 * กลไก: ดัก click บน <a> ภายในทุกอัน (Link ทั้งแอป) → หน่วง 150ms (กัน flash บน nav ที่เร็ว/มี loading.tsx)
 *       → โชว์ overlay; ปิดเมื่อ pathname/searchParams เปลี่ยน (route commit) หรือ safety timeout.
 * ข้อจำกัด: navigation แบบ router.push() ตรง ๆ (ไม่ผ่าน <a>) ไม่ถูกดัก — อาศัย loading.tsx ของ segment นั้นแทน.
 *
 * Visual: mirror SubmitStatusSheet loading (spinner กลางจอ) — ux-approved pattern เดียวกัน.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'

const SHOW_DELAY_MS = 150 // nav ที่เร็วกว่านี้ (มี loading.tsx/prefetch) จะไม่โชว์ overlay → ไม่ flash
const SAFETY_MS = 8000 // กัน overlay ค้างถ้า nav ล้ม/ไม่ commit

export default function NavigationLoader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (safetyTimer.current) {
      clearTimeout(safetyTimer.current)
      safetyTimer.current = null
    }
  }

  // เริ่มนำทาง → หน่วงกัน flash → โชว์ overlay + safety auto-hide
  const start = () => {
    clearTimers()
    showTimer.current = setTimeout(() => {
      setVisible(true)
      safetyTimer.current = setTimeout(() => setVisible(false), SAFETY_MS)
    }, SHOW_DELAY_MS)
  }

  // ดัก click บน internal link ทุกอัน (capture phase — จับก่อน handler อื่น preventDefault)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // เฉพาะคลิกซ้ายปกติ (ไม่ modifier / ไม่เปิดแท็บใหม่)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      const target = anchor.getAttribute('target')
      if (!href || href.startsWith('#') || target === '_blank' || anchor.hasAttribute('download')) return

      // internal เท่านั้น — ข้าม external / tel: / mailto:
      let dest: URL
      try {
        dest = new URL(href, window.location.href)
      } catch {
        return
      }
      if (dest.origin !== window.location.origin) return
      // ปลายทางเดียวกับหน้าปัจจุบัน → ไม่นับเป็นการนำทาง
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return

      start()
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      clearTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // route commit (pathname/searchParams เปลี่ยน) → ปิด overlay
  useEffect(() => {
    clearTimers()
    setVisible(false)
  }, [pathname, searchParams])

  if (!visible) return null

  return (
    // z-100 = สูงสุด (บัง layout/sheet/nav); bg-card/85 กึ่งโปร่ง = เห็นหน้าเดิมจาง ๆ ใต้ overlay ("ทับ")
    <div
      className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-card/85 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลด"
    >
      <Icon icon="loader-2" className="size-10 animate-spin text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-default-700">กำลังโหลด...</p>
    </div>
  )
}
