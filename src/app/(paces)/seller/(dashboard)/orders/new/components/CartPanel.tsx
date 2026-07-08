'use client'

/**
 * CartPanel — ขวามือ POS: header ตะกร้า(n) + lines (CartLineItem) + "พิมพ์รายการเอง"
 *   + accordion (ลูกค้า / ชำระเงิน-ช่องทาง / ที่อยู่จัดส่ง / หมายเหตุ) + footer สรุป+บันทึก
 * Base: OrderSummaryPanel.tsx (header/sticky/footer breakdown, LOCKED math) + theme ui/accordions (visual skin)
 *   + CustomerSelectBlock (embedded) + PaymentChannelBlock (channel/payment/discount/VAT markup) + CartBlock (shipping block)
 * accordion = Paces skin + custom React state (openKey) — ไม่ใช้ Preline hs-accordion (กัน desync บน re-render form; HR6/FilterDropdown บทเรียน)
 * ที่อยู่จัดส่ง: needsShipping = salesChannel !== STOREFRONT && มีสินค้า SHIPPED (คงกฎเดิม)
 * S-2 (2026-07-08): ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ใช้ AddressSearchPanel (search-driven picker) แทน raw input เดิม
 *   คง manual fallback เดิมไว้ใต้ toggle "กรอกเอง" (register เดิมทุกตัว ไม่ลบความสามารถ)
 */

import { useMemo, useState } from 'react'
import { useController, useWatch } from 'react-hook-form'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import Select from '@/components/wrappers/Select'
import CartLineItem from './CartLineItem'
import CustomerSelectBlock from './CustomerSelectBlock'
import AddressSearchPanel, { type SelectedLocality } from './AddressSearchPanel'
import type { CatalogProduct, FormValues, ItemsController } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// mirror ค่าที่ใช้ใน OrderCreateForm/PaymentChannelBlock
const CHANNEL_OPTIONS = [
  { value: 'STOREFRONT', label: 'หน้าร้าน' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'LINE', label: 'Line' },
  { value: 'TIKTOK', label: 'TikTok / TikTok Shop' },
  { value: 'OTHER', label: 'อื่นๆ' },
]
const PAYMENT_OPTIONS = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอนเงิน' },
  { value: 'PROMPTPAY', label: 'พร้อมเพย์' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
  { value: 'COD', label: 'เก็บปลายทาง' },
  { value: 'OTHER', label: 'อื่นๆ' },
]

type AccKey = 'customer' | 'payment' | 'shipping' | 'note'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  catalog: CatalogProduct[]
  itemsCtl: ItemsController
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  formId?: string
  inventoryEnabled?: boolean
  /** S-1: ส่งต่อให้ CustomerSelectBlock (embedded) ใช้เติมฟิลด์จาก paste-parse popover */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue?: UseFormSetValue<any>
}

