'use client'

/**
 * ProductCombobox — select2 ต่อ cart line: ค้นหา/เลือกสินค้า existing หรือพิมพ์ชื่อใหม่ = custom item
 * custom React state — ห้ามใช้ Preline hs-dropdown (กัน opacity ค้าง; feedback project_filterdropdown_reusable)
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/CustomerSelectBlock.tsx (click-outside + popup markup)
 * known-gap (MVP): popup เปิดลง (top-full) เสมอ — ยังไม่ smart-flip เมื่อใกล้ขอบล่าง scroll container
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
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
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? catalog.filter((p) => p.name.toLowerCase().includes(s)) : catalog
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
    <div className="relative" ref={ref}>
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

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded border border-default-300 bg-card shadow-lg">
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
                <span className="flex-1 truncate text-sm font-medium text-dark">{p.name}</span>
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
        </div>
      )}
    </div>
  )
}
