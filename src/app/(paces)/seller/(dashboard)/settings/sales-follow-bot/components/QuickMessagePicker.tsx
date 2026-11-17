'use client'

/**
 * QuickMessagePicker — แผงเลือก "ข้อความสำเร็จรูป" ของร้าน (ท่าเดียวกับตัวเลือกในช่องพิมพ์แชท: ช่องค้นหา + การ์ดกริด) — 00095 S-7
 * ข้อมูลมาจาก options.quickMessages (id/ชื่อ/ตัวอย่างข้อความ/รูปย่อ) · เลือกแล้วเก็บแค่ id (service เติมเนื้อหา ณ ตอนส่ง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx (input-icon-group ค้นหา)
 *   + src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/QuickMessageBar.tsx (ค้นหา + การ์ดเลือก)
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import type { QuickMessageLite } from '@/lib/sales-follow-bot/ui'

export default function QuickMessagePicker({
  items,
  selectedId,
  onPick,
  onClose,
}: {
  items: readonly QuickMessageLite[]
  selectedId: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const t = useT().salesFollowBot
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => searchRef.current?.focus(), [])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? items.filter((i) => i.title.toLowerCase().includes(term) || i.bodyPreview.toLowerCase().includes(term)) : items
  }, [items, q])

  return (
    <div
      role="dialog"
      aria-label={t.quickChoose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className="border-default-300 bg-card mt-2 overflow-hidden rounded-lg border shadow-lg"
    >
      <div className="border-default-300 flex items-center justify-between gap-2 border-b border-dashed py-1.5 ps-3.5 pe-2">
        <span className="text-primary-ink flex items-center gap-2 text-sm font-semibold">
          <Icon icon="bolt" aria-hidden="true" />
          {t.quickPickTitle}
        </span>
        <button type="button" onClick={onClose} aria-label={t.close} className="btn btn-icon text-default-700 hover:bg-default-100 size-11 lg:size-9">
          <Icon icon="x" className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="border-default-300 border-b px-3.5 py-2.5">
        <div className="input-icon-group">
          <Icon icon="search" className="input-icon" aria-hidden="true" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} type="text" className="form-input" placeholder={t.quickSearch} aria-label={t.quickSearch} />
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-default-700 px-3.5 py-6 text-center text-sm">{t.quickEmpty}</p>
      ) : shown.length === 0 ? (
        <p className="text-default-700 px-3.5 py-6 text-center text-sm">{t.quickNoMatch}</p>
      ) : (
        <ul role="listbox" aria-label={t.quickPickTitle} className="grid max-h-80 grid-cols-2 gap-2.5 overflow-auto px-3.5 py-3 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((i) => {
            const selected = i.id === selectedId
            return (
              <li key={i.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onPick(i.id)}
                  className={`bg-card flex min-h-11 w-full min-w-0 flex-col overflow-hidden rounded-xl border text-start ${selected ? 'border-primary ring-primary ring-1' : 'border-default-200 hover:border-primary/40'}`}
                >
                  {i.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.thumbUrl} alt="" loading="lazy" className="bg-default-200 h-20 w-full object-cover" />
                  ) : (
                    <span className="bg-light text-default-700 text-2xs line-clamp-3 flex h-20 items-center p-2">{i.bodyPreview}</span>
                  )}
                  <span className="block p-2">
                    <span className="text-dark line-clamp-2 block text-xs font-medium">{i.title}</span>
                    <span className="text-default-700 text-2xs mt-0.5 line-clamp-2 block">{i.bodyPreview}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
