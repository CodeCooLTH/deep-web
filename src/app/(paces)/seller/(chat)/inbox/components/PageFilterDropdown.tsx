'use client'

/**
 * PageFilterDropdown — ตัวกรอง "เพจ" แบบช่องค้นหา + radio list + avatar (feat 00018 งาน 2)
 *
 * Reference (Hard Rule 6 — เอา IA/โครงเท่านั้น ห้ามลอกสี): ภาพ Meta app-selector ที่ user ส่งมา
 * (dropdown เปิดแล้วมีช่องค้นหาด้านบน + รายการเลือกได้ทีละแถว แต่ละแถว avatar/โลโก้ + ชื่อ + บรรทัด
 * รองเป็น ID) — skin/สี/component ทั้งหมดยึด Paces token เดิม (`.dropdown-item`, `bg-card`,
 * `border-default-300`, `text-primary`) ไม่แตะสี Meta เลย ดู
 * docs/superpowers/specs/2026-07-22-facebook-chat-ui-design.md §งาน 2 (ภาคผนวก คำสั่งเพิ่มวันนี้)
 *
 * Base (กลไก open/close/click-outside/Escape — ห้ามใช้ Preline hs-dropdown เพราะ parent
 * (InboxList) re-render บ่อยจาก fetch/filter → Preline inline-state พัง เหมือนบทเรียนเดิมของ
 * โปรเจกต์): src/components/safepay/FilterDropdown.tsx (คัดลอก state/click-outside/Escape hook
 * มาทั้งชุด) ไม่ต่อยอด FilterDropdown ตรง ๆ เพราะ component นั้นใช้ทั่วระบบ (orders/products/ฯลฯ)
 * ด้วย option แบบบรรทัดเดียว — เพิ่ม prop avatar/search เข้าไปจะกระทบทุกจุดที่เรียกโดยไม่จำเป็น
 * จึงแยกเป็น component เฉพาะทาง colocate กับ inbox (พึ่ง ChannelBadge อยู่แล้ว)
 *
 * Base (แถว `.dropdown-item` + check-icon แทน radio dot ที่เป็นภาพ reference): ใช้ pattern เดิมของ
 * FilterDropdown.tsx (check icon ซ้ายเมื่อ active / spacer เมื่อไม่ active) แทนวาด radio circle เอง
 * — Paces ไม่มี "radio list" component ตรง และ pattern นี้มี precedent ในโปรเจกต์แล้ว (Hard Rule 7)
 *
 * Base (ช่องค้นหา `input-icon-group`): theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:19-24
 * Base (avatar http-src + fallback ตัวอักษรแรก): InboxList.tsx `BuyerAvatar` (ไฟล์เดียวกัน pattern
 * เดียวกัน — เพจไม่มีรูปต้อง fallback ตัวอักษรแรกเหมือนคู่สนทนา ตามที่สั่ง)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { getChannelDisplay } from './ChannelBadge'
import type { ChannelFilterOption } from './ChannelBadge'

type Props = {
  /** shopChannelId ที่เลือกอยู่ — '' = "ทุกเพจ" (ค่า default ตั้งแต่แรก) */
  value: string
  options: ChannelFilterOption[]
  onChange: (value: string) => void
}

/** avatar เพจ — รูปจริง (ShopChannel.avatarUrl) + fallback ตัวอักษรแรกของชื่อเพจเมื่อไม่มีรูป/โหลดพัง */
function PageAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!avatarUrl || failed) {
    return (
      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-8 shrink-0 rounded-full bg-default-100 object-cover"
    />
  )
}

export default function PageFilterDropdown({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // click-outside + Escape — คัดลอกกลไกจาก FilterDropdown.tsx ตรง ๆ (ดู comment หัวไฟล์)
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // ปิดเมนู → เคลียร์คำค้นหา กันเปิดใหม่ครั้งถัดไปแล้วเจอผลกรองเก่าค้าง
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, search])

  const selected = options.find((o) => o.id === value)
  const isActive = value !== ''
  const triggerLabel = isActive ? (selected?.name ?? 'เพจ') : 'ทุกเพจ'

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        className={`btn btn-sm text-nowrap ${
          isActive ? 'bg-primary/15 text-primary hover:bg-primary hover:text-white' : 'bg-light text-dark'
        }`}
      >
        <Icon icon="filter" className="text-base" />
        {triggerLabel}
        <Icon icon="chevron-down" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="เลือกเพจ"
          className="bg-card border-default-300 absolute start-0 top-full z-30 mt-1 w-72 rounded border p-2 shadow-lg"
        >
          {/* ช่องค้นหา — Base ContactList.tsx:19-24, กรอง client-side (ไม่ยิง API) */}
          <div className="input-icon-group mb-2">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเพจ"
              className="form-input bg-light/30"
            />
          </div>

          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {/* "ทุกเพจ" — ค่า default ปักไว้บนสุดเสมอ ไม่ผ่านตัวกรองค้นหา (ไม่ใช่ชื่อเพจจริง) */}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === ''}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={`dropdown-item w-full text-start ${value === '' ? 'active' : ''}`}
            >
              {value === '' ? (
                <Icon icon="check" className="text-primary size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="bg-default-100 text-default-500 flex size-8 shrink-0 items-center justify-center rounded-full">
                <Icon icon="message-circle" width={16} height={16} />
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="text-default-900 block truncate text-sm font-medium">ทุกเพจ</span>
                <span className="text-default-400 block truncate text-xs">รวมทุกช่องทางที่เชื่อมไว้</span>
              </span>
            </button>

            {filtered.length === 0 ? (
              <p className="text-default-400 px-3 py-4 text-center text-xs">ไม่พบเพจที่ค้นหา</p>
            ) : (
              filtered.map((c) => {
                const display = getChannelDisplay(c.provider)
                const active = value === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onChange(c.id)
                      setOpen(false)
                    }}
                    className={`dropdown-item w-full text-start ${active ? 'active' : ''}`}
                  >
                    {active ? (
                      <Icon icon="check" className="text-primary size-4 shrink-0" />
                    ) : (
                      <span className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    <PageAvatar avatarUrl={c.avatarUrl} name={c.name} />
                    <span className="min-w-0 flex-1 text-start">
                      <span className="text-default-900 block truncate text-sm font-medium">{c.name}</span>
                      <span className="text-default-400 flex items-center gap-1 truncate text-xs">
                        <Icon
                          icon={display.icon}
                          width={12}
                          height={12}
                          className={display.iconClassName}
                          style={display.iconStyle}
                        />
                        {display.label}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
