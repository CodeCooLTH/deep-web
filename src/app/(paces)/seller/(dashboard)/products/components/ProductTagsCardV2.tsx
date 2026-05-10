'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   (อ้างอิง pill style จาก "Checkbox Toggle" + "Radio Toggle" — ใช้ border-primary
//   text-primary peer-checked:bg-primary peer-checked:text-white แล้ว adapt เป็น
//   bg-primary/10 light pill ตาม spec; layout wrapper ใช้แบบเดียวกับ
//   ProductAttributesCardV2.tsx — px-3 py-2.5 borderless compact, mobile + desktop visible)
import { Icon } from '@iconify/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'

interface ProductTagsCardV2Props {
  value: string[]
  onChange: (next: string[]) => void
  maxTags?: number
  error?: string
}

interface TagSuggestion {
  id: string
  name: string
  slug: string
}

const MAX_TAG_LEN = 50
const DEBOUNCE_MS = 200
const SUGGESTION_LIMIT = 8

export default function ProductTagsCardV2({
  value,
  onChange,
  maxTags = 10,
  error,
}: ProductTagsCardV2Props) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = 'tags-listbox'

  // cleanup ตอน unmount — กัน fetch race + leak timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const isFull = value.length >= maxTags

  const existingLower = value.map((v) => v.toLowerCase())

  // กรอง suggestion ที่อยู่ใน value แล้ว + จำกัด 8 รายการ
  const visibleSuggestions = suggestions
    .filter((s) => !existingLower.includes(s.name.toLowerCase()))
    .slice(0, SUGGESTION_LIMIT)

  const fetchSuggestions = (q: string) => {
    // ยกเลิก request ก่อนหน้า — กัน race ระหว่างพิมพ์เร็ว
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const url = q.trim().length > 0 ? `/api/tags?q=${encodeURIComponent(q)}` : '/api/tags'

    fetch(url, { credentials: 'include', signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<TagSuggestion[]>
      })
      .then((data) => {
        if (ctrl.signal.aborted) return
        setSuggestions(Array.isArray(data) ? data : [])
        setActiveIdx(-1)
      })
      .catch((err) => {
        // AbortError = ปกติ ไม่ต้อง log; error อื่น = silent (ไม่ควรขัด UX)
        if (err?.name !== 'AbortError') {
          setSuggestions([])
        }
      })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // truncate ถ้าเกิน 50 ตัวอักษร — silent ตามที่ spec บอกว่าจะ truncate ก็ได้
    const next = raw.length > MAX_TAG_LEN ? raw.slice(0, MAX_TAG_LEN) : raw
    setInput(next)
    setIsOpen(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(next)
    }, DEBOUNCE_MS)
  }

  const commitTag = (rawTag: string) => {
    const trimmed = rawTag.trim()
    if (!trimmed) return // empty trim guard
    if (trimmed.length > MAX_TAG_LEN) {
      toast.error(`แท็กยาวได้ไม่เกิน ${MAX_TAG_LEN} ตัวอักษร`)
      return
    }
    if (isFull) {
      toast.error(`เพิ่มได้สูงสุด ${maxTags} แท็ก`)
      return
    }
    // dedupe case-insensitive
    if (existingLower.includes(trimmed.toLowerCase())) {
      setInput('')
      return
    }
    onChange([...value, trimmed])
    setInput('')
    setSuggestions([])
    setActiveIdx(-1)
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // ถ้ามี suggestion active ใช้ suggestion นั้น; ไม่งั้น commit input ปัจจุบัน
      if (activeIdx >= 0 && activeIdx < visibleSuggestions.length) {
        commitTag(visibleSuggestions[activeIdx].name)
      } else {
        commitTag(input)
      }
      return
    }
    if (e.key === 'Tab' && visibleSuggestions.length > 0 && input.trim().length > 0) {
      // Tab = ใช้ suggestion ตัวแรก (หรือ active) แล้วป้องกัน blur
      e.preventDefault()
      const pick = activeIdx >= 0 ? visibleSuggestions[activeIdx] : visibleSuggestions[0]
      commitTag(pick.name)
      return
    }
    if (e.key === 'Backspace' && input.length === 0 && value.length > 0) {
      e.preventDefault()
      onChange(value.slice(0, -1))
      return
    }
    if (e.key === 'ArrowDown') {
      if (visibleSuggestions.length === 0) return
      e.preventDefault()
      setIsOpen(true)
      setActiveIdx((idx) => (idx + 1 >= visibleSuggestions.length ? 0 : idx + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      if (visibleSuggestions.length === 0) return
      e.preventDefault()
      setActiveIdx((idx) => (idx <= 0 ? visibleSuggestions.length - 1 : idx - 1))
      return
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIdx(-1)
      return
    }
  }

  const handleFocus = () => {
    if (isFull) return
    setIsOpen(true)
    // โหลด top 20 (จะแสดง 8 ตัวแรกหลัง filter) ตอน focus
    if (suggestions.length === 0) {
      fetchSuggestions('')
    }
  }

  const handleBlur = () => {
    // delay เพื่อให้ click บน suggestion item ทำงานก่อน
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    blurTimerRef.current = setTimeout(() => {
      setIsOpen(false)
      setActiveIdx(-1)
    }, 150)
  }

  const handleSuggestionClick = (s: TagSuggestion) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    commitTag(s.name)
    inputRef.current?.focus()
  }

  const showDropdown = isOpen && visibleSuggestions.length > 0

  return (
    <div className="px-3 py-2.5">
      <div className="text-xs text-default-400 mb-2">แท็ก (เช่น วินเทจ, ขนมไทย)</div>

      <div className="relative">
        <div className="flex flex-wrap gap-1.5 items-center min-h-9 border border-default-200 rounded-md px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/20">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded px-2 py-0.5"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-danger inline-flex items-center"
                aria-label={`ลบแท็ก ${tag}`}
              >
                <Icon icon="tabler:x" className="size-3.5" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? 'พิมพ์แท็กแล้วกด Enter' : ''}
            disabled={isFull}
            maxLength={MAX_TAG_LEN}
            aria-label="เพิ่มแท็ก"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="flex-1 min-w-32 outline-none border-0 text-sm py-0.5 bg-transparent disabled:cursor-not-allowed"
          />
        </div>

        {showDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 w-full bg-card border border-default-200 rounded-md shadow-md max-h-60 overflow-auto"
          >
            {visibleSuggestions.map((s, idx) => (
              <li
                key={s.id}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseDown={(e) => {
                  // mousedown แทน click — กัน blur ของ input ทำงานก่อน
                  e.preventDefault()
                  handleSuggestionClick(s)
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  idx === activeIdx ? 'bg-default-100' : 'hover:bg-default-50'
                }`}
              >
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-xs text-default-300 mt-1">
        {value.length} / {maxTags} แท็ก
      </div>

      {error && <p className="text-danger text-xs mt-1">{error}</p>}
    </div>
  )
}
