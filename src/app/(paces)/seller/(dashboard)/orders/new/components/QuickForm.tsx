'use client'

/**
 * QuickForm — ฟอร์มสร้างออเดอร์ "quick" สำหรับ < lg (มือถือ+แท็บเล็ต)
 *
 * Base: mockup docs/superpowers/specs/2026-07-06-quick-create-order.html (frame "Mobile · สร้างออเดอร์")
 *   — inline scroll, แต่ละ section คั่นด้วยแถบเทา full-bleed (ไม่ใช่ card); ลำดับ customer-first
 * Base: FullscreenPageHeader.tsx (-mx-4 md:-mx-8 bleed pattern)
 *
 * ลำดับ: ลูกค้า → ช่องทาง/ชำระเงิน → สินค้า → เพิ่มเติม; footer = QuickSummaryPanel (collapsible)
 */

import { useState, useMemo } from 'react'
import { useWatch } from 'react-hook-form'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import QuickLineItem from './QuickLineItem'
import ProductPickerSheet from './ProductPickerSheet'
import ChannelPaymentSelect from './ChannelPaymentSelect'
import CustomerQuickBlock from './CustomerQuickBlock'
import MoreOptions from './MoreOptions'
import QuickSummaryPanel from './QuickSummaryPanel'
import type { CatalogProduct, ItemsController, FormValues } from './OrderCreateForm'

interface Props {
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
  setValue: UseFormSetValue<FormValues>
  catalog: CatalogProduct[]
  bestSellers: CatalogProduct[]
  itemsCtl: ItemsController
  formId?: string
  inventoryEnabled?: boolean
  subtotal: number
  total: number
}

export default function QuickForm({
  control,
  errors,
  setValue,
  catalog,
  bestSellers,
  itemsCtl,
  formId,
  inventoryEnabled = false,
  subtotal,
  total,
}: Props) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)

  // needsShipping (reactive) — ตรงกับ logic ตอน submit (OrderCreateForm) + CartPanel: ช่องทาง≠STOREFRONT
  // และมีสินค้าที่ fulfillment=SHIPPED (custom item ไม่มี productId = ถือว่าต้องจัดส่ง) → ใช้เตือนที่อยู่เชิงรุก
  const watchedItems = (useWatch({ control, name: 'items' }) ?? []) as FormValues['items']
  const salesChannel = useWatch({ control, name: 'salesChannel' })
  const needsShipping = useMemo(
    () =>
      salesChannel !== 'STOREFRONT' &&
      watchedItems.some((i) => {
        if (!i?.productId) return true
        return catalog.find((p) => p.id === i.productId)?.fulfillmentMode === 'SHIPPED'
      }),
    [watchedItems, catalog, salesChannel],
  )

  return (
    // -mx-4 md:-mx-8: หักล้าง padding ของ (fullscreen) layout (p-4 md:p-8) → แถบเทา band bleed เต็มขอบจอ
    <div className="-mx-4 md:-mx-8">
      {/* SECTION 1: ลูกค้า (phone-first + wand paste + address) */}
      <section className="border-b-8 border-default-100 px-4 py-4 md:px-8">
        <CustomerQuickBlock control={control} errors={errors} setValue={setValue} needsShipping={needsShipping} />
      </section>

      {/* SECTION 2: ช่องทางการขาย + การชำระเงิน */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <ChannelPaymentSelect control={control} />
      </section>

      {/* SECTION 3: สินค้า — ไม่มีปุ่มพิมพ์เอง: แถวเปล่ารอเสมออยู่แล้ว (spreadsheet pattern, จัดการที่ OrderCreateForm) */}
      <section className="border-b-8 border-default-100 px-4 py-4 md:px-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-dark">
            <Icon icon="package" className="size-5 text-primary" />
            สินค้า
          </h2>
        </div>
        <div>
          {itemsCtl.fields.map((f, i) => (
            <QuickLineItem
              key={f.id}
              index={i}
              item={f as unknown as FormValues['items'][number]}
              control={control}
              catalog={catalog}
              itemsCtl={itemsCtl}
              errors={errors}
              inventoryEnabled={inventoryEnabled}
              onOpenPicker={() => setPickerIndex(i)}
            />
          ))}
        </div>
        {typeof (errors.items as { message?: string })?.message === 'string' && (
          <p className="mt-1.5 text-xs text-danger">{(errors.items as { message?: string }).message}</p>
        )}
      </section>

      {/* SECTION 4: เพิ่มเติม — ส่วนลด/VAT/หมายเหตุ (ไม่ collapse; สไตล์เดียวกับ section อื่น) */}
      <section className="border-b-8 border-default-100 px-4 py-4 md:px-8">
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="adjustments" className="size-5 text-primary" />
          <h2 className="text-base font-bold text-dark">เพิ่มเติม</h2>
        </div>
        <MoreOptions control={control} />
      </section>

      {/* Footer sticky (< lg) — collapsible summary + บันทึก */}
      <QuickSummaryPanel control={control} subtotal={subtotal} total={total} formId={formId} />

      {/* ProductPickerSheet — instance เดียว เปิดเล็ง line ที่ pickerIndex */}
      <ProductPickerSheet
        open={pickerIndex !== null}
        catalog={catalog}
        bestSellers={bestSellers}
        onPick={(p) => {
          if (pickerIndex != null) itemsCtl.setLineProduct(pickerIndex, p)
          setPickerIndex(null)
        }}
        onCustom={(text) => {
          if (pickerIndex != null) itemsCtl.setLineCustom(pickerIndex, text)
          setPickerIndex(null)
        }}
        onClose={() => setPickerIndex(null)}
      />
    </div>
  )
}
