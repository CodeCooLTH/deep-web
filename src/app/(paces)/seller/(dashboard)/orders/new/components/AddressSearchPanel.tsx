'use client'

/**
 * AddressSearchPanel — desktop inline combobox ค้นหาที่อยู่ไทย (orders/new POS, accordion "ที่อยู่จัดส่ง")
 * Base: paces-component-reference.md §4 (input-icon-group, theme/paces/Docs/index.html) +
 *   dropdown-menu pattern จาก CustomerSelectBlock.tsx (Base เดิมของไฟล์นั้น: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx)
 * fetch/cache logic + แถวผลลัพธ์ (ตำบล › อำเภอ › จังหวัด › รหัส) ก็อปมาจาก AddressSearchSheet.tsx (mobile full-screen sheet)
 *   ปรับจาก full-screen เป็น inline dropdown — ห้ามแก้/import AddressSearchSheet (OOS-5) →
 *   cache แยกเป็น module-level ของตัวเอง (known-gap ยอมรับแล้ว ไม่ share กับมือถือ)
 * data: public/data/thai-address.json (jquery.Thailand.js, 7498 records) — fetch runtime + cache module-level
 *   (ไม่ import กัน tsc infer literal 982KB + ไม่เข้า JS bundle — served static, browser cache)
 * เลือกแล้ว → เติม subdistrict/district/province/postcode พร้อมกันผ่าน onSelect
 *   (pattern เดียวกับ applyLocality ใน CustomerQuickBlock.tsx — ห้ามแก้ไฟล์นั้นเช่นกัน)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'

interface AddrRecord {
  district: string // ตำบล
  amphoe: string // อำเภอ
  province: string // จังหวัด
  zipcode: string
}

export interface SelectedLocality {
  subdistrict: string
  district: string
  province: string
  postcode: string
}

// cache แยกของ desktop panel เอง (module-level, โหลด db ครั้งเดียวต่อ session)
let DESKTOP_ADDR_CACHE: AddrRecord[] | null = null

interface Props {
  current: SelectedLocality | null
  onSelect: (loc: SelectedLocality) => void
}

export default function AddressSearchPanel({ current, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [db, setDb] = useState<AddrRecord[] | null>(DESKTOP_ADDR_CACHE)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)

  // ปิด dropdown เมื่อคลิกนอก combo (pattern เดียวกับ CustomerSelectBlock)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open])

  // โหลด db แบบ lazy ตอน focus ครั้งแรก (ไม่ fetch ตั้งแต่ page load)
  const ensureLoaded = () => {
    if (DESKTOP_ADDR_CACHE) {
      setDb(DESKTOP_ADDR_CACHE)
      return
    }
    if (loading) return
    setLoading(true)
    fetch('/data/thai-address.json')
      .then((r) => r.json())
      .then((data: AddrRecord[]) => {
        DESKTOP_ADDR_CACHE = data
        setDb(data)
      })
      .catch(() => {
        /* โหลดล้ม → list ว่าง (seller สลับไปกรอกเองได้) */
      })
      .finally(() => setLoading(false))
  }

  const s = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!db || !s) return []
    const out: AddrRecord[] = []
    for (const r of db) {
      if (
        r.district.toLowerCase().includes(s) ||
        r.amphoe.toLowerCase().includes(s) ||
        r.province.toLowerCase().includes(s) ||
        r.zipcode.includes(s)
      ) {
        out.push(r)
        if (out.length >= 30) break // จำกัดผลลัพธ์กัน list ยาว
      }
    }
    return out
  }, [db, s])

  const isSel = (r: AddrRecord) =>
    !!current &&
    current.subdistrict === r.district &&
    current.district === r.amphoe &&
    current.province === r.province &&
    current.postcode === r.zipcode

  const select = (r: AddrRecord) => {
    onSelect({ subdistrict: r.district, district: r.amphoe, province: r.province, postcode: r.zipcode })
    setQ('')
    setOpen(false)
  }

  const hasSelection = !!(current && (current.subdistrict || current.district || current.province || current.postcode))

  return (
    <div>
      <label className="form-label">ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์</label>
      <div className="relative" ref={comboRef}>
        <div className="input-icon-group">
          <span className="input-icon">
            <Icon icon="search" className="size-4 text-default-400" />
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => {
              ensureLoaded()
              setOpen(true)
            }}
            placeholder="ค้นหาตำบล อำเภอ จังหวัด หรือรหัสไปรษณีย์…"
            className="form-input"
          />
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 divide-y divide-default-200 overflow-auto rounded border border-default-300 bg-card shadow-lg">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-default-500">
                <Icon icon="loader-2" className="size-3.5 animate-spin" />
                กำลังโหลดข้อมูลที่อยู่…
              </div>
            )}
            {!loading && !s && (
              <p className="px-4 py-4 text-center text-sm text-default-400">
                พิมพ์ตำบล / อำเภอ / จังหวัด / รหัส อย่างใดอย่างหนึ่ง
              </p>
            )}
            {!loading && s && results.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-default-400">ไม่พบที่อยู่</p>
            )}
            {!loading &&
              s &&
              results.map((r, i) => {
                const sel = isSel(r)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => select(r)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-default-100"
                  >
                    <span className={`text-sm ${sel ? 'font-semibold text-success' : 'text-dark'}`}>
                      {r.district} <span className="text-default-300">&gt;</span> {r.amphoe}{' '}
                      <span className="text-default-300">&gt;</span> {r.province}{' '}
                      <span className="text-default-300">&gt;</span> {r.zipcode}
                    </span>
                    {sel && <Icon icon="check" className="size-4 shrink-0 text-success" />}
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {/* สรุปที่เลือกแล้ว (Verified-Means-Green) */}
      {hasSelection && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-success">
          <Icon icon="check" className="size-3.5 shrink-0" />
          ต.{current?.subdistrict || '—'} · อ.{current?.district || '—'} · {current?.province || '—'} ·{' '}
          {current?.postcode || '—'}
        </p>
      )}
    </div>
  )
}
