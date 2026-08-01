'use client'

/**
 * ProductGrid — POS product grid (ซ้าย): search + product cards; แตะการ์ด = +1 qty; badge จำนวนมุมขวาบน
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerModal.tsx (card body + shipping badge + empty states)
 *   + docs/system/ui-guideline/paces-component-reference.md §5 (input-icon-group)
 * ต่างจาก ProductPickerModal: grid อยู่ใน pane แคบ (2/3-col ไม่ใช่ 6-col modal), ตัด stepper ในการ์ด (แตะ=+1, badge แสดงจำนวน)
 */

import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import ProductThumb from './ProductThumb'
import type { CatalogProduct } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  catalog: CatalogProduct[]
  qtyByProduct: (id: string) => number
  inc: (p: CatalogProduct) => void
  /** ร้านเปิดระบบคลัง → แสดงสต็อกคงเหลือ + กันเพิ่มสินค้าที่หมด */
  inventoryEnabled?: boolean
}

export default function ProductGrid({ catalog, qtyByProduct, inc, inventoryEnabled = false }: Props) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? catalog.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      : catalog
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
        /**
         * layout สลับตาม "จำนวนสินค้าจริง" ไม่ใช่ตาม viewport
         *
         * เดิมใช้ `lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6` ซึ่งเป็น breakpoint ของ
         * **viewport** ทั้งที่ component นี้อยู่ในแพนซ้ายที่กว้างแค่ครึ่งจอ ผลที่วัดได้จริง
         * (จอ 1440, ร้านมีสินค้า 1 ชิ้น): แพนกว้าง ~700px แต่กริดสั่ง 4 คอลัมน์ →
         * การ์ดกว้าง ~165px เกาะมุมบนซ้าย เหลือพื้นที่ว่าง ~85% และที่ ≥1536px สั่ง 6 คอลัมน์
         * → การ์ด ~115px ซึ่งใส่ชื่อไทย 2 บรรทัด + SKU + ราคา + 2 badge ไม่ได้เลย
         * (impeccable critique 2026-07-31 P0 — ผู้ใช้รายงานว่า "การ์ดสินค้าเพี้ยน")
         *
         * ลูกค้ากลุ่มแรกคือร้านติดตั้งไฟหน้ารถ มีสินค้า 1-3 ชิ้น = เคสปกติ ไม่ใช่ edge case
         * ≤3 ชิ้น จึงใช้แถวเต็มความกว้างแพนแทนกริด (Design Spec: safepay-ux 2026-08-01)
         */
        filtered.length <= 3 ? (
          <div className="flex flex-col gap-2">
            {filtered.map((product) => {
              const qty = qtyByProduct(product.id)
              const stock = product.stockQty
              const showStock = inventoryEnabled && stock != null
              const outOfStock = showStock && stock === 0
              const add = () => {
                if (outOfStock) {
                  pacesToast.error('สินค้าหมด — เพิ่มลงตะกร้าไม่ได้')
                  return
                }
                inc(product)
              }
              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`เพิ่ม ${product.name} ลงตะกร้า`}
                  onClick={add}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      add()
                    }
                  }}
                  /* flex-row จำเป็น — .card ของ Paces ตั้ง flex-direction: column ไว้
                     ใส่แค่ `flex` จะได้แถวที่เรียงตั้งกลางแทนแถวแนวนอน */
                  className={`card flex cursor-pointer flex-row items-center gap-3 p-2.5 transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${qty > 0 ? 'ring-2 ring-primary' : ''} ${outOfStock ? 'opacity-60' : ''}`}
                >
                  <ProductThumb
                    src={product.image}
                    alt={product.name}
                    className="size-14 shrink-0 rounded-lg"
                    iconClassName="size-6"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-dark">{product.name}</p>
                    {product.sku && <p className="truncate text-xs text-default-500">SKU: {product.sku}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                          product.fulfillmentMode === 'SHIPPED'
                            ? 'bg-info/15 text-info'
                            : 'bg-default-200 text-default-600'
                        }`}
                      >
                        {product.fulfillmentMode === 'SHIPPED' ? 'จัดส่ง' : 'ไม่จัดส่ง'}
                      </span>
                      {showStock && (
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                            stock === 0 ? 'bg-danger/15 text-danger' : 'bg-default-100 text-default-500'
                          }`}
                        >
                          {stock === 0 ? 'สินค้าหมด' : `คงเหลือ ${stock}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary">{formatThb(product.price)}</span>
                  {qty > 0 && (
                    <span className="badge min-w-5 shrink-0 justify-center rounded-full bg-primary text-white">
                      {qty}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
        /* >3 ชิ้น: กริดเดิม แต่ breakpoint อิง "แพน" ผ่าน container query ของ Tailwind 4
           (`@container` ประกาศที่ wrapper ใน OrderCreateForm) — เป็น utility ของ framework เอง
           ไม่ใช่ component ที่ประดิษฐ์ใหม่ · ตัด 2xl:grid-cols-6 ทิ้งเพราะการ์ด 115px ใส่เนื้อหาไม่ได้
           IMPORTANT: การใช้ @container ครั้งแรกในโปรเจกต์นี้ — Controller อนุมัติ 2026-08-01 */
        <div className="grid grid-cols-2 gap-2.5 @md:grid-cols-3 @2xl:grid-cols-4">
          {filtered.map((product) => {
            const qty = qtyByProduct(product.id)
            const stock = product.stockQty
            const showStock = inventoryEnabled && stock != null
            const outOfStock = showStock && stock === 0
            const add = () => {
              if (outOfStock) {
                pacesToast.error('สินค้าหมด — เพิ่มลงตะกร้าไม่ได้')
                return
              }
              inc(product)
            }
            return (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={add}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    add()
                  }
                }}
                className={`card relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary ${qty > 0 ? 'ring-2 ring-primary' : ''} ${outOfStock ? 'opacity-60' : ''}`}
              >
                {qty > 0 && (
                  <span className="badge absolute end-0 top-0 z-10 m-2 min-w-5 justify-center rounded-full bg-primary text-white">
                    {qty}
                  </span>
                )}
                {/* aspect-video ให้ตรงกับที่มือถือใช้อยู่แล้ว (ProductPickerSheet) —
                    aspect-square เดิมทำให้กล่องรูปสูงเท่าความกว้างการ์ด แล้วต่อด้วยข้อความ
                    อีก 4 บรรทัด = การ์ดผอมสูง ~1:1.7 และเมื่อไม่มีรูป placeholder เทา
                    กลายเป็น element ที่ใหญ่ที่สุดบนจอทั้งที่ไม่มีข้อมูลอะไรเลย */}
                <ProductThumb
                  src={product.image}
                  alt={product.name}
                  className="aspect-video w-full"
                  iconClassName="size-10"
                />
                <div className="flex-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-medium text-dark">{product.name}</p>
                  {product.sku && <p className="truncate text-2xs text-default-400">SKU: {product.sku}</p>}
                  <p className="mt-1 text-sm font-semibold text-primary">{formatThb(product.price)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                        product.fulfillmentMode === 'SHIPPED'
                          ? 'bg-info/15 text-info'
                          : 'bg-default-200 text-default-600'
                      }`}
                    >
                      {product.fulfillmentMode === 'SHIPPED' ? 'จัดส่ง' : 'ไม่จัดส่ง'}
                    </span>
                    {showStock && (
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                          stock === 0 ? 'bg-danger/15 text-danger' : 'bg-default-100 text-default-500'
                        }`}
                      >
                        {stock === 0 ? 'สินค้าหมด' : `คงเหลือ ${stock}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        )
      )}
    </div>
  )
}
