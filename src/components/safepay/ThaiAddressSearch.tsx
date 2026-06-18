/**
 * ThaiAddressSearch — ช่องค้นหาที่อยู่ไทยช่องเดียว (โหมดค้นหา jquery.Thailand.js)
 *
 * พิมพ์ส่วนไหนก็ได้ (ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์) → suggestion รวม
 * "ตำบล » อำเภอ » จังหวัด » รหัสไปรษณีย์" → เลือก → autofill + ช่องรายละเอียด
 * (บ้านเลขที่/ถนน) → compose เป็น string เดียวส่งกลับ onChange.
 *
 * data: `thai-address-database` (dependency-free, dataset earthchie) — lazy import
 *   ตอน mount (db.json ~205KB แยก chunk). ค้นหา client-side ล้วน.
 * open/close + keyboard = custom React (ไม่ใช่ Preline) — เหตุผลเดียวกับ FilterDropdown
 *   (parent re-render ทุก keystroke → Preline inline-state พัง).
 *
 * Base (markup/visual dropdown): theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (.dropdown-item)
 * Base (click-outside/Escape pattern): src/components/safepay/FilterDropdown.tsx
 * Base (input-icon-group + hint): theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *
 * Shared reusable — ใช้ได้ทุกหน้า (paces) ที่ต้องกรอกที่อยู่ไทย (onboarding, settings ฯลฯ)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import { useCallback, useEffect, useRef, useState } from 'react'

export type ThaiAddress = { district: string; amphoe: string; province: string; zipcode: string }

type AddressLib = {
  searchAddressByDistrict: (q: string) => ThaiAddress[]
  searchAddressByAmphoe: (q: string) => ThaiAddress[]
  searchAddressByProvince: (q: string) => ThaiAddress[]
  searchAddressByZipcode: (q: string) => ThaiAddress[]
}

interface Props {
  /** เรียกทุกครั้งที่ที่อยู่เปลี่ยน — string ว่าง = ยังไม่เลือก (parent ใช้ปิดปุ่มถัดไป) */
  onChange: (composed: string) => void
  disabled?: boolean
}

/** รวมรายละเอียด + ที่อยู่มาตรฐานเป็น string เดียว */
function compose(detail: string, a: ThaiAddress | null): string {
  if (!a) return ''
  return [detail.trim(), `ต.${a.district}`, `อ.${a.amphoe}`, `จ.${a.province}`, a.zipcode]
    .filter(Boolean)
    .join(' ')
}

export default function ThaiAddressSearch({ onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ThaiAddress[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [selected, setSelected] = useState<ThaiAddress | null>(null)
  const [detail, setDetail] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  const libRef = useRef<AddressLib | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // lazy-load dataset ตอน mount (แยก chunk — ไม่ถ่วง bundle หน้า)
  useEffect(() => {
    let cancelled = false
    import('thai-address-database')
      .then((m) => {
        if (cancelled) return
        // CJS module: named exports อาจอยู่บน default หรือ namespace
        const lib = ((m as { default?: AddressLib }).default ?? m) as unknown as AddressLib
        libRef.current = lib
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // click-outside + Escape (ปิด suggestion list)
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // ค้นหารวมทุก field → dedup → จำกัด 20
  const runSearch = useCallback((q: string) => {
    const lib = libRef.current
    if (!lib || q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const isNum = /^\d+$/.test(q.trim())
    const rows = isNum
      ? lib.searchAddressByZipcode(q.trim())
      : [
          ...lib.searchAddressByDistrict(q),
          ...lib.searchAddressByAmphoe(q),
          ...lib.searchAddressByProvince(q),
        ]
    const seen = new Set<string>()
    const out: ThaiAddress[] = []
    for (const r of rows) {
      const k = `${r.district}|${r.amphoe}|${r.province}|${r.zipcode}`
      if (!seen.has(k)) {
        seen.add(k)
        out.push(r)
      }
      if (out.length >= 20) break
    }
    setResults(out)
    setHighlight(0)
    setOpen(true)
  }, [])

  const onQueryChange = (v: string) => {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(v), 250)
  }

  const pick = (a: ThaiAddress) => {
    setSelected(a)
    setOpen(false)
    setQuery('')
    setResults([])
    onChange(compose(detail, a))
  }

  const clearSelected = () => {
    setSelected(null)
    onChange('')
    // focus กลับช่องค้นหา
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  const onDetailChange = (v: string) => {
    setDetail(v)
    onChange(compose(v, selected))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const a = results[highlight]
      if (a) pick(a)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // fallback: โหลด dataset ไม่สำเร็จ → textarea ธรรมดา (ไม่ block onboarding)
  if (loadFailed) {
    return (
      <textarea
        className="form-textarea"
        rows={3}
        placeholder="บ้านเลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <div ref={rootRef} className="relative">
      {!selected ? (
        <>
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="form-input"
              placeholder="พิมพ์ ตำบล, อำเภอ, จังหวัด หรือรหัสไปรษณีย์..."
              value={query}
              disabled={disabled}
              autoComplete="off"
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => query.trim().length >= 2 && results.length > 0 && setOpen(true)}
              onKeyDown={onKeyDown}
            />
          </div>
          <small className="text-default-400 mt-1 block text-xs">
            ลองกรอกอย่างใดอย่างหนึ่ง ตำบล, อำเภอ, จังหวัด หรือ รหัสไปรษณีย์
          </small>

          {open && (
            <div
              className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded border border-default-300 bg-card p-1 shadow-lg"
              role="listbox"
            >
              {results.length === 0 ? (
                <div className="text-default-400 px-3 py-2 text-sm">ไม่พบผลลัพธ์ กรุณาลองคำอื่น</div>
              ) : (
                results.map((r, i) => (
                  <button
                    key={`${r.district}|${r.amphoe}|${r.province}|${r.zipcode}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={`dropdown-item min-h-11 ${i === highlight ? 'active' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(r)}
                  >
                    <Icon icon="map-pin" className="size-4 shrink-0 text-primary" />
                    <span className="text-start text-sm">
                      {r.district} » {r.amphoe} » {r.province} » {r.zipcode}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-primary/15 flex items-start gap-3 rounded-lg p-3">
            <Icon icon="circle-check" className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-default-900 font-semibold">{selected.district}</p>
              <p className="text-default-500 text-sm">
                อ.{selected.amphoe} จ.{selected.province} {selected.zipcode}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelected}
              disabled={disabled}
              className="btn btn-sm bg-light text-dark shrink-0"
            >
              <Icon icon="x" className="size-4" /> เปลี่ยน
            </button>
          </div>

          <label className="form-label mt-4">รายละเอียดเพิ่มเติม (เลขที่, หมู่, ซอย, ถนน)</label>
          <div className="input-icon-group">
            <Icon icon="home" className="input-icon" />
            <input
              type="text"
              className="form-input"
              placeholder="เช่น 123/4 หมู่ 5 ซอยบางกอก ถนนสุขุมวิท"
              value={detail}
              disabled={disabled}
              onChange={(e) => onDetailChange(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  )
}
