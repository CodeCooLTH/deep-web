'use client'

/**
 * ProductCombobox — select2 ต่อ cart line: ค้นหา/เลือกสินค้า existing หรือพิมพ์ชื่อใหม่ = custom item
 * custom React state — ห้ามใช้ Preline hs-dropdown (กัน opacity ค้าง; feedback project_filterdropdown_reusable)
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/CustomerSelectBlock.tsx (input-trigger +
 *   dropdown-listbox markup; Base เดิมของไฟล์นั้น: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx)
 *   + src/app/(paces)/seller/(dashboard)/orders/new/components/AddressSearchPanel.tsx (`.input-icon-group`
 *   primitive — docs/system/ui-guideline/paces-component-reference.md §4, theme/paces/Docs/index.html)
 * bug-fix (2026-07-22): panel เดิม `absolute top-full` โดน clip เมื่ออยู่ใน CartPanel (lg:overflow-y-auto)
 *   ใกล้ขอบล่าง — เปลี่ยนเป็น portal-to-body ผ่าน useAnchoredDropdown (shared hook, ดู hook สำหรับ
 *   เหตุผล/precedent เต็ม) แทน absolute positioning; click-outside/escape/focus-trap ย้ายเข้า hook แล้ว
 * UX (2026-07-23): trigger เดิมเป็นปุ่ม (ต้องกดเปิดก่อนถึงพิมพ์ได้ — 2 สเต็ป) → เปลี่ยนเป็น type-to-search
 *   input ตรง (พิมพ์ = เปิด panel ทันที) ตาม pattern CustomerSelectBlock/AddressSearchPanel; เพิ่ม
 *   combobox/listbox/option ARIA + arrow-key nav (activeIndex ครอบทั้ง filtered rows และ custom row)
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const inputId = `product-combobox-${uid}`
  const listboxId = `product-listbox-${uid}`
  const optionId = (idx: number) => `${listboxId}-option-${idx}`
  // click-outside/scroll-close/focus-trap/portal position รวมอยู่ใน hook (shared 3 จุด — ดู hook สำหรับที่มา)
  const { anchorRef, panelRef, style, mounted } = useAnchoredDropdown({ open, onClose: () => setOpen(false) })

  // sync q ↔ value.name เฉพาะตอนปิด: (ก) แสดงชื่อที่เลือกแล้วตอน panel ปิด (ข) discard ข้อความพิมพ์ค้าง
  // ที่ไม่ได้เลือกตอนปิด (คลิกนอก/Escape) — ตอนเลือก (pick/custom) ตั้ง q ตรง ๆ ในฟังก์ชันนั้นแล้ว ไม่ต้องรอ effect นี้
  useEffect(() => {
    if (!open) setQ(value.name || '')
  }, [value.name, open])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s
      ? catalog.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? '').toLowerCase().includes(s))
      : catalog
  }, [catalog, q])
  const typed = q.trim()
  const totalOptions = filtered.length + (typed ? 1 : 0)

  const pick = (p: CatalogProduct) => {
    onPick(p)
    setOpen(false)
    setQ(p.name)
    setActiveIndex(0)
  }
  const custom = () => {
    if (!typed) return
    onCustom(typed)
    setOpen(false)
    setQ(typed)
    setActiveIndex(0)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (totalOptions === 0) return
      setActiveIndex((i) => Math.min(i + 1, totalOptions - 1))
    } else if (e.key === 'ArrowUp') {
      if (!open || totalOptions === 0) return
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (!open) return
      // กัน form submit ตอน Enter เลือกรายการ (Escape ให้ hook จัดการแล้ว)
      e.preventDefault()
      if (activeIndex < filtered.length) {
        const p = filtered[activeIndex]
        if (p) pick(p)
      } else if (typed) {
        custom()
      }
    }
  }

  return (
    <div ref={anchorRef}>
      <div className="input-icon-group">
        <span className="input-icon">
          <Icon icon="search" className="size-4 text-default-400" />
        </span>
        <label htmlFor={inputId} className="sr-only">
          ชื่อสินค้า
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder="พิมพ์ชื่อสินค้า…"
          className="form-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {/* portal ไป document.body — หลุด overflow ที่ตัด panel เมื่อเปิดใกล้ขอบล่าง CartPanel */}
      {open &&
        mounted &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            style={style}
            className="max-h-64 overflow-auto rounded border border-default-300 bg-card shadow-lg"
          >
            {catalog.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-default-400">
                ยังไม่มีสินค้าในร้าน — พิมพ์ชื่อเพื่อเพิ่มเป็นรายการเอง
              </p>
            )}
            {catalog.length > 0 && filtered.length === 0 && typed && (
              <p className="px-4 py-4 text-center text-sm text-default-400">
                ไม่พบสินค้าที่ตรงกับ &ldquo;{typed}&rdquo; — พิมพ์ต่อเพื่อเพิ่มเป็นรายการใหม่
              </p>
            )}

            {filtered.length > 0 && (
              <div className="divide-y divide-default-200">
                {filtered.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    id={optionId(idx)}
                    aria-selected={idx === activeIndex}
                    onClick={() => pick(p)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-default-100 aria-selected:bg-default-100"
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
            )}

            {typed && (
              <button
                type="button"
                role="option"
                id={optionId(filtered.length)}
                aria-selected={activeIndex === filtered.length}
                onClick={custom}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                className="flex w-full items-center gap-2 border-t border-dashed border-default-300 bg-primary/5 px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-primary/10 aria-selected:bg-primary/10"
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
