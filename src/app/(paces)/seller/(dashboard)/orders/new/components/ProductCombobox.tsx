'use client'

/**
 * ProductCombobox — select2 ต่อ cart line: ค้นหา/เลือกสินค้า existing หรือพิมพ์ชื่อใหม่ = custom item
 * custom React state — ห้ามใช้ Preline hs-dropdown (กัน opacity ค้าง; feedback project_filterdropdown_reusable)
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/CustomerSelectBlock.tsx (click-outside + popup markup)
 * known-gap (MVP): ไม่มี arrow-key nav ใน list (มีมาตั้งแต่ก่อนหน้านี้ — ไม่ใช่ regression ใหม่)
 * bug-fix (2026-07-22): panel เดิม `absolute top-full` โดน clip เมื่ออยู่ใน CartPanel (lg:overflow-y-auto)
 *   ใกล้ขอบล่าง — เปลี่ยนเป็น portal-to-body ผ่าน useAnchoredDropdown (shared hook, ดู hook สำหรับ
 *   เหตุผล/precedent เต็ม) แทน absolute positioning; click-outside/escape/focus-trap ย้ายเข้า hook แล้ว
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
import { useAnchoredDropdown } from '@/hooks/useAnchoredDropdown'
import type { CatalogProduct } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  value: { productId?: string; name: string }
  catalog: CatalogProduct[]
  onPick: (p: CatalogProduct) => void
  onCustom: (text: string) => void
}

export default function ProductCombobox({ value, catalog, onPick, onCustom }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // click-outside/scroll-close/focus-trap/portal position รวมอยู่ใน hook (shared 3 จุด — ดู hook สำหรับที่มา)
  const { anchorRef, panelRef, style, mounted } = useAnchoredDropdown({ open, onClose: () => setOpen(false) })

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s
      ? catalog.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s))
      : catalog
  }, [catalog, q])
  const typed = q.trim()

  const pick = (p: CatalogProduct) => {
    onPick(p)
    setOpen(false)
    setQ('')
  }
  const custom = () => {
    if (!typed) return
    onCustom(typed)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="form-input !flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${value.name ? 'text-dark' : 'text-default-400'}`}>
          {value.name || 'เลือก/พิมพ์สินค้า'}
        </span>
        <Icon
          icon="chevron-down"
          className={`size-4 shrink-0 text-default-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* portal ไป document.body — หลุด overflow ที่ตัด panel เมื่อเปิดใกล้ขอบล่าง CartPanel */}
      {open &&
        mounted &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="max-h-64 overflow-auto rounded border border-default-300 bg-card shadow-lg"
          >
            <div className="sticky top-0 border-b border-default-200 bg-card p-2">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหา หรือพิมพ์ชื่อสินค้าใหม่..."
                className="form-input text-sm"
              />
            </div>

            <div className="divide-y divide-default-200">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-default-100"
                >
                  <ProductThumb src={p.image} alt={p.name} className="size-8 rounded" iconClassName="size-4" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-dark">{p.name}</span>
                    {p.sku && <span className="block truncate text-xs text-default-400">SKU: {p.sku}</span>}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-primary">{formatThb(p.price)}</span>
                </button>
              ))}
            </div>

            {typed && (
              <button
                type="button"
                onClick={custom}
                className="flex w-full items-center gap-2 border-t border-dashed border-default-300 bg-primary/5 px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-primary/10"
              >
                <Icon icon="plus" className="size-4 shrink-0" />
                <span className="truncate">ใช้ &ldquo;{typed}&rdquo; เป็นรายการใหม่</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
