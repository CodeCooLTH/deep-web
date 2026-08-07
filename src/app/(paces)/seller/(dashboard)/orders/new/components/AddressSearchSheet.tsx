'use client'

/**
 * AddressSearchSheet — full-screen sheet ค้นหาที่อยู่ไทย (quick create < lg)
 * Base: mockup 2026-07-06-quick-create-order.html (frame "แตะที่อยู่ → ค้นหา (full sheet)")
 * data: public/data/iship-address.json (7,662 records) — fetch runtime + cache module-level
 *   (ไม่ import กัน tsc infer literal ~1MB + ไม่เข้า JS bundle — served static, browser cache)
 *
 * สำคัญ: ใช้ชุดข้อมูลของ iShip ไม่ใช่ thai-address.json เดิม (user สั่ง 2026-07-29)
 * เพราะที่อยู่ที่เลือกตรงนี้ถูกส่งต่อไปเปิดพัสดุจริง ถ้าคำไม่ตรงกับที่ iShip รู้จัก พัสดุจะเปิดไม่ได้
 * หรือไปผิดที่ ตัวที่ต่างชัดสุดคือ **กทม.: iShip เรียก "กรุงเทพ" ชุดเดิมเรียก "กรุงเทพมหานคร"**
 * (เทียบแล้วไม่ตรงกัน 259 แถว — กทม. 186 + ชื่อตำบล/อำเภอ 57 + รหัสไปรษณีย์ 16)
 * ที่มา: ไฟล์ที่ iShip กำหนดให้ใช้ (Google Sheet ของผู้ให้บริการ) commit เข้า repo ไม่ยิงตอน runtime
 * พิมพ์ ตำบล/อำเภอ/จังหวัด/รหัส อย่างใดอย่างหนึ่ง → เลือก → เติมครบ 4 ฟิลด์
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

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

// cache ทั้ง session (โหลด db ครั้งเดียว)
let ADDR_CACHE: AddrRecord[] | null = null

interface Props {
  open: boolean
  current?: SelectedLocality | null
  onSelect: (loc: SelectedLocality) => void
  onClose: () => void
}

export default function AddressSearchSheet({ open, current, onSelect, onClose }: Props) {
  // ตรึงหน้าข้างหลังขณะโมดัลเปิด — controlled modal ไม่ได้ของนี้จาก Preline (ดู useLockBodyScroll)
  useLockBodyScroll(open)

  const [q, setQ] = useState('')
  const [db, setDb] = useState<AddrRecord[] | null>(ADDR_CACHE)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // fetch db ตอนเปิดครั้งแรก
  useEffect(() => {
    if (!open || ADDR_CACHE) {
      if (open && ADDR_CACHE) setDb(ADDR_CACHE)
      return
    }
    setLoading(true)
    fetch('/data/iship-address.json')
      .then((r) => r.json())
      .then((data: AddrRecord[]) => {
        ADDR_CACHE = data
        setDb(data)
      })
      .catch(() => {
        /* โหลดล้ม → list ว่าง (seller กรอกเองได้) */
      })
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (open) {
      setQ('')
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

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

  if (!open) return null

  const isSel = (r: AddrRecord) =>
    current &&
    current.subdistrict === r.district &&
    current.district === r.amphoe &&
    current.province === r.province &&
    current.postcode === r.zipcode

  return (
    <>
      {/* HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) */}
      <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="เลือกที่อยู่">
        <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
          <button type="button" onClick={onClose} aria-label="ย้อนกลับ" className="shrink-0 text-default-500">
            <Icon icon="chevron-left" className="size-6" />
          </button>
          <Icon icon="map-pin" className="size-5 text-primary" />
          <h3 className="text-base font-semibold text-dark">เลือกที่อยู่</h3>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <div className="input-icon-group">
            <span className="input-icon">
              <Icon icon="search" className="size-4 text-default-400" />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาตำบล อำเภอ จังหวัด หรือรหัสไปรษณีย์…"
              className="form-input"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
          {loading && <p className="py-6 text-center text-sm text-default-400">กำลังโหลดข้อมูลที่อยู่…</p>}
          {!loading && !s && (
            <p className="py-6 text-center text-sm text-default-400">พิมพ์ตำบล / อำเภอ / จังหวัด / รหัส อย่างใดอย่างหนึ่ง</p>
          )}
          {!loading && s && results.length === 0 && (
            <p className="py-6 text-center text-sm text-default-400">ไม่พบที่อยู่</p>
          )}
          <div className="divide-y divide-default-100">
            {results.map((r, i) => {
              const sel = isSel(r)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    onSelect({ subdistrict: r.district, district: r.amphoe, province: r.province, postcode: r.zipcode })
                  }
                  className="flex w-full items-center justify-between gap-2 py-3 text-left"
                >
                  <span className={`text-sm ${sel ? 'font-semibold text-success' : 'text-dark'}`}>
                    {r.district} <span className="text-default-300">&gt;</span> {r.amphoe}{' '}
                    <span className="text-default-300">&gt;</span> {r.province}{' '}
                    <span className="text-default-300">&gt;</span> {r.zipcode}
                  </span>
                  {sel && <Icon icon="check" className="size-5 shrink-0 text-success" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
