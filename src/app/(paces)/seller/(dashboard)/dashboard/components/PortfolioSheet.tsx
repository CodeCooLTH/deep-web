'use client'

/**
 * PortfolioSheet — ชีตเต็มจอของการ์ด "ยอดขายทุกธุรกิจ" บนมือถือ (feature 00069 v1.1)
 *
 * Base: ./SalesChartSheet.tsx (in-app precedent) — shell เต็มจอ (fixed inset-0 z-80, header ปุ่มปิด + ชื่อ, ESC ปิด,
 *   role="dialog", useLockBodyScroll, ปิดเมื่อจอข้ามเส้น lg) · เนื้อในคือ PortfolioPanel variant sheet
 * ปุ่มปิดใช้ icon ลูกศรซ้าย (tabler:arrow-left ตาม spec v1.1) ไม่ใช่ chevron ของชีตยอดขาย
 */
import { useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { PORTFOLIO_CARD_TITLE } from '@/lib/portfolio-display'
import type { PortfolioSeries } from '@/services/business-overview.service'
import PortfolioPanel from './PortfolioPanel'

type Props = { initial: PortfolioSeries; onClose: () => void }

export default function PortfolioSheet({ initial, onClose }: Props) {
  // overlay นี้ mount เฉพาะตอนเปิด จึงตรึงหน้าข้างหลังตลอดอายุของมัน
  useLockBodyScroll(true)

  // ชีตอยู่ใต้ wrapper `lg:hidden` — หมุน iPad ข้ามเส้น 1024 แล้วชีตหายจากจอแต่ยัง mount ⇒ ล็อก scroll ค้าง
  // ⇒ ข้ามเส้น lg เมื่อไหร่ ปิดชีตเลย (บรรทัด 390–397 ของ SalesChartSheet)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [onClose])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — pattern เดียวกับ SalesChartSheet
    <div className="fixed inset-0 z-80 flex flex-col bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-label={PORTFOLIO_CARD_TITLE}> {/* carve-out: safe-area ไม่มี token — เปลือก fixed inset-0 เป็นคนรับ inset (ios-safe-area.md) */}
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        {/* 44px — ปุ่มเปล่าไม่มี .btn จึงไม่โดนกฎ 44px ของระบบ */}
        <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-default-700">
          <Icon icon="arrow-left" className="size-6" />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-dark">{PORTFOLIO_CARD_TITLE}</h3>
      </div>
      {/* overscroll-contain กันเลื่อนทะลุไปหน้าข้างหลัง */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        <div className="mx-auto w-full max-w-lg py-4">
          <PortfolioPanel initial={initial} variant="sheet" />
        </div>
      </div>
    </div>
  )
}
