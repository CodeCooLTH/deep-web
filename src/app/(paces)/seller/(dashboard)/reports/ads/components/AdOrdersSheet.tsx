'use client'

/**
 * AdOrdersSheet — ชีตรายการคำสั่งซื้อของแอดหนึ่งตัว (feature 00091 FR-008 "กดแถว → รายการคำสั่งซื้อของแอดนั้น")
 *
 * Base (เปลือก: ล็อก scroll · ปุ่มย้อนกลับปิดชีตแทนออกจากหน้า · focus trap):
 *   src/app/(paces)/seller/(dashboard)/reports/products/components/ProductDetailSheet.tsx
 *   (ซึ่ง copy `fixed inset-0 flex flex-col bg-card` มาจาก products/components/ProductsListing.tsx filter modal)
 * Base (แผงชิดขวาเดสก์ท็อป): theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 * เนื้อหาใหม่ทั้งหมด · โหลดแบบ lazy ผ่าน GET /api/reports/ads/orders (≤50 ใบล่าสุด)
 *
 * 🛑 ปิดด้วยปุ่มย้อนกลับของเครื่อง = ปิดชีต ไม่ใช่ออกจากรายงาน (pushedRef กัน push ซ้ำ)
 * 🛑 useLockBodyScroll เจ้าของเดียว — ชีตนี้ประกอบเอง ไม่มี MUI/Preline ซ้อนข้างใน
 */
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatDateTime } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import { formatOrderNo } from '@/lib/order-no'
import { ORDER_STATUS_META } from '@/lib/order-display'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { AdViewRow } from './data'

type SheetOrder = {
  id: string
  publicToken: string
  orderNo: string | null
  buyerName: string | null
  createdAtISO: string
  status: string
  totalAmount: number
}

type Props = {
  row: AdViewRow
  noun: string
  /** query ของช่วงที่ดูอยู่ — `from=&to=&shopChannelId=` (ไม่รวม adId) */
  rangeQuery: string
  onClose: () => void
}

export default function AdOrdersSheet({ row, noun, rangeQuery, onClose }: Props) {
  const t = useT()
  useLockBodyScroll(true)

  const panelRef = useRef<HTMLDivElement>(null)
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!pushedRef.current) {
      window.history.pushState({ deepAdSheet: true }, '')
      pushedRef.current = true
    }
    const onPop = () => {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const close = () => {
    if (pushedRef.current) {
      window.history.back() // popstate handler เรียก onClose ให้เอง
      return
    }
    onClose()
  }
  useDialogFocus(true, panelRef, close)

  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: SheetOrder[]; hasMore: boolean }>({ kind: 'loading' })
  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch(`/api/reports/ads/orders?adId=${encodeURIComponent(row.adId)}&${rangeQuery}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { items: SheetOrder[]; hasMore: boolean }
      setState({ kind: 'ok', items: json.items, hasMore: json.hasMore })
    } catch {
      setState({ kind: 'error' })
    }
  }, [row.adId, rangeQuery])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดครั้งแรกเมื่อเปิดชีต (คำขอ lazy ตามสเปก)
    void load()
  }, [load])

  const name = adDisplayName(row.adTitle, row.adId, t.inbox.contextBar.adIdFallback) ?? row.adId

  return (
    <div
      ref={panelRef}
      className={'bg-card fixed inset-0 z-50 flex flex-col lg:start-auto lg:w-full lg:max-w-xl lg:border-s lg:border-default-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' /* carve-out: safe-area ไม่มี token — เปลือก fixed รับ inset */}
      role="dialog"
      aria-modal="true"
      aria-label={name}>
      <header className="border-default-200 flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <AdThumb photoFileId={row.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-default-900 mb-0 line-clamp-2 break-words text-sm font-semibold" title={name}>{name}</h2>
          <p className="text-default-700 mb-0 text-xs tabular-nums">
            {fmt(t.adReport.sheetSummary, { chats: row.chats, noun, orders: row.orders, sales: formatBaht(row.sales) })}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t.adReport.sheetClose}
          className="btn btn-icon text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0">
          <Icon icon="x" className="text-xl" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {state.kind === 'loading' && (
          <ul className="divide-default-200 divide-y" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="bg-default-100 h-4 w-28 animate-pulse rounded" />
                <span className="bg-default-100 ms-auto h-4 w-16 animate-pulse rounded" />
              </li>
            ))}
          </ul>
        )}

        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" role="alert">
            <Icon icon="alert-triangle" className="text-warning text-3xl" aria-hidden="true" />
            <p className="text-default-700 mb-0 text-sm">{t.adReport.sheetError}</p>
            <button type="button" onClick={load} className="btn border-default-300 text-default-700 hover:bg-default-100 min-h-11 border">
              {t.adReport.sheetRetry}
            </button>
          </div>
        )}

        {state.kind === 'ok' && state.items.length === 0 && (
          <p className="text-default-500 px-4 py-12 text-center text-sm">{t.adReport.sheetEmpty}</p>
        )}

        {state.kind === 'ok' && state.items.length > 0 && (
          <ul className="divide-default-200 divide-y">
            {state.items.map((o) => {
              const cancelled = o.status === 'CANCELLED' || o.status === 'RETURNED'
              const meta = ORDER_STATUS_META[o.status]
              return (
                <li key={o.id} className={`flex items-center gap-3 px-4 py-3 ${cancelled ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/orders/${o.publicToken}`}
                      className="text-primary text-sm font-bold tabular-nums hover:underline">
                      {formatOrderNo(o.publicToken, o.createdAtISO)}
                    </Link>
                    <p className="text-default-700 mb-0 truncate text-xs">
                      {o.buyerName ?? '—'} · {formatDateTime(o.createdAtISO)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`text-default-900 text-sm font-semibold tabular-nums ${cancelled ? 'line-through' : ''}`}>
                      {formatBaht(o.totalAmount)}
                    </span>
                    {cancelled ? (
                      <span className="badge bg-default-100 text-default-700">{t.adReport.sheetCancelled}</span>
                    ) : meta ? (
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {state.kind === 'ok' && state.hasMore && (
          <p className="text-default-500 border-default-200 border-t px-4 py-3 text-center text-xs">{fmt(t.adReport.sheetMore, { noun })}</p>
        )}
      </div>
    </div>
  )
}
