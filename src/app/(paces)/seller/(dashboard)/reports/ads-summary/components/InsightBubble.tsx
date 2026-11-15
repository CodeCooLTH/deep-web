'use client'

/**
 * InsightBubble — คำแนะนำ: ปุ่ม bubble กลมสีฟ้ามุมขวาล่าง (มีเลขจำนวนข้อ) → กดเปิดแผง role="dialog" เหนือปุ่ม (00094 FR-004)
 *
 * Base (แผง): theme/paces/Admin/TS/src/app/(admin)/ui/popovers/page.tsx (กล่องมีหัว + เนื้อหา)
 * Base (ข้อที่กาง/หุบ): theme/paces/Admin/TS/src/app/(admin)/ui/accordions/page.tsx · ป้ายความสำคัญ: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 * ปุ่ม bubble ลอย = ยังไม่มีต้นแบบในธีม (มติ user 2026-11-15 · BR-AIR-18) — เป็นตัวเปิดข้อมูล ไม่ใช่ action จึงไม่ติดกฎ seller-action-placement
 *
 * 🛑 Esc / คลิกนอก / ปุ่มปิด = ปิด แล้วโฟกัสกลับปุ่ม · แท็บเล็ตยกพ้น bottom nav (bottom-24) · ไม่มีข้อ = ปุ่มยังอยู่ แผงบอก "ยังไม่มีคำแนะนำ"
 * ข้อความ = แปลจาก insight.rule + params ผ่าน dictionary (lib ไม่ฝังประโยค) · ภาษา "ลอง/เทียบ/ตรวจ" + "อาจ" — ห้ามสั่ง "หยุดแอด/เพิ่มงบ" (BR-AIR-07)
 */
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { evidenceLabelKey, evidenceText, insightActKey, insightHeadKey, insightLink, insightParams, insightWhyKey } from '@/lib/ad-summary/view'
import type { Insight } from '@/lib/ad-summary/types'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'

export default function InsightBubble({ insights, rangeQuery }: { insights: Insight[]; rangeQuery: string }) {
  const t = useT().adSummary
  const d = t as Record<string, string>
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const down = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    btnRef.current?.focus()
  }
  const n = insights.length

  return (
    <div ref={wrapRef} className="fixed end-6 bottom-24 z-20 lg:bottom-6">
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-labelledby={`${uid}-h`}
          className="bg-card border-default-300 absolute end-0 bottom-full mb-3 w-80 overflow-hidden rounded-md border shadow-lg outline-none xl:w-96">
          <div className="bg-default-100 border-default-300 flex items-center gap-2 border-b px-3.5 py-3">
            <Icon icon="bulb" className="text-info-ink text-lg" aria-hidden="true" />
            <h4 id={`${uid}-h`} className="text-default-900 text-md mb-0 flex-1 font-semibold">
              {t.insTitle}
            </h4>
            <button type="button" onClick={close} aria-label={t.insClose} className="text-default-700 flex size-11 items-center justify-center rounded lg:size-8">
              <Icon icon="x" className="text-lg" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {n === 0 ? (
              <p className="text-default-700 mb-0 px-4 py-4 text-sm">{t.insNone}</p>
            ) : (
              insights.map((i, idx) => {
                const on = expanded === idx
                const link = insightLink(i)
                const href = link === 'ads' ? `/reports/ads?${rangeQuery}` : link === 'quality' ? `/reports/ad-quality?${rangeQuery}` : null
                const linkLabel = link === 'table' ? t.insLinkTable : link === 'ads' ? t.insLinkAds : t.insLinkQuality
                return (
                  <div key={`${i.rule}-${idx}`} className={cn('border-default-200 border-t first:border-t-0', on && 'bg-card')}>
                    <button
                      type="button"
                      aria-expanded={on}
                      aria-controls={`${uid}-i${idx}`}
                      onClick={() => setExpanded(on ? null : idx)}
                      className="flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-start">
                      <span className={cn('badge', i.priority === 'HIGH' ? 'bg-warning/15 text-warning-ink' : 'bg-light text-default-800')}>{i.priority === 'HIGH' ? t.prHigh : t.prMid}</span>
                      <span className="text-default-900 min-w-0 flex-1 text-sm font-medium">{fmt(d[insightHeadKey(i)], insightParams(i))}</span>
                      <Icon icon={on ? 'chevron-up' : 'chevron-down'} className="text-default-600 text-base" aria-hidden="true" />
                    </button>
                    {on && (
                      <div id={`${uid}-i${idx}`} className="space-y-3 px-4 pb-4">
                        <dl className="bg-default-50 mb-0 space-y-1 rounded p-3">
                          {i.evidence.map((e) => {
                            const v = evidenceText(e)
                            return (
                              <div key={e.key} className="flex justify-between gap-3 text-sm">
                                <dt className="text-default-700">{d[evidenceLabelKey(e.key)]}</dt>
                                <dd className="text-default-900 mb-0 font-medium tabular-nums">
                                  {v.value}
                                  {v.prev && <span className="text-default-600 ms-1 font-normal">{fmt(t.evPrev, { v: v.prev })}</span>}
                                </dd>
                              </div>
                            )
                          })}
                        </dl>
                        <div>
                          <p className="text-default-600 mb-0.5 text-xs font-medium">{t.insWhy}</p>
                          <p className="text-default-800 mb-0 text-sm">{d[insightWhyKey(i)]}</p>
                        </div>
                        <div>
                          <p className="text-default-600 mb-0.5 text-xs font-medium">{t.insTry}</p>
                          <p className="text-default-800 mb-0 text-sm">{d[insightActKey(i)]}</p>
                          {link === 'table' && (
                            <a href="#ads-summary-campaigns" onClick={() => setOpen(false)} className="text-primary-ink mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium lg:min-h-0">
                              {linkLabel}
                              <Icon icon="arrow-down" className="text-sm" aria-hidden="true" />
                            </a>
                          )}
                          {href && (
                            <Link href={href} className="text-primary-ink mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium lg:min-h-0">
                              {linkLabel}
                              <Icon icon="arrow-right" className="text-sm" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                        <p className="text-default-600 mb-0 text-xs">{fmt(t.insConf, { v: i.confidence === 'HIGH' ? t.confHigh : t.confMid })}</p>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={fmt(t.insAria, { n })}
        onClick={() => setOpen((o) => !o)}
        className="bg-info text-info-ink relative flex size-14 items-center justify-center rounded-full shadow-lg">
        <Icon icon={open ? 'x' : 'bulb'} className="text-2xl" aria-hidden="true" />
        {n > 0 && !open && <span className="bg-warning text-default-900 border-card text-2xs absolute -end-1 -top-1 flex size-5.5 items-center justify-center rounded-full border-2 font-bold">{n}</span>}
      </button>
    </div>
  )
}
