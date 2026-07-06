'use client'

/**
 * CustomerSearchSheet — full-screen sheet ค้นหา/เพิ่มลูกค้า (quick create < lg)
 * Base: AddressSearchSheet.tsx (full-screen shell) + CustomerSelectBlock (dedup /api/orders/customers)
 * พิมพ์ชื่อ/เบอร์ → list ลูกค้าเดิมทั้งหมด → คลิกเดียวได้ข้อมูล; ไม่เจอ → "ใช้เป็นลูกค้าใหม่"
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '@/components/wrappers/Icon'

export interface CustomerResult {
  name: string | null
  contact: string
  orderCount: number
}

interface Props {
  open: boolean
  onSelect: (c: CustomerResult) => void
  onUseNew: (query: string) => void
  onClose: () => void
}

export default function CustomerSearchSheet({ open, onSelect, onUseNew, onClose }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CustomerResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef('')

  useEffect(() => {
    if (open) {
      setQ('')
      setResults([])
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

  const runSearch = useCallback((v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const t = v.trim()
    if (t.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      latestRef.current = t
      try {
        const res = await fetch(`/api/orders/customers?q=${encodeURIComponent(t)}`)
        if (latestRef.current !== t) return
        setResults(res.ok ? await res.json() : [])
      } catch {
        if (latestRef.current === t) setResults([])
      } finally {
        if (latestRef.current === t) setLoading(false)
      }
    }, 300)
  }, [])

  if (!open) return null

  const typed = q.trim()
  const exactMatch = results.some((c) => c.contact === typed)

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock
    <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="ค้นหาลูกค้า">
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ย้อนกลับ" className="shrink-0 text-default-500">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <Icon icon="user-search" className="size-5 text-primary" />
        <h3 className="text-base font-semibold text-dark">ค้นหา / เพิ่มลูกค้า</h3>
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
            onChange={(e) => {
              setQ(e.target.value)
              runSearch(e.target.value)
            }}
            placeholder="พิมพ์ชื่อ หรือ เบอร์โทร…"
            className="form-input"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
        {loading && <p className="py-6 text-center text-sm text-default-400">กำลังค้นหา…</p>}
        {!loading && typed.length < 2 && (
          <p className="py-6 text-center text-sm text-default-400">พิมพ์ชื่อหรือเบอร์อย่างน้อย 2 ตัว</p>
        )}
        {!loading && typed.length >= 2 && results.length === 0 && (
          <p className="py-6 text-center text-sm text-default-400">ไม่พบลูกค้าเดิม</p>
        )}
        <div className="divide-y divide-default-100">
          {results.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(c)}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {(c.name ?? c.contact).trim().charAt(0) || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-dark">{c.name ?? c.contact}</p>
                <p className="text-xs text-default-500">
                  {c.contact} · ลูกค้าเดิม {c.orderCount} ออเดอร์
                </p>
              </div>
              <Icon icon="chevron-right" className="size-4 shrink-0 text-default-400" />
            </button>
          ))}
        </div>
        {/* ใช้คำที่พิมพ์เป็นลูกค้าใหม่ */}
        {typed.length >= 2 && !exactMatch && (
          <button
            type="button"
            onClick={() => onUseNew(typed)}
            className="mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-primary"
          >
            <Icon icon="user-plus" className="size-4 shrink-0" />
            <span className="truncate">ใช้ &ldquo;{typed}&rdquo; เป็นลูกค้าใหม่</span>
          </button>
        )}
      </div>
    </div>
  )
}
