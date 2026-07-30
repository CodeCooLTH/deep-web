'use client'

/**
 * PagePicker — ปุ่มเลือกเพจของแผงทดลองคุย (feat 00023)
 *
 * user 2026-07-29: เดิมแผงนี้มีทั้ง "การ์ดโชว์เพจ" และ "ChoiceSelect" ซ้อนกัน = ตัวเลือก 2 จุด
 * ที่ทำงานเรื่องเดียวกัน แถว ChoiceSelect มีแต่ชื่อเพจล้วน ๆ ร้านที่เชื่อมทั้ง Facebook และ
 * Instagram ใช้ชื่อเพจเดียวกัน จึงแยกไม่ออกว่ากำลังเลือกช่องทางไหน (ภาพหน้าจอ user)
 * รวมเหลือปุ่มเดียว แถวละ: โลโก้เพจ + ชื่อเพจ + ช่องทาง (Messenger/Instagram) ใต้ชื่อ
 *
 * Base (กลไก open/close/click-outside/Escape + โครงแถว avatar+ชื่อ+ช่องทาง + check icon ซ้าย):
 *   src/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown.tsx
 *   — ตัวเดียวกับที่ user ชี้ว่า "เลือก page จากหน้า chat ยังอ่านรู้เรื่องกว่า"
 *   ต่างกันแค่ trigger: ที่ inbox เป็น chip ตัวกรอง (btn-sm) แต่ที่นี่เป็นช่องเต็มความกว้าง
 *   ของแผงด้านขวา จึงยืมโครงแถวใน popover มาใช้เป็นหน้าตาของ trigger ด้วย
 *
 * ห้ามใช้ Preline hs-dropdown — parent (SimulatePanel) re-render ทุกครั้งที่พิมพ์ทดสอบ
 * แล้ว inline-state ของ Preline ค้าง (บทเรียนเดิมของโปรเจกต์ ดู FilterDropdown.tsx)
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'

export type PageOption = { id: string; name: string; provider: string; avatarUrl?: string | null }

/** โลโก้เพจ — รูปจริง + fallback ตัวอักษรแรกเมื่อไม่มีรูป/โหลดพัง (Base: PageFilterDropdown.PageAvatar) */
function PageAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!avatarUrl || failed) {
    return (
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="bg-default-100 size-9 shrink-0 rounded-full object-cover"
    />
  )
}

/** ชื่อเพจ + ช่องทางใต้ชื่อ — โครงเดียวกับแถวใน PageFilterDropdown */
function PageIdentity({ page }: { page: PageOption }) {
  const display = getChannelDisplay(page.provider)
  return (
    <span className="min-w-0 flex-1 text-start">
      <span className="text-default-900 block truncate text-sm font-medium">{page.name}</span>
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
  )
}

type Props = {
  options: PageOption[]
  value: string
  onChange: (value: string) => void
}

export default function PagePicker({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const selected = options.find((o) => o.id === value) ?? options[0]
  if (!selected) return null

  // เชื่อมเพจเดียว = ไม่มีอะไรให้เลือก แสดงเป็นป้ายบอกว่ากำลังคุยกับเพจไหนเฉย ๆ (ไม่ต้องกดได้)
  const single = options.length < 2

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup={single ? undefined : 'menu'}
        aria-expanded={single ? undefined : open}
        aria-label="เพจที่ทดลองคุย"
        disabled={single}
        onClick={() => setOpen((v) => !v)}
        className="border-default-200 hover:bg-light/40 flex w-full items-center gap-2 rounded-lg border p-2 text-start disabled:pointer-events-none"
      >
        <PageAvatar avatarUrl={selected.avatarUrl} name={selected.name} />
        <PageIdentity page={selected} />
        {!single && (
          <Icon
            icon="chevron-down"
            className={`text-default-400 size-4 flex-none transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && !single && (
        <div
          role="menu"
          aria-label="เลือกเพจ"
          className="bg-card border-default-300 absolute inset-x-0 top-full z-30 mt-1 max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-2 shadow-lg"
        >
          {options.map((o) => {
            const active = o.id === selected.id
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
                className={`dropdown-item w-full text-start ${active ? 'active' : ''}`}
              >
                {active ? (
                  <Icon icon="check" className="text-primary size-4 shrink-0" />
                ) : (
                  <span className="size-4 shrink-0" aria-hidden="true" />
                )}
                <PageAvatar avatarUrl={o.avatarUrl} name={o.name} />
                <PageIdentity page={o} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
