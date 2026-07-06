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

import { useState, useEffect } from 'react'
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
  const [moreOpen, setMoreOpen] = useState(false)

  // โหลดครั้งแรก / ลบจนเหลือ 0 → มี 1 บรรทัดว่างเสมอ (micro-rule #2)
  const lineCount = itemsCtl.fields.length
  useEffect(() => {
    if (lineCount === 0) itemsCtl.addCustom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineCount])

  // "+ เพิ่มรายการ" — append บรรทัดว่างก่อน แล้วเปิด picker เล็งไป index ใหม่ทันที
  const handleAddClick = () => {
    const idx = itemsCtl.fields.length
    itemsCtl.addCustom()
    setPickerIndex(idx)
  }

  return (
    // -mx-4 md:-mx-8: หักล้าง padding ของ (fullscreen) layout (p-4 md:p-8) → แถบเทา band bleed เต็มขอบจอ
    <div className="-mx-4 md:-mx-8">
      {/* SECTION 1: ลูกค้า (phone-first + wand paste + address) */}
      <section className="border-b-8 border-default-100 px-4 py-4 md:px-8">
        <CustomerQuickBlock control={control} errors={errors} setValue={setValue} />
      </section>

      {/* SECTION 2: ช่องทางการขาย + การชำระเงิน */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <ChannelPaymentSelect control={control} />
      </section>

      {/* SECTION 3: สินค้า */}
      <section className="border-b-8 border-default-100 px-4 py-4 md:px-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-dark">สินค้า</h2>
          <button
            type="button"
            onClick={handleAddClick}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <Icon icon="plus" className="size-4" />
            เพิ่มรายการ
          </button>
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

      {/* เพิ่มเติม (collapsible) — ส่วนลด/VAT/หมายเหตุ */}
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-4 text-sm font-semibold text-default-500 md:px-8"
      >
        <Icon icon="circle-plus" className="text-lg text-default-400" />
        เพิ่มเติม (ส่วนลด · VAT · หมายเหตุ)
        <Icon icon={moreOpen ? 'chevron-up' : 'chevron-down'} className="ms-auto text-base text-default-400" />
      </button>
      {moreOpen && <MoreOptions control={control} />}

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
