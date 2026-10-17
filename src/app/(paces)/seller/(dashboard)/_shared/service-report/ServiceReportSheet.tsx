'use client'

/**
 * ชีตเต็มจอ "ยอดขายและกำไร" ของร้านบริการบนมือถือ (feature 00078) — แทนชีต 3 แท็บเดิม
 * เปลือกเดียวกับ SalesChartSheet (fixed inset-0 z-80 · safe-area · ล็อกหน้าหลัง · ปิดเองเมื่อจอข้าม lg)
 */
import Link from 'next/link'
import { useEffect } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { REPORT_SETTINGS_URL, type ServiceReportChart, type ServiceReportView } from '@/lib/report-settings'
import type { ServiceReportData } from '@/lib/service-report/view-model'
import { SERVICE_REPORT_WORDS as W } from '@/lib/service-report/words'

import ServiceReportPanel from './ServiceReportPanel'

type Props = { initial: ServiceReportData; view: ServiceReportView; chart: ServiceReportChart; onClose: () => void }

export default function ServiceReportSheet({ initial, view, chart, onClose }: Props) {
  useLockBodyScroll(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [onClose])

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock (pattern เดียวกับ SalesChartSheet/AddressSearchSheet)
    <div className="fixed inset-0 z-80 flex flex-col bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-label={W.pageTitle}> {/* carve-out: safe-area ไม่มี token (ios-safe-area.md) */}
      <div className="border-default-200 flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-default-700">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <h3 className="flex-1 text-center text-base font-semibold text-dark">{W.pageTitle}</h3>
        <Link href={REPORT_SETTINGS_URL} aria-label={W.settings} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-default-700">
          <Icon icon="adjustments-horizontal" className="size-5" />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ServiceReportPanel initial={initial} view={view} chart={chart} layout="sheet" />
      </div>
    </div>
  )
}
