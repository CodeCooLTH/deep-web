'use client'

/**
 * CustomerQuickBlock — section "ลูกค้า" ของ quick create (< lg), phone-first
 * Base: mockup 2026-07-06-quick-create-order.html (section ลูกค้า) + CustomerSelectBlock.tsx (dedup search /api/orders/customers)
 * เบอร์นำ → live-search dedup ลูกค้าเดิม (เติมชื่อ; Customer ไม่เก็บที่อยู่ → ที่อยู่ paste/manual) + chip "ลูกค้าเดิม N ออเดอร์"
 * wand tool → PasteParseSheet; locality field → AddressSearchSheet; ที่อยู่แสดงเมื่อ salesChannel !== STOREFRONT
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useController, useWatch } from 'react-hook-form'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import AddressSearchSheet, { type SelectedLocality } from './AddressSearchSheet'
import PasteParseSheet from './PasteParseSheet'
import type { FormValues } from './OrderCreateForm'
import type { ParsedOrderMessage } from '@/lib/parse-order-message'

interface CustomerResult {
  name: string | null
  contact: string
  orderCount: number
}

interface Props {
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
  setValue: UseFormSetValue<FormValues>
}

export default function CustomerQuickBlock({ control, errors, setValue }: Props) {
  const [pasteOpen, setPasteOpen] = useState(false)
  const [addrOpen, setAddrOpen] = useState(false)
  const [results, setResults] = useState<CustomerResult[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selected, setSelected] = useState<CustomerResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef('')
  const comboRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const runSearch = useCallback((v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const t = v.trim()
    if (t.length < 2) {
      setResults([])
      setDropdownOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      latestRef.current = t
      try {
        const res = await fetch(`/api/orders/customers?q=${encodeURIComponent(t)}`)
        if (latestRef.current !== t) return
        if (res.ok) {
          const d: CustomerResult[] = await res.json()
          setResults(d)
          setDropdownOpen(d.length > 0)
        }
      } catch {
        /* เงียบ — dedup เป็น enhancement, ล้มก็กรอกเองได้ */
      }
    }, 300)
  }, [])

  const selectCustomer = (c: CustomerResult) => {
    setSelected(c)
    setValue('buyerContact', c.contact)
    setValue('buyerName', c.name ?? '')
    setDropdownOpen(false)
    setResults([])
  }

  const onContact = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(null)
    contactField.onChange(e)
    runSearch(e.target.value)
  }

  const applyPaste = (p: ParsedOrderMessage) => {
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
      {/* header + wand tool (paste) */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-2xs font-bold tracking-wide text-default-400 uppercase">ลูกค้า</p>
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          aria-label="วางข้อความจากแชท"
          className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <Icon icon="wand" className="size-5" />
        </button>
      </div>

      {/* เบอร์นำ + dropdown dedup */}
      <div className="relative mb-2.5" ref={comboRef}>
        <label className="form-label">เบอร์โทร</label>
        <div className="relative">
          <Icon icon="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-default-400" />
          <input
            type="text"
            autoComplete="off"
            placeholder="พิมพ์เบอร์ → ค้นลูกค้าเดิม"
            className="form-input !pl-9"
            value={contactField.value ?? ''}
            onChange={onContact}
            onBlur={contactField.onBlur}
            onFocus={() => {
              if (results.length) setDropdownOpen(true)
            }}
          />
        </div>
        {dropdownOpen && (
          <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-56 divide-y divide-default-200 overflow-auto rounded border border-default-300 bg-card shadow-lg">
            {results.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectCustomer(c)}
                className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-default-100"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {(c.name ?? c.contact).trim().charAt(0) || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-dark">{c.name ?? c.contact}</p>
                  <p className="text-xs text-default-500">ลูกค้าเดิม {c.orderCount} ออเดอร์</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {errors.buyerContact?.message && <p className="mt-1 text-xs text-danger">{String(errors.buyerContact.message)}</p>}
      </div>

      {/* chip ลูกค้าเดิม */}
      {selected && (
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2">
          <Icon icon="user-check" className="size-4 shrink-0 text-success" />
          <span className="flex-1 text-sm font-semibold text-dark">
            {selected.name ?? selected.contact}
            <span className="ms-1 text-xs font-normal text-default-500">· ลูกค้าเดิม {selected.orderCount} ออเดอร์</span>
          </span>
        </div>
      )}

      {/* ชื่อ */}
      <div className="mb-2.5">
        <label className="form-label">ชื่อลูกค้า</label>
        <input
          type="text"
          placeholder="ชื่อลูกค้า"
          className="form-input"
          value={nameField.value ?? ''}
          onChange={nameField.onChange}
          onBlur={nameField.onBlur}
        />
        {errors.buyerName?.message && <p className="mt-1 text-xs text-danger">{String(errors.buyerName.message)}</p>}
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

      <PasteParseSheet open={pasteOpen} onApply={applyPaste} onClose={() => setPasteOpen(false)} />
      <AddressSearchSheet open={addrOpen} current={locality} onSelect={applyLocality} onClose={() => setAddrOpen(false)} />
    </>
  )
}
