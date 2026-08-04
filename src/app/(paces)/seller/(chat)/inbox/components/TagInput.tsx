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

// cache ต่อ session — ใช้เป็น "ค่าเริ่มต้นระหว่างรอ" ไม่ใช่คำตอบสุดท้าย (stale-while-revalidate)
// bug fix 2026-07-23: ของเดิม `if (cachedTags) return` แล้วข้ามการ fetch — แต่ `[]` เป็น truthy
// ใน JS ร้านที่เปิดหน้าตอนยังไม่มีแท็กเลยจะติด cache ว่างถาวรทั้ง session แท็กที่เพิ่มทีหลัง
// (หรือที่คนอื่นในร้านเพิ่ม) ไม่มีวันโผล่จนกว่าจะรีเฟรชทั้งหน้า
let cachedTags: string[] | null = null

export default function TagInput({ selected, onAdd, placeholder = 'เพิ่มแท็ก' }: Props) {
  const [input, setInput] = useState('')
  const [allTags, setAllTags] = useState<string[]>(cachedTags ?? [])
  const [loading, setLoading] = useState(cachedTags === null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    // ยิงทุกครั้งที่ mount แต่แสดง cache เดิมไปพลางก่อน — context menu สร้าง component ใหม่บ่อย
    // ก็จริง แต่ endpoint นี้เบามาก (distinct tag ของร้าน) แลกกับข้อมูลที่ไม่ค้างคุ้มกว่า
    fetch('/api/chat/tags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => {
        if (cancelled) return
        const tags: string[] = Array.isArray(d.tags) ? d.tags : []
        cachedTags = tags
        setAllTags(tags)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
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
      {/* ไม่มีปุ่ม [+] ท้ายช่อง (user สั่ง 2026-07-23: "ไม่จำเป็นละ") — Enter เพิ่มแท็กได้อยู่แล้ว
          และรายการ suggestion ด้านล่างมีแถว "เพิ่ม …" ให้กดอยู่แล้ว ปุ่มจึงเป็นทางที่ 3 ที่ซ้ำซ้อน
          และกินความกว้างของช่องพิมพ์ในคอลัมน์ที่แคบอยู่แล้ว */}
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
      </div>

      {/* เปิดแล้วต้องเห็นอะไรบางอย่างเสมอ (bug fix 2026-07-23: user จิ้มช่องแล้วไม่เห็นอะไรเลย
          จนแยกไม่ออกว่าระบบพังหรือแค่ยังไม่มีแท็ก) — เดิมซ่อนทั้งกล่องเมื่อไม่มี suggestion และ
          ยังไม่ได้พิมพ์ ซึ่งเป็นเคสปกติของร้านที่เพิ่งเริ่มใช้แท็ก */}
      {open && (
        <div className="border-default-300 bg-card absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg">
          {suggestions.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="dropdown-item text-sm">
              <Icon icon="tag" className="text-default-700 size-4" />
              {t}
            </button>
          ))}
          {showCreate && (
            <button type="button" onClick={() => add(q)} className="dropdown-item text-primary text-sm">
              <Icon icon="plus" className="size-4" />
              เพิ่ม “{q}”
            </button>
          )}
          {suggestions.length === 0 && !showCreate && (
            <p className="text-default-700 px-3 py-2.5 text-xs">
              {loading
                ? 'กำลังโหลดแท็ก...'
                : allTags.length === 0
                  ? 'ยังไม่มีแท็กที่เคยใช้ — พิมพ์ชื่อแท็กแล้วกด + เพื่อสร้างใหม่'
                  : 'แท็กที่มีถูกใช้กับแชทนี้ครบแล้ว — พิมพ์เพื่อสร้างแท็กใหม่'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
