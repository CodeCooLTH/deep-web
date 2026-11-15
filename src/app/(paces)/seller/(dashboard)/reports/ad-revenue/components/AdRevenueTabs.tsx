'use client'

/**
 * AdRevenueTabs — แถบแท็บ 7 มุมมองของหน้า "วิเคราะห์ยอดขายจากโฆษณา" (00091 เฟส 3 · ผูก ?tab=)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx (ชุด .nav-tabs/.nav-link ของ Paces) ผ่าน
 *   src/app/(paces)/seller/(dashboard)/sales/components/FinanceTabs.tsx (nav role=tablist + button role=tab + roving tabindex)
 * ไม่ทำจอมือถือ (มติ user) · ล้นที่ 768–1023 → wrap 2 แถว (`flex-wrap`) · 🛑 ห้าม overflow-x-auto (แท็บที่ถูกซ่อนครึ่งใบไม่มีใครรู้ว่ามี)
 * สลับแท็บ = push (ปุ่มย้อนกลับพากลับแท็บเดิม) · ทิ้ง campaign/adset (drill ของแท็บเดิมไม่มีความหมายกับแท็บใหม่)
 * optimistic: แท็บที่กดขึ้น active ทันที ระหว่างรอ server
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { useAdReportPending } from '../../ads/components/PendingContext'
import { AD_REVENUE_TABS, DEFAULT_TAB, PANEL_ID, type AdRevenueTab } from './data'

export default function AdRevenueTabs({ active, noun }: { active: AdRevenueTab; noun: string }) {
  const t = useT().adRevenue
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const navRef = useRef<HTMLElement | null>(null)
  const [pending, startTransition] = useTransition()
  const { setPending } = useAdReportPending()
  useEffect(() => { setPending(pending) }, [pending, setPending])
  const [optimistic, setOptimistic] = useState<AdRevenueTab | null>(null)
  const current = pending && optimistic ? optimistic : active

  const go = useCallback((tab: AdRevenueTab) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const k of ['campaign', 'adset']) params.delete(k)
    if (tab === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', tab)
    setOptimistic(tab)
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }, [router, pathname, searchParams])

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const i = AD_REVENUE_TABS.indexOf(current)
    const to = e.key === 'ArrowRight' ? (i + 1) % AD_REVENUE_TABS.length : e.key === 'ArrowLeft' ? (i - 1 + AD_REVENUE_TABS.length) % AD_REVENUE_TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? AD_REVENUE_TABS.length - 1 : null
    if (to === null) return
    e.preventDefault()
    go(AD_REVENUE_TABS[to])
    navRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${AD_REVENUE_TABS[to]}"]`)?.focus()
  }

  return (
    <div className="mb-base">
      <nav ref={navRef} className="nav-tabs border-default-200 me-0 mt-0 flex h-auto flex-wrap border-b px-2" role="tablist" aria-label={t.viewLabel} onKeyDown={onKeyDown}>
        {AD_REVENUE_TABS.map((k) => {
          const selected = k === current
          return (
            <button
              key={k} type="button" role="tab" data-tab={k} id={`ad-revenue-tab-${k}`} aria-selected={selected} aria-controls={PANEL_ID}
              tabIndex={selected ? 0 : -1} onClick={() => go(k)}
              className="nav-link -mb-px inline-flex min-h-11 min-w-0 items-end justify-center px-3 pt-3 pb-0 text-sm">
              <span className={cn('max-w-full truncate border-b-2 px-1 pb-2.5', selected ? 'border-primary text-primary font-semibold' : 'border-transparent')}>{fmt(t.tabs[k], { noun })}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
