/**
 * ProductPickerModal — fullscreen overlay เลือกสินค้าจากแคตตาล็อก
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx
 * ไม่มี modal equivalent ใน Paces order-add — ใช้ Paces card + grid pattern เป็น primitive.
 * a11y fix: outer wrapper ใช้ div[role="button"] แทน nested button (P2-retro).
 * B8: เพิ่ม shipping indicator (จัดส่ง/ไม่จัดส่ง) ต่อ product ตาม create.html lines ~277/288.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { type CatalogProduct } from './OrderCreateForm'

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

interface Props {
  open: boolean
  onClose: () => void
  catalog: CatalogProduct[]
  /** Returns current qty for a given productId (0 if not in cart) */
  qtyByProduct: (productId: string) => number
  inc: (product: CatalogProduct) => void
  dec: (productId: string) => void
}

export default function ProductPickerModal({ open, onClose, catalog, qtyByProduct, inc, dec }: Props) {
  const [search, setSearch] = useState('')

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset search when modal opens
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter((p) => p.name.toLowerCase().includes(q))
  }, [catalog, search])

  const formatThb = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-card flex flex-col overflow-hidden">
      {/* Header — มือถือ (<sm) 2 แถว (title+close / search เต็มแถว), sm+ กลับเป็น 1 แถวเดิม */}
      <header className="flex flex-col gap-3 px-4 md:px-6 py-3 border-b border-default-200 shrink-0 sm:h-14 sm:flex-row sm:items-center sm:py-0">
        {/* แถว 1 (มือถือ): title + close — sm:contents ให้ยุบรวมเป็น flex item ตรงของ header ที่ sm+ */}
        <div className="flex items-center justify-between gap-3 sm:contents">
          <h2 className="text-lg font-bold text-dark sm:mr-auto">เลือกสินค้า</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="btn btn-icon border border-default-300 hover:bg-default-50 !size-11 min-h-0 flex items-center justify-center sm:order-3"
          >
            <Icon icon="x" className="size-5" />
          </button>
        </div>
        {/* แถว 2 (มือถือ): search เต็มแถว — sm+ กลับเป็น w-64 อยู่ระหว่าง title กับ close */}
        <div className="relative w-full sm:order-2 sm:w-64">
          <input
            type="text"
            placeholder="ค้นหา..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-8 text-sm"
          />
          <Icon
            icon="search"
            className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-default-400"
          />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {catalog.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-400">
            <Icon icon="package" className="size-12 opacity-40" />
            <p className="text-sm">ยังไม่มีสินค้าในแคตตาล็อก</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-400">
            <Icon icon="search-off" className="size-10 opacity-40" />
            <p className="text-sm">ไม่พบสินค้าที่ตรงกับ &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((product) => {
              const qty = qtyByProduct(product.id)
              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => inc(product)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      inc(product)
                    }
                  }}
                  className={cn(
                    'card rounded-xl overflow-hidden flex flex-col transition hover:shadow-lg text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary',
                    qty > 0 && 'ring-2 ring-primary',
                  )}
                >
                  {/* Image area */}
                  <div className="aspect-square bg-default-100 flex items-center justify-center overflow-hidden">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon icon="package" className="size-12 text-default-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 flex-1">
                    <p className="text-sm font-medium text-dark line-clamp-2">{product.name}</p>
                    <p className="text-sm text-primary font-semibold mt-1">{formatThb(product.price)}</p>
                    {/* shipping indicator ตาม create.html lines ~277/288 — ไม่ใช้ hex ไม่ใช้ inline style */}
                    <span
                      className={cn(
                        'mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
                        product.fulfillmentMode === 'SHIPPED'
                          ? 'bg-info/15 text-info'
                          : 'bg-default-200 text-default-600',
                      )}
                    >
                      {product.fulfillmentMode === 'SHIPPED' ? 'จัดส่ง' : 'ไม่จัดส่ง'}
                    </span>
                  </div>

                  {/* Qty stepper — only visible when qty > 0 */}
                  {qty > 0 && (
                    <div
                      className="px-3 pb-3 flex items-center justify-between border-t border-default-100 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs text-default-400">ในตะกร้า</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); dec(product.id) }}
                          className="btn btn-icon btn-sm border border-default-200 text-default-600 hover:bg-default-100"
                          aria-label="ลด"
                        >
                          <Icon icon="minus" width={10} height={10} />
                        </button>
                        <span className="text-sm font-semibold text-dark w-5 text-center tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); inc(product) }}
                          className="btn btn-icon btn-sm border border-default-200 text-default-600 hover:bg-default-100"
                          aria-label="เพิ่ม"
                        >
                          <Icon icon="plus" width={10} height={10} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-default-200 px-4 md:px-6 py-3 flex justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="btn bg-primary text-white hover:bg-primary-hover px-6 py-2"
        >
          เสร็จสิ้น
        </button>
      </footer>
    </div>
  )
}
