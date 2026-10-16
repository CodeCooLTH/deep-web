'use client'

/**
 * DeskFilters — ปุ่ม "ตัวกรอง" + popover ชิป 3 กลุ่ม (แพลตฟอร์ม · เพจ · แอดมิน) แบบร่าง → "ใช้ตัวกรอง"
 *
 * Base: src/app/(paces)/seller/(chat)/inbox/components/InboxFilterPanel.tsx (popover ชิป + ร่างก่อนกดใช้ + click-outside/Escape)
 *   ← ซึ่ง Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 * ไม่ใช้ hs-dropdown (หน้า re-render ทุก 8 วินาที) · popover เป็นลูกของ element ที่เรียก จึงอยู่ใน fullscreen ได้ (ไม่ portal ไป body)
 * กลุ่มเพจ/แอดมินซ่อนเมื่อร้านมีน้อยกว่า 2 ตัวเลือก · เลือกชิปยังไม่มีผลจนกดใช้ (กันยิง query ทีละชิป)
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'
import { ChannelGlyph } from './desk-ui'
import { CHANNEL_LABEL } from '@/lib/chat-desk/channel-colors'
import { PLATFORMS } from '@/lib/chat-desk/constants'
import { EMPTY_FILTERS } from '@/lib/chat-desk/filters'
import { countActiveFilterGroups } from '@/lib/chat-desk/page-model'
import type { DeskChannel, DeskFilters as Filters, DeskMember } from '@/lib/chat-desk/types'

export type DeskFiltersProps = {
  value: Filters
  channels: DeskChannel[]
  members: DeskMember[]
  onApply: (next: Filters) => void
  /** icon = ปุ่มไอคอนในแถบเครื่องมือ · button = ปุ่มข้อความ (หัวหน้า/มือถือ) */
  variant: 'icon' | 'button'
}

function Chip({ on, label, leading, onClick }: { on: boolean; label: string; leading?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
        on ? 'border-primary/35 bg-primary/15 text-primary-ink' : 'border-default-300 bg-light text-default-700 hover:bg-default-300'
      }`}
    >
      {leading}
      <span className="truncate">{label}</span>
    </button>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-default-700 mb-1.5 text-xs font-semibold">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

const toggle = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

export default function DeskFilters({ value, channels, members, onApply, variant }: DeskFiltersProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Filters>(value)
  const ref = useRef<HTMLDivElement>(null)
  const popId = useId()
  const count = countActiveFilterGroups(value)
  const chatters = members.filter((m) => m.canChat)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const badge =
    count > 0 ? (
      <span className="bg-primary min-w-4 rounded-full px-1 text-center text-xs leading-4 font-semibold text-white">
        {count}
      </span>
    ) : null

  return (
    <div className="relative inline-flex" ref={ref}>
      {variant === 'icon' ? (
        <button
          type="button"
          aria-label="ตัวกรอง"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => { if (!open) setDraft(value); setOpen(!open) }}
          className="btn btn-icon text-default-900 hover:bg-light relative rounded-none bg-transparent"
        >
          <Icon icon="filter" className="text-lg" aria-hidden="true" />
          {badge && <span className="absolute end-0.5 top-0.5">{badge}</span>}
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => { if (!open) setDraft(value); setOpen(!open) }}
          className="bg-card text-default-900 inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium shadow-sm"
        >
          <Icon icon="filter" className="text-base" aria-hidden="true" />
          ตัวกรอง
          {badge}
        </button>
      )}

      {open && (
        <div id={popId} role="dialog" aria-label="ตัวกรอง" className="card absolute end-0 top-full z-30 mt-2 w-72 p-4 sm:w-80">
          <div className="mb-3 flex items-center justify-between">
            <span className="card-title">ตัวกรอง</span>
            <button type="button" aria-label="ปิดตัวกรอง" onClick={() => setOpen(false)} className="text-default-400 hover:text-default-900">
              <Icon icon="x" className="text-lg" aria-hidden="true" />
            </button>
          </div>
          <Group title="แพลตฟอร์ม">
            {PLATFORMS.map((p) => (
              <Chip key={p} on={draft.platforms.includes(p)} label={CHANNEL_LABEL[p]} leading={<ChannelGlyph platform={p} />} onClick={() => setDraft({ ...draft, platforms: toggle(draft.platforms, p) })} />
            ))}
          </Group>
          {channels.length >= 2 && (
            <Group title="เพจ">
              {channels.map((c) => (
                <Chip key={c.id} on={draft.pages.includes(c.id)} label={c.name} onClick={() => setDraft({ ...draft, pages: toggle(draft.pages, c.id) })} />
              ))}
            </Group>
          )}
          {chatters.length >= 2 && (
            <Group title="แอดมิน">
              {chatters.map((m) => (
                <Chip key={m.userId} on={draft.admins.includes(m.userId)} label={m.name} onClick={() => setDraft({ ...draft, admins: toggle(draft.admins, m.userId) })} />
              ))}
            </Group>
          )}
          <div className="border-default-300 mt-3 flex gap-2 border-t border-dashed pt-3">
            <button type="button" onClick={() => { onApply(EMPTY_FILTERS); setOpen(false) }} className="bg-light text-default-900 hover:bg-default-300 h-9 flex-1 rounded-md text-sm font-medium">
              ล้างตัวกรอง
            </button>
            <button type="button" onClick={() => { onApply(draft); setOpen(false) }} className="bg-primary hover:bg-primary-hover h-9 flex-1 rounded-md text-sm font-medium text-white">
              ใช้ตัวกรอง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
