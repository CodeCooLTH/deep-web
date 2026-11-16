'use client'

/**
 * AdRevenueTabs — แถบแท็บ 7 มุมมองของหน้า "วิเคราะห์ยอดขายจากโฆษณา" (00091 เฟส 3 · ผูก ?tab=)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx (แถบตัวชี้วัดกดได้: card-body p-0 > nav grid · ปุ่ม border-b-2 · ชื่อ + ตัวเลขใหญ่)
 *   โครง tablist + roving tabindex: src/app/(paces)/seller/(dashboard)/sales/components/FinanceTabs.tsx
 * user 2026-11-16 (ตัวเลือก A): แท็บแต่ละใบมีตัวเลขเด่นของหน้านั้น · แท็บเลือกพื้นจาง + เส้นน้ำเงินหนา (เดิมเป็นตัวหนังสือเรียงเหมือนปุ่มวันที่ "ดูยาก ใช้ยาก")
 * xl 7 คอลัมน์ · แท็บเล็ต 4 คอลัมน์ (2 แถว เห็นครบ ไม่ต้องเลื่อน — user ติว่าแท็บเล็ตไม่มีอะไรบอกว่าเลื่อนได้) · 🛑 ห้าม overflow-x-auto
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

/** values = ตัวเลขเด่นของแต่ละแท็บ (page คิดจาก report) · null = ไม่แสดงบรรทัดตัวเลข */
export default function AdRevenueTabs({ active, noun, values }: { active: AdRevenueTab; noun: string; values: Record<AdRevenueTab, string | null> }) {
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
    <div className="card mb-base">
      <div className="card-body p-0">
        <nav ref={navRef} className="grid grid-cols-4 xl:grid-cols-7" role="tablist" aria-label={t.viewLabel} onKeyDown={onKeyDown}>
          {AD_REVENUE_TABS.map((k, i) => {
            const selected = k === current
            return (
              <button
                key={k} type="button" role="tab" data-tab={k} id={`ad-revenue-tab-${k}`} aria-selected={selected} aria-controls={PANEL_ID}
                tabIndex={selected ? 0 : -1} onClick={() => go(k)}
                className={cn(
                  'border-default-300 relative flex min-h-11 min-w-0 flex-col items-start gap-0.5 border-dashed px-4 py-3 text-start',
                  // เส้นคั่นแนวตั้งเว้นใบท้ายแถว (แท็บเล็ตแถวละ 4 · xl แถวเดียว 7) · แถวแรกบนแท็บเล็ตมีเส้นคั่นล่าง
                  i !== AD_REVENUE_TABS.length - 1 && 'xl:border-e', i % 4 !== 3 && i !== AD_REVENUE_TABS.length - 1 && 'max-xl:border-e', i < 4 && 'max-xl:border-b',
                  selected ? 'bg-primary/5' : 'hover:bg-light/50',
                )}>
                {selected && <span className="bg-primary absolute inset-x-0 bottom-0 h-0.75" aria-hidden="true" />}
                <span className={cn('max-w-full truncate text-sm', selected ? 'text-primary font-semibold' : 'text-default-700')}>{fmt(t.tabs[k], { noun })}</span>
                {values[k] && <span className="text-default-900 max-w-full truncate text-base font-semibold tabular-nums">{values[k]}</span>}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
