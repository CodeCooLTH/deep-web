'use client'

/**
 * AddressSearchPanel — desktop inline combobox ค้นหาที่อยู่ไทย (orders/new POS, accordion "ที่อยู่จัดส่ง")
 * Base: paces-component-reference.md §4 (input-icon-group, theme/paces/Docs/index.html) +
 *   dropdown-menu pattern จาก CustomerSelectBlock.tsx (Base เดิมของไฟล์นั้น: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx)
 * fetch/cache logic + แถวผลลัพธ์ (ตำบล › อำเภอ › จังหวัด › รหัส) ก็อปมาจาก AddressSearchSheet.tsx (mobile full-screen sheet)
 *   ปรับจาก full-screen เป็น inline dropdown — ห้ามแก้/import AddressSearchSheet (OOS-5) →
 *   cache แยกเป็น module-level ของตัวเอง (known-gap ยอมรับแล้ว ไม่ share กับมือถือ)
 * data: public/data/iship-address.json (7,662 records) — fetch runtime + cache module-level
 *   (ไม่ import กัน tsc infer literal ~1MB + ไม่เข้า JS bundle — served static, browser cache)
 *   สำคัญ: ชุดข้อมูลของ iShip ไม่ใช่ thai-address.json เดิม — ที่อยู่ตรงนี้ถูกส่งไปเปิดพัสดุจริง
 *   คำต้องตรงกับที่ iShip รู้จัก (กทม. iShip เรียก "กรุงเทพ" ชุดเดิมเรียก "กรุงเทพมหานคร")
 * เลือกแล้ว → เติม subdistrict/district/province/postcode พร้อมกันผ่าน onSelect
 *   (pattern เดียวกับ applyLocality ใน CustomerQuickBlock.tsx — ห้ามแก้ไฟล์นั้นเช่นกัน)
 * bug-fix (2026-07-22): dropdown ผลค้นหา `absolute top-full` โดน clip เมื่ออยู่ใน CartPanel
 *   (lg:overflow-y-auto) ใกล้ขอบล่าง — เปลี่ยนเป็น portal-to-body ผ่าน useAnchoredDropdown (shared hook
 *   ร่วมกับ ProductCombobox/CustomerSelectBlock); click-outside/escape/focus-trap ย้ายเข้า hook แล้ว
 */

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { useAnchoredDropdown } from '@/hooks/useAnchoredDropdown'
import { getLocalityStatus } from '@/lib/shipping-address-status'

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
  // click-outside/scroll-close/escape/focus-trap/portal position รวมอยู่ใน hook (shared 3 จุด — ดู hook สำหรับที่มา)
  const { anchorRef: comboRef, panelRef, style, mounted } = useAnchoredDropdown({ open, onClose: () => setOpen(false) })

  // โหลด db แบบ lazy ตอน focus ครั้งแรก (ไม่ fetch ตั้งแต่ page load)
  const ensureLoaded = () => {
    if (DESKTOP_ADDR_CACHE) {
      setDb(DESKTOP_ADDR_CACHE)
      return
    }
    if (loading) return
    setLoading(true)
    fetch('/data/iship-address.json')
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

  // มีข้อมูลบางส่วน ≠ ครบ — สรุปด้านล่างต้องบอกความจริงข้อนี้ ไม่ใช่ขึ้นเครื่องหมายถูกทุกกรณี
  // (กฎ "ครบพอบันทึกไหม" อยู่ที่ lib/shipping-address-status.ts ที่เดียว ห้ามเขียนซ้ำที่นี่)
  const { hasAnyData: hasSelection, missingRequired } = getLocalityStatus(current)

  return (
    <div>
      <label htmlFor="asp-locality" className="form-label">ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์</label>
      <div ref={comboRef}>
        <div className="input-icon-group">
          <span className="input-icon">
            <Icon icon="search" className="size-4 text-default-400" />
          </span>
          <input
            id="asp-locality"
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

        {/* portal ไป document.body — หลุด overflow ที่ตัด panel เมื่อเปิดใกล้ขอบล่าง CartPanel */}
        {open &&
          mounted &&
          style &&
          createPortal(
            <div
              ref={panelRef}
              style={style}
              className="max-h-64 divide-y divide-default-200 overflow-auto rounded border border-default-300 bg-card shadow-lg"
            >
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
            </div>,
            document.body,
          )}
      </div>

      {/* สรุปที่เลือกแล้ว — เขียวสงวนไว้กับ "ยืนยันแล้ว/สำเร็จ" ของระบบเท่านั้น (Verified-Means-Green)
          "กรอกที่อยู่ครบ" ไม่ใช่เหตุการณ์นั้น จึงใช้ primary; ขาดช่องบังคับ = danger พร้อมบอกว่าขาดอะไร */}
      {hasSelection && (
        <>
          <p
            className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
              missingRequired.length > 0 ? 'text-danger' : 'text-primary'
            }`}
          >
            <Icon icon={missingRequired.length > 0 ? 'alert-triangle' : 'map-pin'} className="size-3.5 shrink-0" />
            ต.{current?.subdistrict || '—'} · อ.{current?.district || '—'} · {current?.province || '—'} ·{' '}
            {current?.postcode || '—'}
          </p>
          {missingRequired.length > 0 && (
            <p className="mt-1 text-xs text-danger">
              ยังขาด{missingRequired.join('และ')} — ค้นหาที่อยู่อีกครั้งเพื่อเติมให้ครบ
            </p>
          )}
        </>
      )}
    </div>
  )
}
