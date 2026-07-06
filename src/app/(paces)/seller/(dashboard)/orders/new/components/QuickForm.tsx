'use client'

/**
 * QuickForm — ฟอร์มสร้างออเดอร์ "quick" สำหรับ < lg (มือถือ+แท็บเล็ต)
 *
 * Base: mockup docs/superpowers/specs/2026-07-06-quick-create-order.html (frame "Mobile · สร้างออเดอร์")
 *   — inline scroll, แต่ละ section คั่นด้วยแถบเทา full-bleed (ไม่ใช่ card); ลำดับ customer-first
 * Base: FullscreenPageHeader.tsx (-mx-4 md:-mx-8 bleed pattern) + CartPanel.tsx (collapsible trigger)
 *
 * T3 = shell; T5 = เติม section "สินค้า" (QuickLineItem list + ProductPickerSheet).
 * เนื้อ ลูกค้า/ช่องทาง-ชำระเงิน/เพิ่มเติม เติมใน T6-T8.
 */

import { useState, useEffect } from 'react'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import QuickLineItem from './QuickLineItem'
import ProductPickerSheet from './ProductPickerSheet'
import ChannelPaymentSelect from './ChannelPaymentSelect'
import type { CatalogProduct, ItemsController, FormValues } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
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
  catalog,
  bestSellers,
  itemsCtl,
  formId,
  inventoryEnabled = false,
  subtotal: _subtotal, // T8 QuickSummaryPanel
  total,
}: Props) {
  // ProductPickerSheet เป็น instance เดียว — เปิดเล็งไปที่ line index (null = ปิด)
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)

  // โหลดครั้งแรก / ลบจนเหลือ 0 → มี 1 บรรทัดว่างเสมอ (micro-rule #2 + ux open-q #1)
  const lineCount = itemsCtl.fields.length
  useEffect(() => {
    if (lineCount === 0) itemsCtl.addCustom()
    // itemsCtl อ้างผ่าน closure; trigger จาก lineCount พอ
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
      {/* SECTION 1: ลูกค้า — T8 CustomerQuickBlock */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <p className="text-2xs font-bold tracking-wide text-default-400 uppercase">ลูกค้า</p>
      </section>

      {/* SECTION 2: ช่องทางการขาย + การชำระเงิน (T6) — selrow self-labeled ไม่ต้องมี eyebrow */}
      <section className="border-b-8 border-default-100 px-4 py-2 md:px-8">
        <ChannelPaymentSelect control={control} />
      </section>

      {/* SECTION 3: สินค้า — QuickLineItem list + "+ เพิ่มรายการ" (T5) */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-2xs font-bold tracking-wide text-default-400 uppercase">สินค้า</p>
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

      {/* เพิ่มเติม — ไม่มีแถบ band ของตัวเอง (พึ่งเส้นด้านบน) — T8 collapsible ส่วนลด/หมายเหตุ/แท็ก */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3.5 text-sm font-semibold text-default-500 md:px-8"
      >
        <Icon icon="circle-plus" className="text-lg text-default-400" />
        เพิ่มเติม (หมายเหตุ · แท็ก · ส่วนลด)
        <Icon icon="chevron-down" className="ms-auto text-base text-default-400" />
      </button>

      {/* Footer sticky (< lg) — T3 minimal ที่ทำงานได้จริง; T8 อัปเกรดเป็น QuickSummaryPanel collapsible
          HR7 exception: fixed inset-x-0 bottom-0 = viewport-lock (Paces ไม่มี token; precedent AuctionConsoleActionBar) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-default-200 bg-card p-3 lg:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-default-500">รวมทั้งสิ้น</span>
          <span className="text-base font-bold text-default-900">{formatThb(total)}</span>
        </div>
        {/* min-h-11 = 44px touch target (convention onboarding/M0-a) */}
        <button
          type="submit"
          form={formId}
          className="btn inline-flex min-h-11 w-full items-center justify-center gap-2 bg-primary font-semibold text-white hover:bg-primary-hover"
        >
          <Icon icon="device-floppy" className="text-lg" />
          บันทึกออเดอร์
        </button>
      </div>

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
