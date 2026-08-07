'use client'

/**
 * QuickLineItem — 1 บรรทัดสินค้าใน quick create (< lg), layout ภาพ 21
 * [รูป square] + col( top:[ชื่อ tap→picker + รายละเอียด inline-edit] + trash จาง / bottom:[ยอดรวมตัวหนา + ราคา/ชิ้น(จิ้ม→QuickPriceSheet)] · stepper )
 * Base: mockup 2026-07-06-quick-create-order.html + CartLineItem.tsx (useController qty/price/desc + stock warning) + ProductThumb
 * ชื่อสินค้า = ปุ่ม tap-to-open (เปิด ProductPickerSheet ที่ QuickForm ผ่าน onOpenPicker) — ไม่มี arrow/dropdown inline (ตาม mockup)
 */

import { useState } from 'react'
import { useController } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
import QuickPriceSheet from './QuickPriceSheet'
import type { CatalogProduct, FormValues, ItemsController } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  index: number
  item: FormValues['items'][number]
  control: Control<FormValues>
  catalog: CatalogProduct[]
  itemsCtl: ItemsController
  errors?: FieldErrors<FormValues>
  inventoryEnabled?: boolean
  /** คำเรียกของที่ร้านขาย (สินค้า/บริการ/ห้องพัก) */
  productNoun?: string
  /** เปิด ProductPickerSheet ที่ QuickForm สำหรับ line นี้ */
  onOpenPicker: () => void
}

