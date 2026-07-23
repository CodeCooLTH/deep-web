'use client'

/**
 * TagInput — ช่องเพิ่มแท็กพร้อม autocomplete (feature 00018 CRM)
 * โหลด tag ที่ร้านเคยใช้ (GET /api/chat/tags) → พิมพ์/โฟกัสแล้วโชว์ที่มีอยู่ให้เลือก; ยังไม่มี → "เพิ่ม xxx"
 * ใช้ร่วมทั้ง ChatContextMenu (คลิกขวา) และ CustomerCrmSection (right panel)
 *
 * Base: theme/paces form-input + dropdown (.dropdown-item) — Paces primitive (HR7)
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'

type Props = {
  /** tag ที่เลือกไว้แล้ว — ตัดออกจาก suggestion + กันเพิ่มซ้ำ */
  selected: string[]
  onAdd: (tag: string) => void
  placeholder?: string
}

// cache ต่อ session — ไม่ยิงซ้ำทุกครั้งที่ mount TagInput (context menu สร้างใหม่บ่อย)
let cachedTags: string[] | null = null

export default function TagInput({ selected, onAdd, placeholder = 'เพิ่มแท็ก' }: Props) {
  const [input, setInput] = useState('')
  const [allTags, setAllTags] = useState<string[]>(cachedTags ?? [])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cachedTags) return
    fetch('/api/chat/tags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => {
        const tags: string[] = Array.isArray(d.tags) ? d.tags : []
        cachedTags = tags
        setAllTags(tags)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = input.trim()
  const ql = q.toLowerCase()
  const selectedLower = selected.map((s) => s.toLowerCase())
  const suggestions = allTags
    .filter((t) => !selectedLower.includes(t.toLowerCase()) && (!ql || t.toLowerCase().includes(ql)))
    .slice(0, 8)
  const exactExists =
    selectedLower.includes(ql) || allTags.some((t) => t.toLowerCase() === ql)
  const showCreate = q.length > 0 && !exactExists

  function add(tag: string) {
    const t = tag.trim()
    if (!t) return
    onAdd(t)
    setInput('')
    setOpen(false)
    // เพิ่มเข้า cache ทันที (ไม่ต้องรอ refetch) เผื่อใช้ต่อในแถวอื่น
    if (cachedTags && !cachedTags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      cachedTags = [...cachedTags, t].sort((a, b) => a.localeCompare(b, 'th'))
      setAllTags(cachedTags)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-2">
        <input
          type="text"
          className="form-input"
          placeholder={placeholder}
          value={input}
          maxLength={30}
          onChange={(e) => {
            setInput(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // Enter = เพิ่มตัวที่พิมพ์ (ถ้าไม่พิมพ์แต่มี suggestion แรก ใช้ตัวแรก)
              add(q || suggestions[0] || '')
            }
          }}
        />
        <button
          type="button"
          onClick={() => add(q || suggestions[0] || '')}
          className="btn btn-icon border-default-300 shrink-0"
          aria-label="เพิ่มแท็ก"
        >
          <Icon icon="plus" />
        </button>
      </div>

      {open && (suggestions.length > 0 || showCreate) && (
        <div className="border-default-300 bg-card absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg">
          {suggestions.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="dropdown-item text-sm">
              <Icon icon="tag" className="text-default-400 size-4" />
              {t}
            </button>
          ))}
          {showCreate && (
            <button type="button" onClick={() => add(q)} className="dropdown-item text-primary text-sm">
              <Icon icon="plus" className="size-4" />
              เพิ่ม “{q}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
