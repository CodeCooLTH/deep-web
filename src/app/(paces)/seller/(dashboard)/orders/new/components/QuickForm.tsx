'use client'

/**
 * QuickForm — ฟอร์มสร้างออเดอร์ "quick" สำหรับ < lg (มือถือ+แท็บเล็ต)
 *
 * Base: mockup docs/superpowers/specs/2026-07-06-quick-create-order.html (frame "Mobile · สร้างออเดอร์")
 *   — inline scroll, แต่ละ section คั่นด้วยแถบเทา full-bleed (ไม่ใช่ card); ลำดับ customer-first
 * Base: FullscreenPageHeader.tsx (-mx-4 md:-mx-8 bleed pattern) + CartPanel.tsx (collapsible trigger)
 *
 * T3 = shell เท่านั้น: วาง section slot (ลูกค้า → ช่องทาง/ชำระเงิน → สินค้า → เพิ่มเติม) + footer sticky ที่ทำงานได้จริง.
 * เนื้อแต่ละ section เติมใน T4-T8 (ProductPicker/LineItem/Channel-Payment/Customer/Summary).
 */

import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
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
  // props สำหรับ T4-T8 (ยังไม่ render เนื้อ section ใน T3 shell)
  control: _control,
  errors: _errors,
  catalog: _catalog,
  bestSellers: _bestSellers,
  itemsCtl: _itemsCtl,
  formId,
  inventoryEnabled: _inventoryEnabled,
  subtotal: _subtotal,
  total,
}: Props) {
  return (
    // -mx-4 md:-mx-8: หักล้าง padding ของ (fullscreen) layout (p-4 md:p-8) → แถบเทา band bleed เต็มขอบจอ
    // (pattern เดียวกับ FullscreenPageHeader). px-4 md:px-8 คืน padding เนื้อในแต่ละ section
    <div className="-mx-4 md:-mx-8">
      {/* SECTION 1: ลูกค้า — T8 CustomerQuickBlock */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <p className="text-2xs font-bold uppercase tracking-wide text-default-400">ลูกค้า</p>
      </section>

      {/* SECTION 2: ช่องทางการขาย + การชำระเงิน — T6 ChannelPaymentSelect */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <p className="text-2xs font-bold uppercase tracking-wide text-default-400">ช่องทาง / ชำระเงิน</p>
      </section>

      {/* SECTION 3: สินค้า — T4 ProductPickerSheet + T5 QuickLineItem list */}
      <section className="border-b-8 border-default-100 px-4 py-3.5 md:px-8">
        <p className="text-2xs font-bold uppercase tracking-wide text-default-400">สินค้า</p>
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
    </div>
  )
}
