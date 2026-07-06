'use client'

/**
 * ProductPickerSheet — bottom sheet เลือกสินค้า (quick create < lg): ค้นหา ชื่อ+SKU + สินค้าขายดี card slide + custom
 * Base: mockup 2026-07-06-quick-create-order.html (frame "แตะชื่อสินค้า → เลือก") + ProductCombobox (filter/rows/custom) + ProductGrid (input-icon-group + card)
 * custom React state (ไม่ใช้ Preline hs-overlay — QuickForm re-render หนัก; ux spec HR-lesson 2026-06-15)
 * instance เดียวที่ QuickForm ใช้ร่วมทุก line (catalog/bestSellers หนัก) — เปิดโดยกำหนด pickerIndex
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
import type { CatalogProduct } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  open: boolean
  catalog: CatalogProduct[]
  bestSellers: CatalogProduct[]
  onPick: (p: CatalogProduct) => void
  onCustom: (text: string) => void
  onClose: () => void
}

export default function ProductPickerSheet({ open, catalog, bestSellers, onPick, onCustom, onClose }: Props) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  const s = q.trim().toLowerCase()
  const typed = q.trim()
  const filtered = useMemo(() => {
    if (!s) return []
    return catalog.filter(
      (p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s),
    )
  }, [catalog, s])

  if (!open) return null

  return (
    <>
      {/* dim: z-70 (ต่ำกว่า sheet z-80, สูงกว่า (fullscreen) layout z-50 + footer z-40) */}
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={onClose} aria-hidden="true" />
      {/* HR7: fixed inset-x-0 bottom-0 + max-h-[85vh] = viewport-lock (Paces ไม่มี token; precedent AccountSwitcherSheet) */}
      <div
        className="fixed inset-x-0 bottom-0 z-80 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-default-300 bg-card"
        role="dialog"
        aria-label="เลือกสินค้า"
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className="shrink-0 px-4 pt-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-dark">เลือกสินค้า</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex size-9 items-center justify-center text-default-400"
            >
              <Icon icon="x" className="size-5" />
            </button>
          </div>
          {/* search — Paces input-icon-group (paces-component-reference §5) */}
          <div className="input-icon-group mb-3">
            <span className="input-icon">
              <Icon icon="search" className="size-4 text-default-400" />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ / SKU…"
              className="form-input"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {/* best-seller card slide (ยังไม่พิมพ์ + มี bestSellers) */}
          {!s && bestSellers.length > 0 && (
            <>
              <p className="mb-2 text-2xs font-bold tracking-wide text-default-400 uppercase">สินค้าขายดี</p>
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {bestSellers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPick(p)}
                    className="w-24 shrink-0 overflow-hidden rounded-xl border border-default-200 text-left"
                  >
                    <ProductThumb src={p.image} alt={p.name} className="aspect-video w-full" iconClassName="size-6" />
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-medium text-dark">{p.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-primary">{formatThb(p.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* filtered list (เมื่อพิมพ์ค้นหา) */}
          {s && (
            <div className="divide-y divide-default-100">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <ProductThumb src={p.image} alt={p.name} className="size-10 rounded-lg" iconClassName="size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dark">{p.name}</p>
                    {p.sku && <p className="truncate text-xs text-default-400">SKU: {p.sku}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary">{formatThb(p.price)}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="py-3 text-center text-sm text-default-400">ไม่พบสินค้าในร้าน</p>
              )}
            </div>
          )}

          {/* custom — ใช้คำที่พิมพ์เป็นสินค้าใหม่ */}
          {typed && (
            <button
              type="button"
              onClick={() => onCustom(typed)}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-primary bg-primary/5 px-3 py-3 text-left text-sm font-semibold text-primary"
            >
              <Icon icon="plus" className="size-4 shrink-0" />
              <span className="truncate">ใช้ &ldquo;{typed}&rdquo; เป็นสินค้าใหม่</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
