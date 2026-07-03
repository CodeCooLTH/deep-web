/**
 * CustomerSelectBlock — บล็อกเลือก/ค้นหาลูกค้า สำหรับฟอร์มสร้างออเดอร์
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx (+ custom/_forms.css, plugins/_select2.css); structure per docs/mockups/seller-orders/create.html BLOCK 1
 *
 * โครงสร้าง card + form-label + form-input copy จาก Paces order-add page
 * ลักษณะ search-first (ค้นเดิม / เพิ่มใหม่) copy จาก mockup BLOCK 1 (lines 57-115)
 * JS behavior ของ dropdown + mode switching ดัดแปลงจาก mockup script (lines 215-265)
 * ปรับ: raw HTML → React + useController (RHF); raw <iconify-icon> → Icon wrapper
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useController } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerResult {
  name: string | null
  contact: string
  orderCount: number
}

export interface Props {
  control: Control<any>      // rhf control จาก parent useForm
  errors: FieldErrors<any>   // parent formState.errors (อ่าน buyerName / buyerContact)
}

type Mode = 'search' | 'new' | null

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerSelectBlock({ control, errors }: Props) {
  // ── RHF controllers — เชื่อม buyerName + buyerContact กับ parent form ─────
  const {
    field: buyerNameField,
  } = useController({ control, name: 'buyerName', defaultValue: '' })

  const {
    field: buyerContactField,
  } = useController({ control, name: 'buyerContact', defaultValue: '' })

  // ── UI-only state (ไม่ใช่ form field) ────────────────────────────────────
  const [mode, setMode] = useState<Mode>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerResult[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // fetchError ใช้แสดงข้อผิดพลาดจาก fetch (ไม่ใช่ RHF error)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CustomerResult | null>(null)

  // ── Refs สำหรับ debounce + stale-request guard ───────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // latestQuery เก็บ query ล่าสุดที่ส่ง fetch ไป — ป้องกัน out-of-order response
  const latestQueryRef = useRef<string>('')
  const comboRef = useRef<HTMLDivElement>(null)

  // ── ปิด dropdown เมื่อ click นอก combo ──────────────────────────────────
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // ── Debounced search fetch ────────────────────────────────────────────────
  // debounce ~300ms; q < 2 ไม่ fetch; guard stale response ด้วย latestQueryRef
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setFetchError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = value.trim()
    if (trimmed.length < 2) {
      setResults([])
      setIsDropdownOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const thisQuery = trimmed
      latestQueryRef.current = thisQuery
      setIsLoading(true)

      try {
        const res = await fetch(`/api/orders/customers?q=${encodeURIComponent(thisQuery)}`)
        // ถ้า query เปลี่ยนระหว่างรอ ให้ทิ้ง response นี้ (stale guard)
        if (latestQueryRef.current !== thisQuery) return

        if (!res.ok) throw new Error('ค้นหาไม่สำเร็จ')
        const data: CustomerResult[] = await res.json()
        setResults(data)
        setIsDropdownOpen(true)
      } catch {
        if (latestQueryRef.current !== thisQuery) return
        setFetchError('ไม่สามารถค้นหาลูกค้าได้')
        setIsDropdownOpen(true)
      } finally {
        if (latestQueryRef.current === thisQuery) setIsLoading(false)
      }
    }, 300)
  }, [])

  // ── เลือกลูกค้าเดิม — เขียนผ่าน useController ไปยัง parent form ─────────
  const selectCustomer = useCallback((c: CustomerResult) => {
    setSelected(c)
    // name อาจ null → ใช้ '' เพื่อให้ผู้ขายกรอกเพิ่มเติมถ้าต้องการ
    buyerNameField.onChange(c.name ?? '')
    buyerContactField.onChange(c.contact)
    setIsDropdownOpen(false)
    setQuery('')
    setResults([])
  }, [buyerNameField, buyerContactField])

  // ── เปลี่ยน mode ─────────────────────────────────────────────────────────
  const changeMode = useCallback((next: Mode) => {
    setMode(next)
    setSelected(null)
    setQuery('')
    setResults([])
    setIsDropdownOpen(false)
    setFetchError(null)
    // ล้าง field เมื่อเปลี่ยน mode เพื่อไม่ให้ค่าเก่าค้างในฟอร์ม
    buyerNameField.onChange('')
    buyerContactField.onChange('')
  }, [buyerNameField, buyerContactField])

  // ── Clear selection → กลับไป search ─────────────────────────────────────
  const clearSelection = useCallback(() => {
    setSelected(null)
    buyerNameField.onChange('')
    buyerContactField.onChange('')
    setQuery('')
  }, [buyerNameField, buyerContactField])

  // ── สร้าง initial avatar char ─────────────────────────────────────────────
  const avatarChar = (c: CustomerResult) => {
    const label = c.name ?? c.contact
    return label.trim().charAt(0) || '?'
  }

  // ── Masked contact สำหรับ display (ไม่ส่งข้อมูลดิบ)  ─────────────────────
  const maskContact = (s: string) => {
    if (s.length <= 7) return s
    return s.slice(0, 3) + '•••' + s.slice(-4)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="card-header">
        {/* step chip + หัวข้อ — copy class pattern จาก mockup step-no + card-header */}
        <h2 className="flex items-center gap-2 font-semibold text-dark">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold"
          >
            1
          </span>
          ข้อมูลลูกค้า
        </h2>
      </div>

      <div className="card-body p-4 sm:p-5">
        {/* ── เลือกวิธีระบุลูกค้า ── */}
        <div className="mb-4">
          <label className="form-label">เลือกวิธีระบุลูกค้า</label>
          {/* 2-col grid radio cards — copy class pattern จาก mockup cust-mode */}
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            {/* ตัวเลือก: ค้นหาลูกค้าเดิม */}
            <button
              type="button"
              onClick={() => changeMode('search')}
              className={[
                'flex cursor-pointer items-center justify-center gap-2 rounded border px-4 py-2.5 text-sm font-medium transition-all min-h-11',
                mode === 'search'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-default-300 text-default-700 hover:border-default-500',
              ].join(' ')}
            >
              <Icon icon="search" width={15} height={15} />
              ค้นหาลูกค้าเดิม
            </button>

            {/* ตัวเลือก: เพิ่มลูกค้าใหม่ */}
            <button
              type="button"
              onClick={() => changeMode('new')}
              className={[
                'flex cursor-pointer items-center justify-center gap-2 rounded border px-4 py-2.5 text-sm font-medium transition-all min-h-11',
                mode === 'new'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-default-300 text-default-700 hover:border-default-500',
              ].join(' ')}
            >
              <Icon icon="user-plus" width={15} height={15} />
              เพิ่มลูกค้าใหม่
            </button>
          </div>
        </div>

        {/* ── Prompt ก่อนเลือก mode — copy copy จาก mockup #custPrompt ── */}
        {mode === null && (
          <p className="flex items-center gap-2 rounded border border-dashed border-default-300 bg-default-100 px-3 py-2.5 text-xs text-default-500">
            <Icon icon="info-circle" width={14} height={14} className="shrink-0 text-default-400" />
            เลือกด้านบนว่าจะค้นหาลูกค้าเดิม หรือเพิ่มลูกค้าใหม่
          </p>
        )}

        {/* ── Mode: ค้นหาลูกค้าเดิม ── */}
        {mode === 'search' && !selected && (
          <div>
            {/* Combo wrapper: relative ครอบ เพื่อให้ dropdown ลอยเหนือ layout */}
            <div className="relative" ref={comboRef}>
              {/* Search icon adornment */}
              <Icon
                icon="search"
                width={16}
                height={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400"
              />
              {/* Search input */}
              <input
                type="text"
                autoComplete="off"
                className="form-input !pl-9"
                placeholder="พิมพ์เบอร์โทร หรือ ชื่อลูกค้า…"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => {
                  // โผล่ dropdown อีกครั้งเมื่อ focus ถ้ามีผลอยู่แล้ว
                  if (results.length > 0 || fetchError) setIsDropdownOpen(true)
                }}
              />
              {/* Caret indicator */}
              <Icon
                icon="chevron-down"
                width={16}
                height={16}
                className={[
                  'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-default-400 transition-transform',
                  isDropdownOpen ? 'rotate-180' : '',
                ].join(' ')}
              />

              {/* Dropdown — absolute ลอยเหนือ layout ไม่ดัน page */}
              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded border border-default-300 bg-card shadow-lg divide-y divide-default-200">
                  {isLoading && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-default-500">
                      <Icon icon="loader-2" width={14} height={14} className="animate-spin" />
                      กำลังค้นหา…
                    </div>
                  )}

                  {!isLoading && fetchError && (
                    <div className="px-4 py-3 text-sm text-danger">{fetchError}</div>
                  )}

                  {!isLoading && !fetchError && results.length === 0 && (
                    /* ไม่พบลูกค้า — ปุ่มสลับไป new mode */
                    <div className="px-4 py-4 text-center text-sm text-default-500">
                      ไม่พบลูกค้า —{' '}
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => changeMode('new')}
                      >
                        เพิ่มเป็นลูกค้าใหม่
                      </button>
                    </div>
                  )}

                  {!isLoading && !fetchError && results.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className="flex w-full items-center gap-3 p-3 text-left hover:bg-default-100"
                      onClick={() => selectCustomer(c)}
                    >
                      {/* Avatar วนกลม — copy pattern จาก mockup */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {avatarChar(c)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-dark truncate">
                          {c.name ?? c.contact}
                        </p>
                        <p className="text-xs text-default-500">
                          {maskContact(c.contact)} · ลูกค้าเดิม {c.orderCount} ออเดอร์
                        </p>
                      </div>
                      <Icon icon="chevron-right" width={14} height={14} className="text-default-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-default-400">
              ค้นด้วยเบอร์โทรหรือชื่อที่คล้ายกัน — ถ้าเคยซื้อมาก่อนจะเลือกได้เลย
            </p>
          </div>
        )}

        {/* ── Selected customer card — แสดงเมื่อเลือกลูกค้าเดิมแล้ว ── */}
        {mode === 'search' && selected && (
          <div className="flex items-center gap-3 rounded border border-default-300 bg-default-100 p-3">
            {/* Avatar */}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
              {avatarChar(selected)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-dark truncate">
                  {selected.name ?? selected.contact}
                </p>
                {/* badge สีเขียว — copy class pattern จาก mockup */}
                <span className="badge bg-success/15 text-success">ลูกค้าเดิม</span>
              </div>
              <p className="text-xs text-default-500 mt-0.5">
                {maskContact(selected.contact)} · ลูกค้าเดิม {selected.orderCount} ออเดอร์
              </p>
            </div>
            {/* ปุ่มเปลี่ยน — ล้าง selection กลับสู่ search */}
            <button
              type="button"
              className="btn btn-sm border-default-300 text-default-700 hover:bg-card shrink-0 min-h-11"
              onClick={clearSelection}
            >
              เปลี่ยน
            </button>
          </div>
        )}

        {/* buyerName error (แสดงใต้ search block เมื่อ mode=search ยังไม่เลือก) */}
        {mode === 'search' && !selected && errors.buyerName?.message && (
          <p className="text-danger mt-1 text-sm">{String(errors.buyerName.message)}</p>
        )}

        {/* ── Mode: เพิ่มลูกค้าใหม่ — 2 input wired ผ่าน useController ── */}
        {mode === 'new' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* ชื่อ-นามสกุลลูกค้า — buyerName */}
            <div>
              <label htmlFor="cust-buyer-name" className="form-label">
                ชื่อ-นามสกุลลูกค้า<span className="text-danger ms-0.5">*</span>
              </label>
              <input
                id="cust-buyer-name"
                type="text"
                placeholder="เช่น สมชาย ใจดี"
                className="form-input"
                value={buyerNameField.value}
                onChange={buyerNameField.onChange}
                onBlur={buyerNameField.onBlur}
                ref={buyerNameField.ref}
              />
              {errors.buyerName?.message && (
                <p className="text-danger mt-1 text-sm">{String(errors.buyerName.message)}</p>
              )}
            </div>

            {/* ช่องทางติดต่อผู้ซื้อ — buyerContact */}
            <div>
              <label htmlFor="cust-buyer-contact" className="form-label">
                ช่องทางติดต่อผู้ซื้อ
              </label>
              <input
                id="cust-buyer-contact"
                type="text"
                placeholder="0812345678 หรือ buyer@email.com"
                className="form-input"
                value={buyerContactField.value}
                onChange={buyerContactField.onChange}
                onBlur={buyerContactField.onBlur}
                ref={buyerContactField.ref}
              />
              {errors.buyerContact?.message ? (
                <p className="text-danger mt-1 text-sm">{String(errors.buyerContact.message)}</p>
              ) : (
                <p className="text-default-400 mt-1 text-xs">
                  เบอร์หรือ email สำหรับแจ้งลิงก์ให้ผู้ซื้อ
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