export default function QuickLineItem({
  index,
  item,
  control,
  catalog,
  itemsCtl,
  errors,
  inventoryEnabled = false,
  productNoun = 'สินค้า',
  onOpenPicker,
}: Props) {
  const [priceOpen, setPriceOpen] = useState(false)
  const { field: qtyField } = useController({ control, name: `items.${index}.qty`, defaultValue: 1 })
  const { field: priceField } = useController({ control, name: `items.${index}.price`, defaultValue: 0 })
  const { field: descField } = useController({ control, name: `items.${index}.description`, defaultValue: '' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemErrors = (errors?.items as any)?.[index]
  /**
   * error ระดับ array ("ต้องมีสินค้าอย่างน้อย 1 รายการ") — ทาสีเฉพาะแถวที่ยังว่าง
   * เพื่อชี้ว่าต้องกลับมาแตะตรงไหน (แถวที่กรอกแล้วไม่ใช่ปัญหา ห้ามทาแดงไปด้วย)
   */
  const itemsRootError =
    typeof (errors?.items as { message?: string })?.message === 'string' && !item.name?.trim()
  const qty = Number(qtyField.value) || 0
  const price = Number(priceField.value) || 0
  const hasProduct = Boolean(item.name?.trim())
  const catalogProduct = item.productId ? catalog.find((p) => p.id === item.productId) : undefined
  const stock = catalogProduct?.stockQty
  const overStock = inventoryEnabled && stock != null && qty > stock
  const setQty = (n: number) => qtyField.onChange(Math.max(1, n))

  return (
    <div className="flex gap-3 border-b border-default-100 py-3 last:border-b-0">
      {/* thumb square (ว่าง = dashed muted) */}
      {hasProduct ? (
        <ProductThumb src={catalogProduct?.image ?? null} alt={item.name} className="size-14 rounded-lg" iconClassName="size-6" />
      ) : (
        <span
          className={`inline-flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed ${
            itemsRootError ? 'border-danger bg-danger/5 text-danger' : 'border-default-300 bg-default-50 text-default-300'
          }`}
        >
          <Icon icon="package" className="size-6" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* top: ชื่อ (tap→picker) + รายละเอียด · trash มุมขวา */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* แถวว่าง = กล่องมีขอบ + ไอคอนค้นหา/ลูกศร ให้อ่านออกว่า "แตะได้" (user report
                2026-08-07: ข้อความเทาจางอ่านเป็น placeholder ไม่มีใครรู้ว่าต้องแตะ แล้วเลยไป
                ติดปุ่มบันทึกที่กดไม่ได้) — ทรงเดียวกับช่องเลือกสินค้าฝั่งเดสก์ท็อป (ProductCombobox)
                min-h-11 = 44px: ของเดิม px-1.5 py-1 สูงจริงราว 24px ต่ำกว่าเกณฑ์นิ้วสัมผัส
                แถวที่เลือกสินค้าแล้วยังเป็นข้อความเปล่าเหมือนเดิม ไม่ต้องมีกรอบ (ไม่ใช่ช่องว่างรอกรอก) */}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur()
                onOpenPicker()
              }}
              aria-label={item.name ? `แก้ไข${productNoun} ${item.name}` : `เลือก${productNoun}`}
              aria-invalid={itemsRootError || undefined}
              aria-describedby={itemsRootError ? 'order-items-error' : undefined}
              className={
                hasProduct
                  ? 'w-full truncate rounded-md px-1.5 py-1 text-start text-sm font-semibold text-dark hover:bg-default-100'
                  : `flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 text-start text-sm font-medium hover:bg-default-50 ${
                      itemsRootError ? 'is-invalid text-danger' : 'border-default-300 text-default-500'
                    }`
              }
            >
              {hasProduct ? (
                item.name
              ) : (
                <>
                  <Icon icon="search" className={`size-4 shrink-0 ${itemsRootError ? 'text-danger' : 'text-default-400'}`} />
                  {/* ไม่ขึ้นต้นด้วย "แตะ": ป้ายบอกสิ่งที่จะได้ ไม่ใช่ท่าที่ต้องทำ — กรอบกับลูกศรบอกอยู่แล้ว
                      ว่ากดได้ · เลี่ยงคำว่า SKU (ศัพท์เฉพาะ) ใช้ "พิมพ์ชื่อเอง" ที่ตรงกับสิ่งที่แผงทำได้จริง */}
                  <span className="min-w-0 flex-1 truncate">เลือก{productNoun} หรือพิมพ์ชื่อเอง</span>
                  <Icon icon="chevron-right" className={`size-4 shrink-0 ${itemsRootError ? 'text-danger' : 'text-default-400'}`} />
                </>
              )}
            </button>
            <input
              type="text"
              placeholder={`รายละเอียด${productNoun}`}
              value={descField.value ?? ''}
              onChange={descField.onChange}
              onBlur={descField.onBlur}
              className="w-full rounded-md border border-transparent px-1.5 py-0.5 text-xs text-default-500 focus:border-default-300 focus:bg-white focus:outline-none"
            />
            {itemErrors?.name && <p className="mt-0.5 px-1.5 text-xs text-danger">{itemErrors.name.message}</p>}
            {overStock && (
              <p className="mt-1 flex items-center gap-1 px-1.5 text-xs text-danger">
                <Icon icon="alert-triangle" className="size-3.5 shrink-0" />
                เกินสต็อก (คงเหลือ {stock})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => itemsCtl.remove(index)}
            aria-label="ลบรายการ"
            className="shrink-0 p-1 text-default-300 hover:text-danger"
          >
            <Icon icon="trash" className="size-4" />
          </button>
        </div>

        {/* bottom: ยอดรวม + แก้ราคา (ซ้าย) · stepper (ขวา) */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-bold text-dark tabular-nums">{formatThb(qty * price)}</div>
            {hasProduct && (
              <button type="button" onClick={() => setPriceOpen(true)} className="mt-0.5 text-2xs text-default-400">
                {formatThb(price)}/ชิ้น · <span className="font-semibold text-primary">แก้ราคา</span>
              </button>
            )}
          </div>
          {/* stepper qty ±1 */}
          <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-default-300">
            <button type="button" onClick={() => setQty(qty - 1)} aria-label="ลดจำนวน" className="inline-flex size-9 items-center justify-center text-primary">
              <Icon icon="minus" className="size-4" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label="จำนวน"
              className="w-10 border-x border-default-200 py-1.5 text-center text-sm font-bold"
              value={qtyField.value ?? 1}
              onChange={(e) => qtyField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={qtyField.onBlur}
            />
            <button type="button" onClick={() => setQty(qty + 1)} aria-label="เพิ่มจำนวน" className="inline-flex size-9 items-center justify-center text-primary">
              <Icon icon="plus" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <QuickPriceSheet
        open={priceOpen}
        price={price}
        name={item.name}
        onApply={(p) => {
          priceField.onChange(p)
          setPriceOpen(false)
        }}
        onClose={() => setPriceOpen(false)}
      />
    </div>
  )
}
