'use client'

/**
 * CustomerQuickBlock — section "ลูกค้า" ของ quick create (< lg), phone-first
 * Base: mockup 2026-07-06-quick-create-order.html (section ลูกค้า) + CustomerSearchSheet (dedup, full-screen)
 * ค้นหาลูกค้า → full-screen CustomerSearchSheet (คลิกเดียวได้ข้อมูล); เจอลูกค้าเดิม = badge "ลูกค้าเก่า" ข้างหัวข้อ
 * wand tool → PasteParseSheet; locality field → AddressSearchSheet; ที่อยู่แสดงเมื่อ salesChannel !== STOREFRONT
 */

import { useState, useRef } from 'react'
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
  const [custQuery, setCustQuery] = useState('')
  const [selected, setSelected] = useState<CustomerResult | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false) // badge "ลูกค้าใหม่" (paste ไม่เจอ / ยืนยันลูกค้าใหม่)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // พิมพ์เบอร์ → debounce (เผื่อ paste) → เปิด sheet ค้นหา (ไม่เปิดตอนแค่จิ้ม)
  const triggerCustomerSearch = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      const t = value.trim()
      if (t.length >= 2) {
        setCustQuery(t)
        setCustOpen(true)
      }
    }, 500)
  }

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
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setSelected(c)
    setIsNewCustomer(false)
    setValue('buyerContact', c.contact)
    setValue('buyerName', c.name ?? '')
    setCustOpen(false)
  }

  // "ใช้คำที่พิมพ์เป็นลูกค้าใหม่" — เดา: ขึ้นต้นด้วยเลข = เบอร์, ไม่งั้น = ชื่อ
  const useNewCustomer = (q: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setSelected(null)
    setIsNewCustomer(true)
    if (/^\d/.test(q)) setValue('buyerContact', q)
    else setValue('buyerName', q)
    setCustOpen(false)
  }

  // เช็ก DB ว่าเบอร์นี้เป็นลูกค้าเก่าไหม → โชว์ badge (ใช้หลัง paste เติมเบอร์ให้)
  const lookupExistingCustomer = async (phone: string) => {
    if (phone.trim().length < 2) return
    try {
      const res = await fetch(`/api/orders/customers?q=${encodeURIComponent(phone.trim())}`)
      if (!res.ok) return
      const list: CustomerResult[] = await res.json()
      const match = list.find((c) => c.contact === phone.trim())
      if (match) {
        setSelected(match)
        setIsNewCustomer(false)
      } else {
        setIsNewCustomer(true) // paste เบอร์ที่ไม่มีในระบบ → ลูกค้าใหม่
      }
    } catch {
      /* เงียบ — เป็น enhancement */
    }
  }

  const applyPaste = (p: ParsedOrderMessage) => {
    setSelected(null)
    if (p.name) setValue('buyerName', p.name)
    if (p.phone) {
      setValue('buyerContact', p.phone)
      void lookupExistingCustomer(p.phone) // เช็กลูกค้าเก่าจากเบอร์ที่ paste มา
    }
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
      {/* header: ลูกค้า (title เด่น) + badge ลูกค้าเก่า + ปุ่มกระจายที่อยู่ (paste) */}
      <div className="mb-3 flex items-center gap-2">
        <Icon icon="user" className="size-5 text-primary" />
        <h2 className="text-base font-bold text-dark">ลูกค้า</h2>
        {selected && (
          <span className="badge badge-label bg-success/15 text-success text-2xs font-semibold">
            <Icon icon="user-check" className="text-xs" />
            ลูกค้าเก่า · {selected.orderCount} ออเดอร์
          </span>
        )}
        {!selected && isNewCustomer && (
          <span className="badge badge-label bg-info/15 text-info text-2xs font-semibold">
            <Icon icon="user-plus" className="text-xs" />
            ลูกค้าใหม่
          </span>
        )}
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
        >
          <Icon icon="clipboard" className="size-4" />
          กระจายที่อยู่
        </button>
      </div>

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
            setIsNewCustomer(false)
            nameField.onChange(e)
          }}
          onBlur={nameField.onBlur}
        />
        {errors.buyerName?.message && <p className="mt-1 text-xs text-danger">{String(errors.buyerName.message)}</p>}
      </div>

      {/* เบอร์ — พิมพ์ (หรือ paste) → debounce → เปิด sheet ค้นหา/เพิ่มลูกค้า (รวมกรณีเปลี่ยนเบอร์หลังเลือกแล้ว) */}
      <div className="mb-2.5">
        <label className="form-label">เบอร์โทร</label>
        <input
          type="text"
          inputMode="tel"
          autoComplete="off"
          placeholder="พิมพ์เบอร์ → ค้นหาลูกค้า"
          className="form-input"
          value={contactField.value ?? ''}
          onChange={(e) => {
            setSelected(null)
            setIsNewCustomer(false)
            contactField.onChange(e)
            triggerCustomerSearch(e.target.value)
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
        initialQuery={custQuery}
        onSelect={selectCustomer}
        onUseNew={useNewCustomer}
        onClose={() => setCustOpen(false)}
      />
      <PasteParseSheet open={pasteOpen} onApply={applyPaste} onClose={() => setPasteOpen(false)} />
      <AddressSearchSheet open={addrOpen} current={locality} onSelect={applyLocality} onClose={() => setAddrOpen(false)} />
    </>
  )
}