export default function CartPanel({
  control,
  catalog,
  itemsCtl,
  errors,
  formId,
  inventoryEnabled = false,
  setValue,
}: Props) {
  const items = (useWatch({ control, name: 'items' }) ?? []) as FormValues['items']
  const salesChannel = useWatch({ control, name: 'salesChannel' }) as string | undefined

  const { field: channelField } = useController({ control, name: 'salesChannel' })
  const { field: paymentField } = useController({ control, name: 'paymentMethod' })
  const { field: discountField } = useController({ control, name: 'discount' })
  const { field: vatField } = useController({ control, name: 'vatRate' })
  const { field: noteField } = useController({ control, name: 'internalNote' })
  const register = control.register

  const [openKey, setOpenKey] = useState<AccKey | null>(null)
  const toggle = (k: AccKey) => setOpenKey((c) => (c === k ? null : k))
  const [manualAddrOpen, setManualAddrOpen] = useState(false) // S-2: fallback "กรอกเอง" ซ่อนช่อง raw ไว้ default

  // S-2: locality ปัจจุบันจาก form (ใช้เติม AddressSearchPanel current + summary)
  const shippingAddr = useWatch({ control, name: 'shippingAddress' }) as FormValues['shippingAddress'] | undefined
  const locality: SelectedLocality | null =
    shippingAddr?.subdistrict || shippingAddr?.district || shippingAddr?.province || shippingAddr?.postcode
      ? {
          subdistrict: shippingAddr?.subdistrict ?? '',
          district: shippingAddr?.district ?? '',
          province: shippingAddr?.province ?? '',
          postcode: shippingAddr?.postcode ?? '',
        }
      : null
  const applyLocality = (loc: SelectedLocality) => {
    setValue?.('shippingAddress.subdistrict', loc.subdistrict)
    setValue?.('shippingAddress.district', loc.district)
    setValue?.('shippingAddress.province', loc.province)
    setValue?.('shippingAddress.postcode', loc.postcode)
  }

  const needsShipping = useMemo(
    () =>
      salesChannel !== 'STOREFRONT' &&
      items.some((i) => {
        if (!i.productId) return true
        return catalog.find((p) => p.id === i.productId)?.fulfillmentMode === 'SHIPPED'
      }),
    [items, catalog, salesChannel],
  )

  // ── Summary math (LOCKED — copy จาก OrderSummaryPanel) ──
  const subtotal = useMemo(
    () => items.reduce((s, i) => s + (Number(i?.qty) || 0) * (Number(i?.price) || 0), 0),
    [items],
  )
  const discountVal = (discountField.value as number | undefined) ?? 0
  const vatRate = (vatField.value as number | undefined) ?? 0
  const vatBase = subtotal - discountVal
  const vatAmount = round2(vatBase * (vatRate / 100))
  const total = round2(vatBase + vatAmount)
  const count = items.length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shippingHasError = !!(errors?.shippingAddress as any)
  const shippingOpen = openKey === 'shipping' || shippingHasError

  const chevron = (active: boolean) => (
    <Icon icon="chevron-down" className={`ms-auto size-4 text-default-400 transition ${active ? 'rotate-180' : ''}`} />
  )
  const accBtn = 'flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-dark hover:bg-default-50'

  // desktop: fill พาเนล (h-full จาก parent grid ที่ล็อกสูงเท่าจอ) → footer(ปุ่มบันทึก)ตรึงล่างเสมอ, กลาง scroll
  return (
    <div className="card flex flex-col lg:h-full">
      {/* header */}
      <div className="card-header flex shrink-0 items-center gap-2">
        <Icon icon="shopping-cart" className="size-5 text-primary" />
        <h4 className="card-title font-semibold text-dark">ตะกร้า</h4>
        <span className="badge rounded-full bg-primary/15 text-primary">{count}</span>
      </div>

      {/* scrollable middle — desktop: lines+accordion scroll ในนี้ (header/footer pinned) */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      {/* lines — table-like (header row เฉพาะ desktop; rows มี divider เอง) */}
      <div className="p-3">
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-default-400">
            <Icon icon="basket-off" className="size-10 opacity-50" />
            <p className="text-sm font-medium text-default-700">ยังไม่มีรายการสินค้า</p>
            <p className="text-xs">แตะสินค้าด้านซ้ายเพื่อเพิ่มลงตะกร้า</p>
          </div>
        ) : (
          <div>
            {/* header row (desktop) — คอลัมน์ตรงกับ CartLineItem */}
            <div className="hidden items-center gap-x-2 border-b border-default-200 pb-1.5 text-2xs font-semibold text-default-400 lg:flex">
              <span className="w-14 shrink-0" />
              <span className="min-w-0 flex-1">สินค้า / รายละเอียด</span>
              <span className="w-14 shrink-0 text-center">จำนวน</span>
              <span className="w-24 shrink-0 text-center">ราคา</span>
              <span className="w-20 shrink-0 text-right">รวม</span>
              <span className="w-9 shrink-0" />
            </div>
            {itemsCtl.fields.map((f, i) => (
              <CartLineItem
                key={f.id}
                index={i}
                item={items[i] ?? { name: '', qty: 1, price: 0 }}
                control={control}
                catalog={catalog}
                itemsCtl={itemsCtl}
                errors={errors}
                inventoryEnabled={inventoryEnabled}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={itemsCtl.addCustom}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          <Icon icon="plus" className="size-4" /> พิมพ์รายการเอง
        </button>
      </div>

      {/* ── accordion: ลูกค้า ── */}
      <div className="border-t border-default-200">
        <button type="button" onClick={() => toggle('customer')} className={accBtn}>
          <Icon icon="user" className="size-4 text-default-400" /> ลูกค้า {chevron(openKey === 'customer')}
        </button>
        {openKey === 'customer' && (
          <div className="px-2 pb-2">
            <CustomerSelectBlock control={control} errors={errors} variant="embedded" setValue={setValue} />
          </div>
        )}
      </div>

      {/* ── accordion: ชำระเงิน / ช่องทาง ── */}
      <div className="border-t border-default-200">
        <button type="button" onClick={() => toggle('payment')} className={accBtn}>
          <Icon icon="credit-card" className="size-4 text-default-400" /> ชำระเงิน / ช่องทาง {chevron(openKey === 'payment')}
        </button>
        {openKey === 'payment' && (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div>
              <label className="form-label">ช่องทางการขาย</label>
              <Select
                className="select2 react-select"
                classNamePrefix="react-select"
                isSearchable={false}
                isClearable
                options={CHANNEL_OPTIONS}
                value={CHANNEL_OPTIONS.find((o) => o.value === channelField.value) ?? null}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onChange={(opt: any) => channelField.onChange(opt?.value || undefined)}
                onBlur={channelField.onBlur}
                placeholder="เลือกช่องทาง"
              />
            </div>
            <div>
              <label className="form-label">วิธีชำระเงิน</label>
              <Select
                className="select2 react-select"
                classNamePrefix="react-select"
                isSearchable={false}
                isClearable
                options={PAYMENT_OPTIONS}
                value={PAYMENT_OPTIONS.find((o) => o.value === paymentField.value) ?? null}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onChange={(opt: any) => paymentField.onChange(opt?.value || undefined)}
                onBlur={paymentField.onBlur}
                placeholder="เลือกวิธีชำระเงิน"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── accordion: ที่อยู่จัดส่ง (เฉพาะ needsShipping) ── */}
      {needsShipping && (
        <div className="border-t border-default-200">
          <button type="button" onClick={() => toggle('shipping')} className={accBtn}>
            <Icon icon="truck-delivery" className="size-4 text-default-400" /> ที่อยู่จัดส่ง
            <span className="badge bg-info/15 text-info">จำเป็น</span>
            {chevron(shippingOpen)}
          </button>
          {shippingOpen && (
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="form-label">ที่อยู่ / บ้านเลขที่ + ถนน<span className="ms-0.5 text-danger">*</span></label>
                <input type="text" className="form-input" placeholder="123/4 ถ.สุขุมวิท" {...register('shippingAddress.line1')} />
              </div>

              {/* S-2: search-driven picker แทนช่อง ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ เดิม */}
              <div className="sm:col-span-2">
                <AddressSearchPanel current={locality} onSelect={applyLocality} />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setManualAddrOpen((c) => !c)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  หาที่อยู่ไม่เจอในระบบ? กรอกเอง
                  <Icon icon="chevron-down" className={`size-3.5 transition ${manualAddrOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* manual fallback — คง register เดิมทุกตัว (ไม่ลบความสามารถกรอกเอง) */}
              {manualAddrOpen && (
                <>
                  <div>
                    <label className="form-label">ตำบล / แขวง</label>
                    <input type="text" className="form-input" placeholder="คลองเตย" {...register('shippingAddress.subdistrict')} />
                  </div>
                  <div>
                    <label className="form-label">อำเภอ / เขต</label>
                    <input type="text" className="form-input" placeholder="คลองเตย" {...register('shippingAddress.district')} />
                  </div>
                  <div>
                    <label className="form-label">จังหวัด<span className="ms-0.5 text-danger">*</span></label>
                    <input type="text" className="form-input" placeholder="กรุงเทพมหานคร" {...register('shippingAddress.province')} />
                  </div>
                  <div>
                    <label className="form-label">รหัสไปรษณีย์<span className="ms-0.5 text-danger">*</span></label>
                    <input type="text" inputMode="numeric" className="form-input" placeholder="10110" {...register('shippingAddress.postcode')} />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="form-label">หมายเหตุถึงผู้ส่ง</label>
                <input type="text" className="form-input" placeholder="เช่น ฝากไว้ที่รปภ." {...register('shippingAddress.note')} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── accordion: หมายเหตุ ── */}
      <div className="border-t border-default-200">
        <button type="button" onClick={() => toggle('note')} className={accBtn}>
          <Icon icon="notes" className="size-4 text-default-400" /> หมายเหตุ {chevron(openKey === 'note')}
        </button>
        {openKey === 'note' && (
          <div className="px-4 pb-4">
            <textarea
              rows={2}
              placeholder="มองเห็นเฉพาะร้านค้า ไม่แสดงให้ผู้ซื้อ"
              className="form-textarea"
              value={noteField.value ?? ''}
              onChange={noteField.onChange}
              onBlur={noteField.onBlur}
              ref={noteField.ref}
            />
          </div>
        )}
      </div>
      </div>
      {/* /scrollable middle */}

      {/* ── footer: สรุป + บันทึก (pinned ล่างเสมอ) ── */}
      <div className="shrink-0 space-y-2 border-t border-default-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-default-600">ยอดสินค้า</span>
          <span className="font-medium text-default-700">{formatThb(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-default-600">ส่วนลด</span>
          <div className="input-group w-28">
            <span className="input-group-text">฿</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="0.00"
              className="form-input text-sm"
              value={discountField.value ?? ''}
              onChange={(e) => discountField.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              onBlur={discountField.onBlur}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-default-600">VAT (%)</span>
          <div className="input-group w-28">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              placeholder="0"
              className="form-input text-sm"
              value={vatField.value ?? ''}
              onChange={(e) => vatField.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              onBlur={vatField.onBlur}
            />
            <span className="input-group-text">%</span>
          </div>
        </div>
        {vatRate > 0 && (
          <div className="flex items-center justify-between text-xs text-default-500">
            <span>VAT {vatRate}%</span>
            <span>+ {formatThb(vatAmount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-default-200 pt-2">
          <span className="font-bold text-dark">รวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-dark">{formatThb(total)}</span>
        </div>
        <button
          type="submit"
          form={formId}
          disabled={count === 0}
          className="btn min-h-11 w-full bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          บันทึกออเดอร์
        </button>
      </div>
    </div>
  )
}
