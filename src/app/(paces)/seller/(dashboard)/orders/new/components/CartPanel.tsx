'use client'

/**
 * CartPanel — ขวามือ POS: header ตะกร้า(n) + lines (CartLineItem — แถวเปล่ารอเสมอ, จัดการที่ OrderCreateForm)
 *   + accordion (ลูกค้า / ชำระเงิน-ช่องทาง / ที่อยู่จัดส่ง / หมายเหตุ) + footer สรุป+บันทึก
 * Base: OrderSummaryPanel.tsx (header/sticky/footer breakdown, LOCKED math) + theme ui/accordions (visual skin)
 *   + CustomerSelectBlock (embedded) + PaymentChannelBlock (channel/payment/discount/VAT markup) + CartBlock (shipping block)
 * accordion = Paces skin + custom React state (openKey) — ไม่ใช้ Preline hs-accordion (กัน desync บน re-render form; HR6/FilterDropdown บทเรียน)
 * ที่อยู่จัดส่ง: needsShipping = salesChannel !== STOREFRONT && มีสินค้า SHIPPED (คงกฎเดิม)
 * S-2 (2026-07-08): ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ใช้ AddressSearchPanel (search-driven picker) แทน raw input เดิม
 *   คง manual fallback เดิมไว้ใต้ toggle "กรอกเอง" (register เดิมทุกตัว ไม่ลบความสามารถ)
 * S-4 (2026-07-08): ปุ่มดาว ตั้งค่าเริ่มต้น channel/payment บน desktop — เขียน localStorage key เดียวกับมือถือ
 *   (import DEFAULT_CHANNEL_KEY/DEFAULT_PAYMENT_KEY จาก ChannelPaymentSelect ห้าม hardcode ซ้ำ)
 *   Base ปุ่มดาว: OptionPickerSheet.tsx:86-96 (icon star/star-filled + aria-label pattern, มือถือ — ห้ามแก้ไฟล์นั้น)
 */

import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useController, useWatch } from 'react-hook-form'
// feature 00024 — SSOT ของการ format วันที่ (พ.ศ. + ชื่อวัน) ห้าม format เองที่ component
import { formatWeekdayDateTH } from '@/lib/format-date'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import Select from '@/components/wrappers/Select'
import { pacesToast } from '@/lib/paces-toast'
import CartLineItem from './CartLineItem'
import CustomerSelectBlock from './CustomerSelectBlock'
import AddressSearchPanel, { type SelectedLocality } from './AddressSearchPanel'
import { DEFAULT_CHANNEL_KEY, DEFAULT_PAYMENT_KEY } from './ChannelPaymentSelect'
// SSOT ของตัวเลือก — ต้องเป็นชุดเดียวกับมือถือ (ดูเหตุผลใน order-options.ts)
import { CHANNEL_OPTIONS, PAYMENT_OPTIONS } from './order-options'
import type { CatalogProduct, FormValues, ItemsController } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// mirror ค่าที่ใช้ใน OrderCreateForm/PaymentChannelBlock

type AccKey = 'customer' | 'payment' | 'shipping' | 'appointment' | 'note'

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
  /**
   * feature 00024 — บล็อกวันเข้าใช้บริการ (variant="embedded")
   * รับเป็น node สำเร็จรูปจาก OrderCreateForm แทนที่จะรับ prop ของนัดหมายมาทั้งชุด
   * เพราะแผงนี้ไม่ได้เกี่ยวกับตรรกะการจอง แค่ให้ที่ยืนกับมัน
   */
  appointmentBlock?: ReactNode
  /**
   * feature 00024 — วันที่ที่ปฏิทินคิวส่งมาทาง ?appointmentDate (รูปแบบ YYYY-MM-DD)
   * มีค่า = ผู้ใช้ตั้งใจสร้างนัด → accordion ต้องกางเอง และโชว์วันที่บนหัวให้เห็นทันที
   */
  appointmentPrefilledDate?: string | null
}

