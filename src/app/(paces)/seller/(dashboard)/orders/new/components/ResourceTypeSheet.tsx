'use client'

/**
 * ResourceTypeSheet — ชีตเลือก "ประเภทงาน" เมื่อร้านมีเกิน RESOURCE_CARDS_MAX แบบ (user สั่ง 2026-10-31 · prototype v19)
 * แบบเดียวกับชีตเลือกผู้รับผิดชอบ: ช่องค้นชื่อ + รายการแถว · เลือกแล้วปิดทันที (ไม่ยิง API)
 *
 * Base: src/components/safepay/service-job/AssigneeSheet.tsx (เปลือกชีต + ช่องค้นแบบ pill)
 *   ← theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 */
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useSheetA11y } from '@/components/safepay/service-job/useSheetA11y'
import { matchesStaffQuery } from '@/lib/assignee-load'
import { cn } from '@/utils/helpers'

import type { ServiceResourceOption } from './AppointmentBlock'

interface Props {
  open: boolean
  onClose: () => void
  resources: readonly ServiceResourceOption[]
  currentId: string | null
  onSelect: (resource: ServiceResourceOption) => void
}

export default function ResourceTypeSheet({ open, onClose, resources, currentId, onSelect }: Props) {
  const [query, setQuery] = useState('')
  // ล้างคำค้นตอนปิด — เปิดใหม่เห็นทุกแบบ (ไม่ใช้ effect ตาม open: setState ใน effect = render ซ้อน)
  const close = () => {
    setQuery('')
    onClose()
  }
  const { panelRef, closeRef } = useSheetA11y(open, close)

  if (!open) return null

  // คัดด้วยกติกาเดียวกับค้นชื่อช่าง (ไม่สนตัวพิมพ์ · ช่องว่างหัวท้าย)
  const shown = resources.filter((r) => matchesStaffQuery(r.name, query))

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-type-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div ref={panelRef} className="card bg-card flex max-h-full w-full flex-col rounded-b-none sm:max-w-lg sm:rounded-lg">
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id="resource-type-sheet-title" className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="users" className="text-primary shrink-0 text-lg" aria-hidden="true" />
            <span className="truncate">เลือกประเภทงาน</span>
          </h5>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="border-default-200 border-b px-4 py-3">
          <div className="bg-light/40 border-default-200 flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border px-3">
            <Icon icon="solar:magnifer-linear" className="text-default-400 shrink-0 text-lg" aria-hidden="true" />
            <input
              type="search"
              placeholder="ค้นชื่อประเภทงาน"
              aria-label="ค้นชื่อประเภทงาน"
              autoComplete="off"
              className="text-default-900 placeholder:text-default-400 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out HR7: ชีตไม่มี footer — เนื้อชีตยึดขอบล่างจอจึงรับ safe-area เอง (เท่า AssigneeSheet) */}
          {shown.map((r) => {
            const on = r.id === currentId
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onSelect(r)
                  close()
                }}
                className={cn(
                  'flex min-h-13 w-full items-center gap-3 rounded-lg border px-3 py-2 text-start',
                  on ? 'border-primary bg-primary/5' : 'border-default-200 hover:border-default-300',
                )}
              >
                <Icon
                  icon={on ? 'circle-check-filled' : 'circle'}
                  className={cn('shrink-0 text-lg', on ? 'text-primary' : 'text-default-400')}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="text-dark block truncate text-sm font-medium">{r.name}</span>
                  <span className="text-default-700 block text-xs">รับพร้อมกัน {r.capacity} คิว</span>
                </span>
              </button>
            )
          })}
          {shown.length === 0 && (
            <p className="text-default-700 mb-0 pt-2 text-center text-sm">ไม่พบประเภทงานชื่อ &quot;{query.trim()}&quot;</p>
          )}
        </div>
      </div>
    </div>
  )
}
