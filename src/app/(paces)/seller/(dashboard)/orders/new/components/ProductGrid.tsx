'use client'

/**
 * ProductGrid — POS product grid (ซ้าย): search + product cards; แตะการ์ด = +1 qty; badge จำนวนมุมขวาบน
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerModal.tsx (card body + shipping badge + empty states)
 *   + docs/system/ui-guideline/paces-component-reference.md §5 (input-icon-group)
 * ต่างจาก ProductPickerModal: grid อยู่ใน pane แคบ (2/3-col ไม่ใช่ 6-col modal), ตัด stepper ในการ์ด (แตะ=+1, badge แสดงจำนวน)
 */

import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
import type { CatalogProduct } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  catalog: CatalogProduct[]
  qtyByProduct: (id: string) => number
  inc: (p: CatalogProduct) => void
}

export default function ProductGrid({ catalog, qtyByProduct, inc }: Props) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? catalog.filter((p) => p.name.toLowerCase().includes(q)) : catalog
  }, [catalog, search])

  return (
    <div className="flex flex-col gap-3">
      {/* search — Paces input-icon-group (paces-component-reference §5) */}
      <div className="input-icon-group">
        <span className="input-icon">
          <Icon icon="search" className="size-4 text-default-400" />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาสินค้า..."
          className="form-input"
        />
      </div>

      {catalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-default-400">
          <Icon icon="package" className="size-12 opacity-40" />
          <p className="text-sm">ยังไม่มีสินค้าในแคตตาล็อก</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-default-400">
          <Icon icon="search-off" className="size-10 opacity-40" />
          <p className="text-sm">ไม่พบสินค้าที่ตรงกับ &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
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
                className={`card relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary ${qty > 0 ? 'ring-2 ring-primary' : ''}`}
              >
                {qty > 0 && (
                  <span className="badge absolute end-0 top-0 z-10 m-2 min-w-5 justify-center rounded-full bg-primary text-white">
                    {qty}
                  </span>
                )}
                <ProductThumb
                  src={product.image}
                  alt={product.name}
                  className="aspect-square w-full"
                  iconClassName="size-10"
                />
                <div className="flex-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-medium text-dark">{product.name}</p>
                  <p className="mt-1 text-sm font-semibold text-primary">{formatThb(product.price)}</p>
                  <span
                    className={`mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                      product.fulfillmentMode === 'SHIPPED'
                        ? 'bg-info/15 text-info'
                        : 'bg-default-200 text-default-600'
                    }`}
                  >
                    {product.fulfillmentMode === 'SHIPPED' ? 'จัดส่ง' : 'ไม่จัดส่ง'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