export default function CartPanel({
  control,
  catalog,
  itemsCtl,
  errors,
  formId,
  inventoryEnabled = false,
  setValue,
  appointmentBlock,
  appointmentPrefilledDate,
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

  // S-4: ดาวตั้งค่าเริ่มต้น channel/payment — อ่าน default จาก localStorage ตอน mount (client-only)
  const [defaultChannel, setDefaultChannel] = useState<string | null>(null)
  const [defaultPayment, setDefaultPayment] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setDefaultChannel(localStorage.getItem(DEFAULT_CHANNEL_KEY))
    setDefaultPayment(localStorage.getItem(DEFAULT_PAYMENT_KEY))
  }, [])
  const setChannelDefault = () => {
    const v = channelField.value
    if (!v) return
    try {
      localStorage.setItem(DEFAULT_CHANNEL_KEY, v)
    } catch {
      // private-mode / storage เต็ม — เงียบไว้ ไม่บล็อก flow
    }
    setDefaultChannel(v)
    const label = CHANNEL_OPTIONS.find((o) => o.value === v)?.label ?? v
    pacesToast.success(`ตั้ง "${label}" เป็นค่าเริ่มต้นแล้ว`)
  }
  const setPaymentDefault = () => {
    const v = paymentField.value
    if (!v) return
    try {
      localStorage.setItem(DEFAULT_PAYMENT_KEY, v)
    } catch {
      // private-mode / storage เต็ม — เงียบไว้ ไม่บล็อก flow
    }
    setDefaultPayment(v)
    const label = PAYMENT_OPTIONS.find((o) => o.value === v)?.label ?? v
    pacesToast.success(`ตั้ง "${label}" เป็นค่าเริ่มต้นแล้ว`)
  }

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
  /**
   * "จำนวนแถว" ไม่เท่ากับ "จำนวนสินค้าจริง" — ฟอร์มเติมแถวเปล่ารอไว้เสมอ
   * (spreadsheet pattern, OrderCreateForm.tsx:391-404) ทำให้ items.length ≥ 1 ตลอดเวลา
   *
   * เดิมใช้ items.length ตรง ๆ ผลคือ badge หัวตะกร้าขึ้น "1" ตั้งแต่เปิดหน้าทั้งที่ยังไม่ได้
   * เพิ่มอะไร, empty state ที่สอนวิธีใช้ไม่มีทางถูกเห็น, และ disabled={count===0} ไม่เคยเป็นจริง
   * (impeccable critique 2026-07-31 P1)
   *
   * predicate ต้องตรงกับที่ Yup transform ใช้ (OrderCreateForm.tsx:167-169) — ห้ามเขียนกฎซ้ำ
   */
  const count = items.filter(
    (it) => it?.productId != null || (it?.name ?? '').toString().trim() !== '',
  ).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shippingErrors = errors?.shippingAddress as any
  const shippingHasError = !!shippingErrors
  const shippingOpen = openKey === 'shipping' || shippingHasError
  /** ข้อความ error รายช่องที่อยู่ (OrderCreateForm setError ตอน submit) — ก่อนหน้านี้ไม่มีใคร render */
  const addrErr = (field: 'line1' | 'province' | 'postcode'): string | undefined => {
    const m = shippingErrors?.[field]?.message
    return m ? String(m) : undefined
  }
  /** กดบันทึกทั้งที่ยังไม่ได้เลือกที่อยู่เลย — สรุปใน AddressSearchPanel ไม่ render จึงต้องบอกตรงนี้ */
  const localityUnset = !!(shippingErrors?.province || shippingErrors?.postcode) && !locality

  /**
   * feature 00024 — accordion วันเข้าใช้บริการต้อง "กางเอง" เมื่อมีวันที่ส่งมาจากปฏิทิน
   *
   * IMPORTANT: เนื้อใน accordion ไม่ได้แค่ถูกซ่อน แต่ **ไม่ถูก render เลย** (`&&` ข้างล่าง)
   * ถ้าปล่อยให้พับ ผู้ใช้ที่กดวันในปฏิทินจะไม่เห็นว่ามีวันที่ถูกพามา แล้วกดบันทึกไป
   * ได้ออเดอร์เปล่าที่ไม่มีนัดโดยไม่มี error อะไรเลย — ปฏิทินยังว่างเหมือนเดิม
   * (เจอตอน QA 2026-07-31 หลัง commit 58e5b33b ย้ายบล็อกนี้เข้ามาในแผงขวา
   *  ก่อนหน้านั้นบล็อกกางอยู่เสมอ ปัญหานี้จึงไม่เคยมี)
   *
   * ใช้ idiom เดียวกับ shippingOpen ด้านบน — "เปิดถ้าผู้ใช้กด หรือถ้ามีเหตุที่ต้องเห็น"
   */
  const appointmentOpen = openKey === 'appointment' || !!appointmentPrefilledDate

  /**
   * ชื่อ+เบอร์ลูกค้าเป็นฟิลด์ "บังคับกรอก" แต่ถูกซ่อนใน accordion ที่พับเป็นค่าเริ่มต้น
   * และเนื้อในไม่ถูก render ตอนพับ (`&&` ข้างล่าง) — ข้อความ error จึงไม่มีทางถูกแสดง
   * ผลคือกดบันทึกแล้ว "ไม่มีอะไรเกิดขึ้น" ผู้ขายกดซ้ำแล้วสรุปว่าระบบเสีย
   * (impeccable critique 2026-07-31 P0) ใช้ idiom เดียวกับ shippingOpen
   */
  const customerHasError = !!errors?.buyerName || !!errors?.buyerContact
  const customerOpen = openKey === 'customer' || customerHasError

  /** ป้ายบนหัว accordion ที่มี error — ใช้ primitive เดียวกับ badge "จำเป็น" ด้านล่าง */
  const errorBadge = (
    <span className="badge bg-danger/15 text-danger">ต้องแก้</span>
  )

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
      </div>

      {/* ── accordion: ลูกค้า ── */}
      <div className="border-t border-default-200">
        <button type="button" onClick={() => toggle('customer')} className={accBtn}>
          <Icon icon="user" className="size-4 text-default-400" /> ลูกค้า
          {customerHasError && errorBadge}
          {chevron(customerOpen)}
        </button>
        {customerOpen && (
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
              <div className="flex items-center justify-between">
                <label htmlFor="cp-sales-channel" className="form-label">ช่องทางการขาย</label>
                {/* S-4: ปุ่มดาวตั้งค่าเริ่มต้น — เขียน localStorage key เดียวกับมือถือ (DEFAULT_CHANNEL_KEY) */}
                <button
                  type="button"
                  onClick={setChannelDefault}
                  aria-label={defaultChannel === channelField.value ? 'ค่าเริ่มต้นปัจจุบัน' : 'ตั้งเป็นค่าเริ่มต้น'}
                  className="btn btn-icon btn-sm"
                >
                  <Icon
                    icon={defaultChannel === channelField.value ? 'star-filled' : 'star'}
                    className={`size-4 ${defaultChannel === channelField.value ? 'text-warning' : 'text-default-300'}`}
                  />
                </button>
              </div>
              <Select
                inputId="cp-sales-channel"
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
              <div className="flex items-center justify-between">
                <label htmlFor="cp-payment-method" className="form-label">วิธีชำระเงิน</label>
                {/* S-4: ปุ่มดาวตั้งค่าเริ่มต้น — เขียน localStorage key เดียวกับมือถือ (DEFAULT_PAYMENT_KEY) */}
                <button
                  type="button"
                  onClick={setPaymentDefault}
                  aria-label={defaultPayment === paymentField.value ? 'ค่าเริ่มต้นปัจจุบัน' : 'ตั้งเป็นค่าเริ่มต้น'}
                  className="btn btn-icon btn-sm"
                >
                  <Icon
                    icon={defaultPayment === paymentField.value ? 'star-filled' : 'star'}
                    className={`size-4 ${defaultPayment === paymentField.value ? 'text-warning' : 'text-default-300'}`}
                  />
                </button>
              </div>
              <Select
                inputId="cp-payment-method"
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
            {shippingHasError && errorBadge}
            {chevron(shippingOpen)}
          </button>
          {shippingOpen && (
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="cp-addr-line1" className="form-label">ที่อยู่ / บ้านเลขที่ + ถนน<span className="ms-0.5 text-danger">*</span></label>
                <input
                  id="cp-addr-line1"
                  type="text"
                  className={`form-input${addrErr('line1') ? ' is-invalid' : ''}`}
                  aria-describedby={addrErr('line1') ? 'cp-addr-line1-err' : undefined}
                  placeholder="123/4 ถ.สุขุมวิท"
                  {...register('shippingAddress.line1')}
                />
                {addrErr('line1') && (
                  <p id="cp-addr-line1-err" className="mt-1 text-xs text-danger">{addrErr('line1')}</p>
                )}
              </div>

              {/* S-2: search-driven picker แทนช่อง ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ เดิม */}
              <div className="sm:col-span-2">
                <AddressSearchPanel current={locality} onSelect={applyLocality} />
                {localityUnset && (
                  <p className="mt-1 text-xs text-danger">ยังไม่ได้เลือกที่อยู่ — ค้นหาแล้วเลือกก่อนบันทึก</p>
                )}
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
                    <label htmlFor="cp-addr-subdistrict" className="form-label">ตำบล / แขวง</label>
                    <input id="cp-addr-subdistrict" type="text" className="form-input" placeholder="คลองเตย" {...register('shippingAddress.subdistrict')} />
                  </div>
                  <div>
                    <label htmlFor="cp-addr-district" className="form-label">อำเภอ / เขต</label>
                    <input id="cp-addr-district" type="text" className="form-input" placeholder="คลองเตย" {...register('shippingAddress.district')} />
                  </div>
                  <div>
                    <label htmlFor="cp-addr-province" className="form-label">จังหวัด<span className="ms-0.5 text-danger">*</span></label>
                    <input
                      id="cp-addr-province"
                      type="text"
                      className={`form-input${addrErr('province') ? ' is-invalid' : ''}`}
                      aria-describedby={addrErr('province') ? 'cp-addr-province-err' : undefined}
                      placeholder="กรุงเทพมหานคร"
                      {...register('shippingAddress.province')}
                    />
                    {addrErr('province') && (
                      <p id="cp-addr-province-err" className="mt-1 text-xs text-danger">{addrErr('province')}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cp-addr-postcode" className="form-label">รหัสไปรษณีย์<span className="ms-0.5 text-danger">*</span></label>
                    <input
                      id="cp-addr-postcode"
                      type="text"
                      inputMode="numeric"
                      className={`form-input${addrErr('postcode') ? ' is-invalid' : ''}`}
                      aria-describedby={addrErr('postcode') ? 'cp-addr-postcode-err' : undefined}
                      placeholder="10110"
                      {...register('shippingAddress.postcode')}
                    />
                    {addrErr('postcode') && (
                      <p id="cp-addr-postcode-err" className="mt-1 text-xs text-danger">{addrErr('postcode')}</p>
                    )}
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label htmlFor="cp-addr-note" className="form-label">หมายเหตุถึงผู้ส่ง</label>
                <input id="cp-addr-note" type="text" className="form-input" placeholder="เช่น ฝากไว้ที่รปภ." {...register('shippingAddress.note')} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── accordion: วันเข้าใช้บริการ (feature 00024 — เฉพาะร้านที่เปิดคิวงาน) ──
           อยู่หลังที่อยู่จัดส่ง ก่อนหมายเหตุ ตาม Design Spec ส่วน C
           ต้องอยู่ "ใน" แผงนี้ ไม่ใช่ลอยเหนือ grid — ไม่งั้นจะไปกินความสูงของ grid
           ที่ถูกล็อกเท่าจอ จนแถบยอดรวม+ปุ่มบันทึกหลุดใต้จอ (ดู OrderCreateForm
           HR7 exception: viewport-lock — Paces ไม่มี token สำหรับความสูงเท่า viewport) */}
      {appointmentBlock && (
        <div className="border-t border-default-200">
          <button type="button" onClick={() => toggle('appointment')} className={accBtn}>
            <Icon icon="calendar-event" className="size-4 text-default-400" /> วันเข้าใช้บริการ
            {/* วันที่ที่ปฏิทินพามาต้องอ่านได้โดยไม่ต้องกางก่อน — ใช้ชื่อวันด้วย
                เพราะเจ้าของร้านคิดเป็น "ศุกร์นี้" ไม่ใช่ "5 ส.ค." */}
            {appointmentPrefilledDate && (
              <span className="badge bg-primary/15 text-primary">
                {formatWeekdayDateTH(appointmentPrefilledDate)}
              </span>
            )}
            {chevron(appointmentOpen)}
          </button>
          {appointmentOpen && appointmentBlock}
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
        {/* error ของรายการสินค้า — เดิม render เฉพาะใน QuickForm ซึ่งอยู่ใน branch lg:hidden
            เดสก์ท็อปจึงไม่มีทางเห็นข้อความ "ต้องมีสินค้าอย่างน้อย 1 รายการ" เลย */}
        {errors?.items?.message && (
          <p className="text-sm text-danger">{String(errors.items.message)}</p>
        )}
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
