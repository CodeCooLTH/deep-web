'use client'

/**
 * ProductPickerSheet — bottom sheet เลือกสินค้า (quick create < lg): ค้นหา ชื่อ+SKU + สินค้าขายดี card slide + list สินค้าทั้งหมด (lazy-load) + custom
 * Base: mockup 2026-07-06-quick-create-order.html (frame "แตะชื่อสินค้า → เลือก") + ProductCombobox (filter/rows/custom) + ProductGrid (input-icon-group + card)
 * custom React state (ไม่ใช้ Preline hs-overlay — QuickForm re-render หนัก; ux spec HR-lesson 2026-06-15)
 * เปิดมา → โชว์ list สินค้าทันที 10 รายการ, เลื่อนใกล้ล่าง → +10 (lazy-load); พิมพ์ → filtered
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
import type { CatalogProduct } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  open: boolean
  catalog: CatalogProduct[]
  bestSellers: CatalogProduct[]
  /** คำเรียกของที่ร้านขาย (สินค้า/บริการ/ห้องพัก) — SSOT: PRODUCT_VOCAB */
  productNoun?: string
  onPick: (p: CatalogProduct) => void
  onCustom: (text: string) => void
  onClose: () => void
}

export default function ProductPickerSheet({ open, catalog, bestSellers, productNoun = 'สินค้า', onPick, onCustom, onClose }: Props) {
  /**
   * ตรึง scroll หน้าข้างหลังระหว่างเปิด — sheet นี้ประกอบเองด้วย React state (ดูคอมเมนต์หัวไฟล์
   * ว่าทำไมไม่ใช้ Preline) จึงไม่ได้ล็อกฟรีแบบ hs-overlay · docs/conventions/overlay-scroll-lock.md
   * ต้องเรียก **ก่อน** `if (!open) return null` ข้างล่าง ไม่งั้นผิด rules of hooks
   */
  useLockBodyScroll(open)

  const [q, setQ] = useState('')
  const [visibleCount, setVisibleCount] = useState(10) // lazy-load: เริ่ม 10, เลื่อน→+10
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setVisibleCount(10)
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  // reset จำนวนที่แสดงเมื่อเปลี่ยนคำค้น
  useEffect(() => setVisibleCount(10), [q])

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
  // ชื่อตรงเป๊ะกับสินค้าที่มีแล้ว → ซ่อน "ใช้เป็นสินค้าใหม่" (กันสร้างชื่อซ้ำ)
  const exactNameMatch = !!s && catalog.some((p) => p.name.trim().toLowerCase() === s)

  // lazy-load: เลื่อนใกล้ล่าง → แสดงเพิ่ม 10 (เฉพาะ list สินค้าทั้งหมด ตอนไม่ค้นหา)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (s) return
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      setVisibleCount((v) => (v < catalog.length ? v + 10 : v))
    }
  }

  const productRow = (p: CatalogProduct) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onPick(p)}
      className="flex w-full items-center gap-3 py-2.5 text-left"
    >
      <ProductThumb src={p.image} alt={p.name} className="size-10 rounded-lg" iconClassName="size-5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-dark">{p.name}</p>
        {/* "รหัส" แทน "SKU": ศัพท์เฉพาะที่กลุ่มผู้ใช้ของเราไม่ต้องรู้จัก และร้านบริการไม่ได้ใช้คำนี้เลย */}
        {p.sku && <p className="truncate text-xs text-default-400">รหัส {p.sku}</p>}
      </div>
      <span className="shrink-0 text-sm font-semibold text-primary">{formatThb(p.price)}</span>
    </button>
  )

  if (!open) return null

  return (
    <>
      {/* dim: z-70 (ต่ำกว่า sheet z-80, สูงกว่า (fullscreen) layout z-50 + footer z-40) */}
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={onClose} aria-hidden="true" />
      <div
        className={'fixed inset-x-0 bottom-0 z-80 flex h-[75dvh] flex-col rounded-t-2xl border-t border-default-300 bg-card' /* HR7: inset-x-0 bottom-0 + h-[75dvh] = viewport-lock, Paces ไม่มี token — sheet สูงคงที่ list มีที่พอ */}
        role="dialog"
        aria-label={`เลือก${productNoun}`}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className="shrink-0 px-4 pt-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-dark">เลือก{productNoun}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex size-9 items-center justify-center text-default-400"
            >
              <Icon icon="x" className="size-5" />
            </button>
          </div>
          {/* สินค้าขายดี card slide — เหนือช่องค้นหา (ซ่อนตอนพิมพ์ค้นหา) */}
          {!s && bestSellers.length > 0 && (
            <>
              {/* Impeccable: ตัด tracking-wide + ตัวพิมพ์ใหญ่บังคับเดิม — สระ/วรรณยุกต์ไทยหลุดจากพยัญชนะเมื่อ
                  tracking กว้าง และคลาสเดิมไม่มีผลกับอักษรไทยอยู่แล้ว (เหมือน 18 จุดที่แก้ไปแล้วใน Phase A) */}
              <p className="mb-2 text-2xs font-bold text-default-400">{productNoun}ยอดนิยม</p>
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
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
              placeholder={`ค้นหา${productNoun}`}
              className="form-input"
            />
          </div>
        </div>

        <div
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          {/* สินค้าทั้งหมด (ยังไม่พิมพ์) — โชว์ 10 รายการ + lazy-load เมื่อเลื่อน */}
          {!s && catalog.length > 0 && (
            <>
              {/* Impeccable: ตัด tracking-wide + ตัวพิมพ์ใหญ่บังคับเดิม (เหตุผลเดียวกับ label "สินค้าขายดี" ด้านบน) */}
              <p className="mb-1 text-2xs font-bold text-default-400">{productNoun}ทั้งหมด</p>
              <div className="divide-y divide-default-100">{catalog.slice(0, visibleCount).map(productRow)}</div>
              {visibleCount < catalog.length && (
                <p className="py-3 text-center text-xs text-default-400">เลื่อนเพื่อดูเพิ่ม…</p>
              )}
            </>
          )}
          {!s && catalog.length === 0 && (
            <p className="py-6 text-center text-sm text-default-400">ยังไม่มี{productNoun}ในร้าน — พิมพ์ชื่อในช่องค้นหาเพื่อเพิ่มเอง</p>
          )}

          {/* filtered list (เมื่อพิมพ์ค้นหา) */}
          {s && (
            <div className="divide-y divide-default-100">
              {filtered.map(productRow)}
              {filtered.length === 0 && (
                <p className="py-3 text-center text-sm text-default-400">ไม่พบ{productNoun}ที่ค้นหา — พิมพ์ชื่อเพื่อเพิ่มเป็นรายการใหม่ได้</p>
              )}
            </div>
          )}

          {/* custom — ใช้คำที่พิมพ์เป็นสินค้าใหม่ (blue text กลาง เหมือนค้นหาลูกค้า; ซ่อนถ้าชื่อตรงเป๊ะแล้ว กันซ้ำ) */}
          {typed && !exactNameMatch && (
            <button
              type="button"
              onClick={() => onCustom(typed)}
              className="mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-primary"
            >
              <Icon icon="plus" className="size-4 shrink-0" />
              <span className="truncate">ใช้ &ldquo;{typed}&rdquo; เป็น{productNoun}ใหม่</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
