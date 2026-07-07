/**
 * CustomerSelectBlock — ข้อมูลลูกค้า (order create)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx (+ custom/_forms.css)
 * UX (feat 00014 polish): inline key-in — ช่องชื่อ + เบอร์/อีเมล โชว์เลย (ตัด mode toggle เดิม);
 *   พิมพ์เบอร์/ชื่อ → live search ลูกค้าเดิมของร้าน (dropdown) → เลือก = fill; เจอเบอร์เดิม = แสดง "ลูกค้าเดิม".
 *   dropdown = custom React state (ไม่ใช้ Preline) — same-page pattern เดิม.
 * RHF: buyerName / buyerContact ผ่าน useController. server derive customerId จากเบอร์เอง (ไม่ส่งจาก UI).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  /** 'card' = standalone card; 'embedded' = ใน accordion body (ตัด card chrome) */
  variant?: 'card' | 'embedded'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerSelectBlock({ control, errors, variant = 'card' }: Props) {
  const embedded = variant === 'embedded'
  const { field: buyerNameField } = useController({ control, name: 'buyerName', defaultValue: '' })
  const { field: buyerContactField } = useController({ control, name: 'buyerContact', defaultValue: '' })

  // ── UI-only state ─────────────────────────────────────────────────────────
  const [results, setResults] = useState<CustomerResult[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CustomerResult | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestQueryRef = useRef<string>('')
  const comboRef = useRef<HTMLDivElement>(null)

  // ── ปิด dropdown เมื่อคลิกนอก combo ───────────────────────────────────────
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setIsDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // ── Debounced search (q>=2) — ค้นลูกค้าของร้านตัวเอง (ชื่อ/เบอร์) ──────────
  const runSearch = useCallback((value: string) => {
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

  // ── เลือกลูกค้าเดิมจาก dropdown → fill ชื่อ+เบอร์ ──────────────────────────
  const selectCustomer = useCallback(
    (c: CustomerResult) => {
      setSelected(c)
      buyerNameField.onChange(c.name ?? '')
      buyerContactField.onChange(c.contact)
      setIsDropdownOpen(false)
      setResults([])
    },
    [buyerNameField, buyerContactField],
  )

  // พิมพ์ในช่องเบอร์/ชื่อ → อัปเดต field + trigger search + ล้าง selected (แก้แล้วไม่ใช่ลูกค้าเดิม)
  const onContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(null)
    buyerContactField.onChange(e)
    runSearch(e.target.value)
  }
  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    buyerNameField.onChange(e)
    runSearch(e.target.value)
  }

  const avatarChar = (c: CustomerResult) => (c.name ?? c.contact).trim().charAt(0) || '?'
  const maskContact = (s: string) => (s.length <= 7 ? s : s.slice(0, 3) + '•••' + s.slice(-4))

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? '' : 'card'}>
      {!embedded && (
        <div className="card-header">
          <h2 className="flex items-center gap-2 font-semibold text-dark">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
              1
            </span>
            ข้อมูลลูกค้า
          </h2>
        </div>
      )}

      <div className={embedded ? 'p-2' : 'card-body p-4 sm:p-5'}>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* ชื่อลูกค้า */}
          <div>
            <label htmlFor="cust-name" className="form-label">
              ชื่อลูกค้า
            </label>
            <input
              id="cust-name"
              type="text"
              autoComplete="off"
              placeholder="เช่น สมชาย ใจดี"
              className="form-input"
              value={buyerNameField.value ?? ''}
              onChange={onNameChange}
              onBlur={buyerNameField.onBlur}
            />
            {errors.buyerName?.message && (
              <p className="text-danger mt-1 text-sm">{String(errors.buyerName.message)}</p>
            )}
          </div>

          {/* เบอร์โทร + live search dropdown (feature 00015: บังคับเป็นเบอร์โทรเท่านั้น — ตัดอีเมล) */}
          <div>
            <label htmlFor="cust-contact" className="form-label">
              เบอร์โทร
            </label>
            <div className="relative" ref={comboRef}>
              <Icon
                icon="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-default-400"
              />
              <input
                id="cust-contact"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="พิมพ์เบอร์โทร…"
                className="form-input !pl-9"
                value={buyerContactField.value ?? ''}
                onChange={onContactChange}
                onBlur={buyerContactField.onBlur}
                onFocus={() => {
                  if (results.length > 0 || fetchError) setIsDropdownOpen(true)
                }}
              />

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 divide-y divide-default-200 overflow-auto rounded border border-default-300 bg-card shadow-lg">
                  {isLoading && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-default-500">
                      <Icon icon="loader-2" className="size-3.5 animate-spin" />
                      กำลังค้นหา…
                    </div>
                  )}
                  {!isLoading && fetchError && <div className="px-4 py-3 text-sm text-danger">{fetchError}</div>}
                  {!isLoading && !fetchError && results.length === 0 && (
                    <div className="px-4 py-4 text-center text-sm text-default-500">
                      ไม่พบลูกค้าเดิม — พิมพ์ต่อเพื่อบันทึกเป็นลูกค้าใหม่
                    </div>
                  )}
                  {!isLoading &&
                    !fetchError &&
                    results.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-default-100"
                        onClick={() => selectCustomer(c)}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                          {avatarChar(c)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-dark">{c.name ?? c.contact}</p>
                          <p className="text-xs text-default-500">
                            {maskContact(c.contact)} · ลูกค้าเดิม {c.orderCount} ออเดอร์
                          </p>
                        </div>
                        <Icon icon="chevron-right" className="size-3.5 shrink-0 text-default-400" />
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* recognize ลูกค้าเดิม */}
            {selected && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success">
                <Icon icon="user-check" className="size-3.5 shrink-0" />
                ลูกค้าเดิม · {selected.orderCount} ออเดอร์
              </p>
            )}
            {errors.buyerContact?.message ? (
              <p className="text-danger mt-1 text-sm">{String(errors.buyerContact.message)}</p>
            ) : !selected ? (
              <p className="text-default-400 mt-1 text-xs">
                เบอร์โทรสำหรับแจ้งลิงก์ผู้ซื้อ — เบอร์เดิม = จดจำเป็นลูกค้าเดียวกัน
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
