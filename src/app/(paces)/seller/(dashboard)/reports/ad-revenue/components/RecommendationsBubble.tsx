'use client'

/**
 * RecommendationsBubble — คำแนะนำ (FR-018) เป็น bubble สี info มุมขวาล่าง ปิดไว้ก่อน มีเลขจำนวนข้อ → กดเปิดแผง (00091 เฟส 3 · มติ user 2026-11-15)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (ปุ่มกลม `btn ... rounded-full bg-{tone}` · ตัวปุ่ม bubble) + theme/paces/Admin/TS/src/app/(admin)/ui/popovers/page.tsx (กล่อง `border rounded-md bg-card` · หัว `bg-default-100 border-b px-3.5 py-3`) + ui/offcanvas/page.tsx (หัวข้อ + ปุ่มปิด) · ป้าย: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *   ม็อกอัพอ้างอิง: docs/superpowers/specs/2026-11-15-00094-ads-summary-mockup.html (insightsBubble) · แถวเปิดชีตออเดอร์: reports/ads/components/TopAdsCard.tsx
 * 🛑 ไม่มีคำแนะนำ = ไม่วาด bubble · แสดงทุกแท็บ · แผง role="dialog" · Esc/คลิกนอก = ปิด · โฟกัสกลับที่ bubble
 * 🛑 ป้ายห้ามเขียว/แดง: ควรตรวจสอบ = เหลือง · โอกาส = น้ำเงิน · ชีตออเดอร์เปิดทับ (มี overlay ของตัวเอง) → ปิดแผงก่อนเปิด
 */
import { useEffect, useRef, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { INSIGHT_RULES, type Insight } from '@/lib/ad-revenue-view'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import AdOrdersSheet from '../../ads/components/AdOrdersSheet'
import InfoTip from './InfoTip'
import type { AdMetrics } from './data'

const CAP = 8
type SheetAd = Pick<AdMetrics, 'adId' | 'adTitle' | 'adPhotoFileId' | 'chats' | 'orders' | 'sales'>

export default function RecommendationsBubble({ insights, ads, noun, rangeQuery }: { insights: Insight[]; ads: SheetAd[]; noun: string; rangeQuery: string }) {
  const t = useT()
  const a = t.adRevenue
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<SheetAd | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // เปิดแผงแล้วย้ายโฟกัสเข้าแผง — ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านจอไม่ต้องไล่หาแผงเอง
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  if (insights.length === 0) return null
  const byId = new Map(ads.map((x) => [x.adId, x]))
  const shown = insights.slice(0, CAP)

  return (
    <>
      <div ref={wrapRef} className="fixed end-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 lg:bottom-6"> {/* arbitrary: 5.5rem = แถบเมนูล่างของแอป 72px + 16px (ค่าเดียวกับ SellerBottomNav) — ที่ <lg bubble ต้องลอยเหนือแถบ · ไม่มี token */}
        {open && (
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-labelledby="ad-revenue-reco-h" className="bg-card border-default-300 absolute end-0 bottom-full mb-3 w-96 max-w-[calc(100vw-3rem)] rounded-md border shadow-lg outline-none"> {/* arbitrary: max-w เท่าจอลบระยะ bubble ซ้าย/ขวา (end-6 ×2) กันแผงล้นบนแท็บเล็ตแนวตั้ง — ไม่มี token */}
            <div className="bg-default-100 border-default-300 flex items-center gap-2 rounded-t-md border-b px-3.5 py-3">
              <Icon icon="bulb" className="text-info-ink text-lg" aria-hidden="true" />
              <h4 id="ad-revenue-reco-h" className="mb-0 flex-1 text-base font-semibold">{a.recoTitle}</h4>
              <InfoTip text={`${insights.length > CAP ? `${fmt(a.recoCap, { a: CAP, n: insights.length })} · ` : ''}${fmt(a.recoBasis, { min: INSIGHT_RULES.minOrders, noun })}`} />
              <button type="button" aria-label={a.recoClose} onClick={() => { setOpen(false); btnRef.current?.focus() }} className="btn btn-icon min-h-11 min-w-11 lg:min-h-0 lg:min-w-0">
                <Icon icon="x" className="text-lg" aria-hidden="true" />
              </button>
            </div>
            <ul className="divide-default-100 m-0 max-h-96 list-none divide-y overflow-y-auto p-0">
              {shown.map((i) => {
                const ad = byId.get(i.adId)
                const name = adDisplayName(i.adTitle, i.adId, t.inbox.contextBar.adIdFallback) ?? i.adId
                const copy = a.insight[i.kind]
                const review = i.level === 'REVIEW'
                return (
                  <li key={`${i.adId}|${i.kind}`}>
                    <button type="button" disabled={!ad} onClick={() => { if (ad) { setOpen(false); setSheet(ad) } }} className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-start">
                      <AdThumb photoFileId={ad?.adPhotoFileId} className="size-8 rounded-md" iconClass="text-base" />
                      <span className="min-w-0 flex-1">
                        <span className="text-default-900 block truncate text-sm font-medium" title={name}>{name}</span>
                        <span className="text-default-900 block text-sm">{copy.title} · {fmt(copy.detail, { value: i.value.toFixed(1), benchmark: i.benchmark.toFixed(1), product: i.productName ?? '' })}</span>
                        <span className="text-default-700 block text-sm">{copy.tryIt}</span>
                      </span>
                      <span className={review ? 'badge bg-warning/15 text-warning-ink shrink-0' : 'badge bg-primary/15 text-primary-ink shrink-0'}>
                        <Icon icon={review ? 'alert-triangle' : 'trending-up'} className="me-1 text-sm" aria-hidden="true" />
                        {review ? a.levelReview : a.levelOpportunity}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <button
          ref={btnRef} type="button" aria-expanded={open} aria-haspopup="dialog" aria-label={fmt(a.recoAria, { n: insights.length })} onClick={() => setOpen((v) => !v)}
          className="btn btn-icon bg-info text-info-ink relative size-14 rounded-full shadow-lg">
          <Icon icon={open ? 'x' : 'bulb'} className="text-2xl" aria-hidden="true" />
          {!open && <span className="bg-warning text-default-900 border-card text-2xs absolute -end-1 -top-1 flex size-5.5 items-center justify-center rounded-full border-2 font-bold">{insights.length}</span>}
        </button>
      </div>
      {sheet && <AdOrdersSheet row={sheet} noun={noun} rangeQuery={rangeQuery} onClose={() => setSheet(null)} />}
    </>
  )
}
