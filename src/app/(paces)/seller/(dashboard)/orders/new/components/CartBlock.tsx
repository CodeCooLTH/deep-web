/**
 * CartBlock — BLOCK 3 รายการสินค้า + auto shipping address sub-block
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx SECTION 2+3
 * (itself Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx
 *  + theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx);
 * structure per docs/mockups/seller-orders/create.html BLOCK 3
 *
 * NOTES:
 * - ใช้ฟิลด์ address ชุดใหม่: subdistrict / district / province / postcode / note
 *   (ต่างจาก OrderCreateForm เก่าที่ใช้ amphoe / postalCode — ตามสัญญา B7 locked schema)
 * - needsShipping: สินค้าจากแคตตาล็อกที่มี fulfillmentMode === 'SHIPPED'
 *   หรือรายการกำหนดเอง (ไม่มี productId) ถือว่าต้องจัดส่ง
 * - ไม่เรียก useForm — bind ผ่าน control ที่ B7 ส่งมา
 */
'use client'

import { useState, useMemo } from 'react'
import { useFieldArray, useWatch } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import ProductPickerModal from './ProductPickerModal'
import type { CatalogProduct } from './OrderCreateForm'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  control: Control<any>
  catalog: CatalogProduct[]
  errors?: FieldErrors<any>
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CartBlock({ control, catalog, errors }: Props) {
  // modal state สำหรับ ProductPickerModal
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // useFieldArray owns items — B7 จะไม่ re-declare ซ้ำ
  const { append, update, remove } = useFieldArray({ control, name: 'items' })

  // watch items เพื่อ render และคำนวณ
  const watchedItems: Array<{
    productId?: string
    name: string
    description?: string
    qty: number
    price: number
  }> = useWatch({ control, name: 'items' }) ?? []

  // ── needsShipping: ถ้ามีสินค้า SHIPPED หรือ custom item → แสดง shipping block ─
  const needsShipping = useMemo(() => {
    return watchedItems.some((item) => {
      if (!item.productId) return true // custom item → ถือว่าต้องจัดส่ง
      const prod = catalog.find((p) => p.id === item.productId)
      return prod?.fulfillmentMode === 'SHIPPED'
    })
  }, [watchedItems, catalog])

  // ── subtotal ───────────────────────────────────────────────────────────────
  const subtotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const q = Number(item?.qty) || 0
      const p = Number(item?.price) || 0
      return sum + q * p
    }, 0)
  }, [watchedItems])

  // ── qtyByProduct helper — ส่งเข้า ProductPickerModal ───────────────────────
  const qtyByProduct = (pid: string): number =>
    watchedItems.find((i) => i.productId === pid)?.qty ?? 0

  // ── inc / dec helpers — mirror จาก OrderCreateForm ─────────────────────────
  const inc = (product: CatalogProduct) => {
    const idx = watchedItems.findIndex((i) => i.productId === product.id)
    if (idx >= 0) {
      update(idx, { ...watchedItems[idx], qty: watchedItems[idx].qty + 1 })
    } else {
      append({
        productId: product.id,
        name: product.name,
        description: product.description ?? '',
        qty: 1,
        price: Number(product.price),
      })
    }
  }

  const dec = (productId: string) => {
    const idx = watchedItems.findIndex((i) => i.productId === productId)
    if (idx < 0) return
    const next = watchedItems[idx].qty - 1
    if (next <= 0) {
      remove(idx)
    } else {
      update(idx, { ...watchedItems[idx], qty: next })
    }
  }

  // custom items คือรายการที่ไม่มี productId
  const customItems = watchedItems
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.productId)

  const addCustomItem = () => {
    append({ productId: undefined, name: '', description: '', qty: 1, price: 0 })
  }

  // ── register helper — ใช้ control.register (react-hook-form internal) ──────
  // ต้องใช้ control._formValues + field path เพื่อ bind input โดยไม่ต้องมี useForm
  // วิธีที่ถูกต้องใน react-hook-form v7: ดึง register จาก control._options ไม่ได้ public
  // → ใช้ Controller หรือ useController สำหรับแต่ละ field
  // แต่เพื่อให้ code concise เราใช้ control.register ซึ่ง react-hook-form expose ใน v7
  const register = control.register

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="card">
        {/* Card header: step chip + title + เลือกสินค้า btn (mockup line 130-131) */}
        <div className="card-header flex items-center justify-between">
          <h4 className="card-title flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold shrink-0">
              3
            </span>
            รายการสินค้า
          </h4>
          <button
            type="button"
            onClick={() => setIsPickerOpen(true)}
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1 px-3 py-1.5"
          >
            <Icon icon="plus" width={14} height={14} />
            เลือกสินค้า
          </button>
        </div>

        <div className="card-body p-0">

          {/* Empty state (mockup lines 134-138) */}
          {watchedItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-default-100 text-default-400">
                <Icon icon="basket-off" width={28} height={28} />
              </span>
              <p className="font-medium text-default-700">ยังไม่มีรายการสินค้า</p>
              <p className="text-sm text-default-500">ประเภทออเดอร์จะถูกกำหนดจากสินค้าที่เลือก</p>
            </div>
          )}

          {/* Catalog item rows */}
          <div className="divide-y divide-default-100">
            {watchedItems.map((item, idx) => {
              if (!item.productId) return null // custom items rendered ด้านล่าง
              const product = catalog.find((p) => p.id === item.productId)
              const shortId = item.productId.slice(0, 8)
              const itemErrors = (errors?.items as any)?.[idx]
              return (
                <div
                  key={`catalog-${item.productId}`}
                  className="flex gap-3 px-4 py-3"
                >
                  {/* ภาพสินค้า */}
                  <div className="size-12 rounded bg-default-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {product?.image ? (
                      <img
                        src={product.image}
                        alt={item.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon icon="package" className="size-6 text-default-400" />
                    )}
                  </div>

                  {/* เนื้อหา */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-dark truncate">{item.name}</p>
                        <p className="text-xs text-default-400 mt-0.5">ID: {shortId}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        aria-label="ลบรายการ"
                        className="btn btn-icon text-default-400 hover:text-danger hover:bg-danger/10 !size-11 min-h-0 shrink-0"
                      >
                        <Icon icon="x" className="size-4" />
                      </button>
                    </div>
                    {/* qty stepper */}
                    <div className="flex justify-end mt-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => dec(item.productId!)}
                          className="btn btn-icon border border-default-200 text-default-600 hover:bg-default-100 !size-11 min-h-0 shrink-0"
                          aria-label="ลดจำนวน"
                        >
                          <Icon icon="minus" width={12} height={12} />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          className="form-input text-sm text-center py-1 w-12"
                          {...register(`items.${idx}.qty`, { valueAsNumber: true })}
                        />
                        <button
                          type="button"
                          onClick={() => inc(catalog.find((p) => p.id === item.productId)!)}
                          className="btn btn-icon border border-default-200 text-default-600 hover:bg-default-100 !size-11 min-h-0 shrink-0"
                          aria-label="เพิ่มจำนวน"
                        >
                          <Icon icon="plus" width={12} height={12} />
                        </button>
                      </div>
                    </div>
                    {itemErrors?.qty && (
                      <p className="text-danger text-xs mt-1">{itemErrors.qty.message}</p>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Custom item rows */}
            {customItems.map(({ item, idx }) => {
              const itemErrors = (errors?.items as any)?.[idx]
              return (
                <div
                  key={`custom-${idx}`}
                  className="flex gap-3 px-4 py-3"
                >
                  {/* ไอคอน placeholder */}
                  <div className="size-12 rounded bg-default-100 flex items-center justify-center shrink-0">
                    <Icon icon="edit" className="size-6 text-default-400" />
                  </div>

                  {/* เนื้อหา */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            กำหนดเอง
                          </span>
                        </div>
                        <input
                          type="text"
                          placeholder="ชื่อสินค้า"
                          className="form-input text-sm py-1 w-full"
                          {...register(`items.${idx}.name`)}
                        />
                        {itemErrors?.name && (
                          <p className="text-danger text-xs mt-0.5">{itemErrors.name.message}</p>
                        )}
                        {/* ราคา */}
                        <div className="relative mt-1.5">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-default-400 text-xs pointer-events-none">
                            ฿
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0.01}
                            step={0.01}
                            placeholder="0.00"
                            className="form-input text-sm py-1 pl-6 w-full"
                            {...register(`items.${idx}.price`, { valueAsNumber: true })}
                          />
                        </div>
                        {itemErrors?.price && (
                          <p className="text-danger text-xs mt-0.5">{itemErrors.price.message}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        aria-label="ลบรายการ"
                        className="btn btn-icon text-default-400 hover:text-danger hover:bg-danger/10 !size-11 min-h-0 shrink-0"
                      >
                        <Icon icon="x" className="size-4" />
                      </button>
                    </div>

                    {/* qty stepper */}
                    <div className="flex justify-end mt-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const cur = Number(item?.qty) || 1
                            if (cur > 1) update(idx, { ...item, qty: cur - 1 })
                            else remove(idx)
                          }}
                          className="btn btn-icon border border-default-200 text-default-600 hover:bg-default-100 !size-11 min-h-0 shrink-0"
                          aria-label="ลดจำนวน"
                        >
                          <Icon icon="minus" width={12} height={12} />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          className="form-input text-sm text-center py-1 w-12"
                          {...register(`items.${idx}.qty`, { valueAsNumber: true })}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cur = Number(item?.qty) || 1
                            update(idx, { ...item, qty: cur + 1 })
                          }}
                          className="btn btn-icon border border-default-200 text-default-600 hover:bg-default-100 !size-11 min-h-0 shrink-0"
                          aria-label="เพิ่มจำนวน"
                        >
                          <Icon icon="plus" width={12} height={12} />
                        </button>
                      </div>
                    </div>
                    {itemErrors?.qty && (
                      <p className="text-danger text-xs mt-1">{itemErrors.qty.message}</p>
                    )}

                    {/* hidden productId */}
                    <input type="hidden" {...register(`items.${idx}.productId`)} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* เพิ่มรายการกำหนดเอง (mockup line 140) */}
          <div className="px-4 py-3 border-t border-default-100">
            <button
              type="button"
              onClick={addCustomItem}
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              <Icon icon="plus" width={14} height={14} />
              เพิ่มรายการกำหนดเอง
            </button>
          </div>

          {/* Validation error สำหรับ items array */}
          {errors?.items && typeof (errors.items as any).message === 'string' && (
            <div className="px-4 pb-3">
              <p className="text-danger text-sm">{(errors.items as any).message}</p>
            </div>
          )}

          {/* ─── Auto shipping sub-block (mockup lines 142-156) ──────────────────
              โผล่อัตโนมัติเมื่อ needsShipping = true
              ใช้ฟิลด์ชุดใหม่: subdistrict / district / province / postcode / note
          ─────────────────────────────────────────────────────────────────────── */}
          {needsShipping && (
            <div className="mx-4 mb-4 mt-1 rounded border border-dashed border-info/50 bg-info/5 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark">
                <Icon icon="truck-delivery" className="text-info" width={18} height={18} />
                ที่อยู่จัดส่ง
                <span className="badge bg-info/15 text-info">มีสินค้าที่ต้องจัดส่ง</span>
              </p>
              <p className="text-2xs text-default-400 mb-2">* จำเป็นเมื่อออเดอร์ต้องจัดส่ง</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* ที่อยู่ / บ้านเลขที่ + ถนน */}
                <div className="sm:col-span-2">
                  <label className="form-label">ที่อยู่ / บ้านเลขที่ + ถนน<span className="text-danger ms-0.5">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="123/4 ถ.สุขุมวิท"
                    {...register('shippingAddress.line1')}
                  />
                </div>
                {/* ตำบล / แขวง — ฟิลด์ใหม่ "subdistrict" (ไม่ใช่ district ของ OrderCreateForm เก่า) */}
                <div>
                  <label className="form-label">ตำบล / แขวง</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="คลองเตย"
                    {...register('shippingAddress.subdistrict')}
                  />
                </div>
                {/* อำเภอ / เขต — ฟิลด์ใหม่ "district" (ไม่ใช่ amphoe ของ OrderCreateForm เก่า) */}
                <div>
                  <label className="form-label">อำเภอ / เขต</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="คลองเตย"
                    {...register('shippingAddress.district')}
                  />
                </div>
                {/* จังหวัด */}
                <div>
                  <label className="form-label">จังหวัด<span className="text-danger ms-0.5">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="กรุงเทพมหานคร"
                    {...register('shippingAddress.province')}
                  />
                </div>
                {/* รหัสไปรษณีย์ — ฟิลด์ใหม่ "postcode" (ไม่ใช่ postalCode ของ OrderCreateForm เก่า) */}
                <div>
                  <label className="form-label">รหัสไปรษณีย์<span className="text-danger ms-0.5">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-input"
                    placeholder="10110"
                    {...register('shippingAddress.postcode')}
                  />
                </div>
                {/* หมายเหตุ */}
                <div className="sm:col-span-2">
                  <label className="form-label">หมายเหตุถึงผู้ส่ง</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="เช่น ฝากไว้ที่รปภ."
                    {...register('shippingAddress.note')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ยอดสินค้า footer (OrderCreateForm lines 755-759) */}
          <div className="px-4 py-4 border-t border-default-200 bg-default-50 flex items-center justify-between rounded-b">
            <span className="text-sm text-default-500">ยอดสินค้า</span>
            <span className="text-xl font-bold text-dark">{formatThb(subtotal)}</span>
          </div>

        </div>
      </div>

      {/* ProductPickerModal — fullscreen overlay, อยู่นอก card */}
      <ProductPickerModal
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        catalog={catalog}
        qtyByProduct={qtyByProduct}
        inc={inc}
        dec={dec}
      />
    </>
  )
}
