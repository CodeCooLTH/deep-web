'use client'

/**
 * CustomerQuickBlock — section "ลูกค้า" ของ quick create (< lg), phone-first
 * Base: mockup 2026-07-06-quick-create-order.html (section ลูกค้า) + CustomerSearchSheet (dedup, full-screen)
 * ค้นหาลูกค้า → full-screen CustomerSearchSheet (คลิกเดียวได้ข้อมูล); เจอลูกค้าเดิม = badge "ลูกค้าเก่า" ข้างหัวข้อ
 * wand tool → PasteParseSheet; locality field → AddressSearchSheet; ที่อยู่แสดงเมื่อ salesChannel !== STOREFRONT
 */

import { useState } from 'react'
import { useController, useWatch } from 'react-hook-form'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import AddressSearchSheet, { type SelectedLocality } from './AddressSearchSheet'
import PasteParseSheet from './PasteParseSheet'
import CustomerSearchSheet, { type CustomerResult } from './CustomerSearchSheet'
import type { FormValues } from './OrderCreateForm'
import type { ParsedOrderMessage } from '@/lib/parse-order-message'

interface Props {
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
  setValue: UseFormSetValue<FormValues>
}

export default function CustomerQuickBlock({ control, errors, setValue }: Props) {
  const [pasteOpen, setPasteOpen] = useState(false)
  const [addrOpen, setAddrOpen] = useState(false)
  const [custOpen, setCustOpen] = useState(false)
  const [selected, setSelected] = useState<CustomerResult | null>(null)

  const { field: nameField } = useController({ control, name: 'buyerName', defaultValue: '' })
  const { field: contactField } = useController({ control, name: 'buyerContact', defaultValue: '' })
  const { field: line1Field } = useController({ control, name: 'shippingAddress.line1', defaultValue: '' })

  const channel = useWatch({ control, name: 'salesChannel' })
  const showAddress = channel !== 'STOREFRONT'
  const addr = useWatch({ control, name: 'shippingAddress' }) as FormValues['shippingAddress']
  const locality: SelectedLocality | null =
    addr?.subdistrict || addr?.province
      ? {
          subdistrict: addr?.subdistrict ?? '',
          district: addr?.district ?? '',
          province: addr?.province ?? '',
          postcode: addr?.postcode ?? '',
        }
      : null

  const selectCustomer = (c: CustomerResult) => {
    setSelected(c)
    setValue('buyerContact', c.contact)
    setValue('buyerName', c.name ?? '')
    setCustOpen(false)
  }

  // "ใช้คำที่พิมพ์เป็นลูกค้าใหม่" — เดา: ขึ้นต้นด้วยเลข = เบอร์, ไม่งั้น = ชื่อ
  const useNewCustomer = (q: string) => {
    setSelected(null)
    if (/^\d/.test(q)) setValue('buyerContact', q)
    else setValue('buyerName', q)
    setCustOpen(false)
  }

  const applyPaste = (p: ParsedOrderMessage) => {
    setSelected(null)
    if (p.name) setValue('buyerName', p.name)
    if (p.phone) setValue('buyerContact', p.phone)
    if (p.addressLine) setValue('shippingAddress.line1', p.addressLine)
    if (p.subdistrict) setValue('shippingAddress.subdistrict', p.subdistrict)
    if (p.district) setValue('shippingAddress.district', p.district)
    if (p.province) setValue('shippingAddress.province', p.province)
    if (p.postcode) setValue('shippingAddress.postcode', p.postcode)
    setPasteOpen(false)
  }

  const applyLocality = (loc: SelectedLocality) => {
    setValue('shippingAddress.subdistrict', loc.subdistrict)
    setValue('shippingAddress.district', loc.district)
    setValue('shippingAddress.province', loc.province)
    setValue('shippingAddress.postcode', loc.postcode)
    setAddrOpen(false)
  }

  return (
    <>
      {/* header: ลูกค้า + badge ลูกค้าเก่า (เมื่อเจอ) + wand tool */}
      <div className="mb-2 flex items-center gap-2">
        <p className="text-2xs font-bold tracking-wide text-default-400 uppercase">ลูกค้า</p>
        {selected && (
          <span className="badge badge-label bg-success/15 text-success text-2xs font-semibold">
            <Icon icon="user-check" className="text-xs" />
            ลูกค้าเก่า · {selected.orderCount} ออเดอร์
          </span>
        )}
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          aria-label="วางข้อความจากแชท"
          className="ms-auto inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <Icon icon="wand" className="size-5" />
        </button>
      </div>

      {/* ค้นหาลูกค้าเดิม → full-screen sheet (คลิกเดียวได้ข้อมูล) */}
      <button
        type="button"
        onClick={() => setCustOpen(true)}
        className="mb-2.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-default-300 bg-default-50 px-3 py-2.5 text-sm font-medium text-default-500"
      >
        <Icon icon="user-search" className="size-4 shrink-0 text-primary" />
        ค้นหาลูกค้าเดิม (ชื่อ / เบอร์)
      </button>

      {/* ชื่อ */}
      <div className="mb-2.5">
        <label className="form-label">ชื่อลูกค้า</label>
        <input
          type="text"
          placeholder="ชื่อลูกค้า"
          className="form-input"
          value={nameField.value ?? ''}
          onChange={(e) => {
            setSelected(null)
            nameField.onChange(e)
          }}
          onBlur={nameField.onBlur}
        />
        {errors.buyerName?.message && <p className="mt-1 text-xs text-danger">{String(errors.buyerName.message)}</p>}
      </div>

      {/* เบอร์ */}
      <div className="mb-2.5">
        <label className="form-label">เบอร์โทร</label>
        <input
          type="text"
          inputMode="tel"
          autoComplete="off"
          placeholder="08xxxxxxxx"
          className="form-input"
          value={contactField.value ?? ''}
          onChange={(e) => {
            setSelected(null)
            contactField.onChange(e)
          }}
          onBlur={contactField.onBlur}
        />
        {errors.buyerContact?.message && (
          <p className="mt-1 text-xs text-danger">{String(errors.buyerContact.message)}</p>
        )}
      </div>

      {/* ที่อยู่ (ไม่ใช่ STOREFRONT) */}
      {showAddress && (
        <>
          <div className="mb-2.5">
            <label className="form-label">บ้านเลขที่ / หมู่ / ถนน</label>
            <input
              type="text"
              placeholder="เช่น 91 ม.7 ถ.พหลโยธิน"
              className="form-input"
              value={line1Field.value ?? ''}
              onChange={line1Field.onChange}
              onBlur={line1Field.onBlur}
            />
          </div>
          <div>
            <label className="form-label">ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์</label>
            <button
              type="button"
              onClick={() => setAddrOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-default-300 px-3 py-2.5 text-left"
            >
              <Icon icon="map-pin" className={`size-4 shrink-0 ${locality ? 'text-primary' : 'text-default-400'}`} />
              {locality ? (
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold text-dark">
                    ต.{locality.subdistrict} · อ.{locality.district}
                  </span>
                  <span className="block text-xs text-default-500">
                    {locality.province} · {locality.postcode}
                  </span>
                </span>
              ) : (
                <span className="flex-1 text-sm text-default-400">แตะเพื่อเลือกที่อยู่ (พิมพ์ค้นหา/เลือก)</span>
              )}
              <Icon icon="search" className="size-4 shrink-0 text-default-400" />
            </button>
          </div>
        </>
      )}

      <CustomerSearchSheet
        open={custOpen}
        onSelect={selectCustomer}
        onUseNew={useNewCustomer}
        onClose={() => setCustOpen(false)}
      />
      <PasteParseSheet open={pasteOpen} onApply={applyPaste} onClose={() => setPasteOpen(false)} />
      <AddressSearchSheet open={addrOpen} current={locality} onSelect={applyLocality} onClose={() => setAddrOpen(false)} />
    </>
  )
}
