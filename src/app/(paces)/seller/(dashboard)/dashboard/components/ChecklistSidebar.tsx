'use client'

/**
 * ChecklistSidebar — แสดง progress checklist "ตั้งค่าร้านค้าให้ครบ" ใน dashboard sidebar
 * feature 00001; Trace: SRS TFR-014 / BRD FR-LO-12/13
 *
 * Base (card bordered):
 *   theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 *   (CardWithColoredBorder — <div className="card border-primary border">)
 *
 * Base (list item w/ button):
 *   theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx
 *   (LinksAndButtons — <button type="button" className="hover:bg-default-100 flex w-full items-center gap-1.5 px-4.75 py-3">)
 *
 * ทำไม return null เมื่อ isComplete: ไม่ต้องการ clutter sidebar หลังผู้ขายตั้งค่าครบ (spec OQ-2)
 * ทำไม skeleton แทน spinner: skeleton ป้องกัน layout shift ใน sidebar (รู้ความสูงล่วงหน้า)
 * ทำไม slug key ไม่ clickable: slug immutable หลัง onboarding (BR-18 — เปลี่ยนไม่ได้)
 */

import Icon from '@/components/wrappers/Icon'
import { useEffect, useState } from 'react'

// ─── types ────────────────────────────────────────────────────────────────────

import type { ModalStep } from './OnboardingModal'

interface ChecklistSidebarProps {
  onOpenModal: (initialStep: ModalStep) => void
  /** parent เปลี่ยนค่าเพื่อ trigger refetch หลัง modal ปิด */
  refreshKey?: number
}

// ─── checklist item type (mirror ของ API response) ───────────────────────────

type ChecklistItemKey =
  | 'slug'
  | 'sales_channels'
  | 'categories'
  | 'address'
  | 'map_pin'
  | 'first_product'

interface ChecklistItem {
  key: ChecklistItemKey
  label: string
  done: boolean
}

interface ChecklistResponse {
  items: ChecklistItem[]
  isComplete: boolean
}

// ─── key → ModalStep mapping ──────────────────────────────────────────────────

/**
 * แมป ChecklistItemKey → ModalStep ที่จะเปิด
 * slug = done เสมอ (BR-18 immutable) ไม่มีใน map
 * map_pin รวมกับ address (เปิด step เดียวกัน)
 */
const KEY_TO_STEP: Partial<Record<ChecklistItemKey, ModalStep>> = {
  sales_channels: 'sales_channels',
  categories: 'categories',
  address: 'address',
  map_pin: 'address',
  first_product: 'first_product',
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ChecklistSidebar({ onOpenModal, refreshKey }: ChecklistSidebarProps) {
  const [data, setData] = useState<ChecklistResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchChecklist() {
      setLoading(true)
      try {
        const res = await fetch('/api/account/onboarding-checklist')
        if (!res.ok) {
          if (!cancelled) setData(null)
          return
        }
        const json: ChecklistResponse = await res.json()
        if (!cancelled) setData(json)
      } catch {
        // degrade gracefully — ซ่อน sidebar ถ้า fetch error
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchChecklist()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // ─── loading state → skeleton ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-pulse bg-default-100 h-48 rounded" aria-busy="true" aria-label="กำลังโหลด checklist" />
    )
  }

  // ─── error / complete → ซ่อน ─────────────────────────────────────────────

  if (!data || data.isComplete) return null

  const pendingCount = data.items.filter((i) => !i.done).length
  const total = data.items.length

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="card border-primary/30 border">
      {/* card-header: icon + title + badge นับ pending */}
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Icon icon="clipboard-check" className="size-4.5 text-primary" />
          <h4 className="card-title text-sm">ตั้งค่าร้านค้าให้ครบ</h4>
        </div>
        <span className="badge bg-primary/15 text-primary rounded-full ms-auto">
          {pendingCount}/{total}
        </span>
      </div>

      {/* card-body p-0: list divide */}
      <div className="card-body p-0">
        <div className="divide-y divide-default-200">
          {data.items.map((item) => {
            const step = KEY_TO_STEP[item.key]

            if (item.done) {
              // done — ไม่ clickable, muted + strikethrough
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-4 py-3 text-default-400"
                >
                  <Icon icon="circle-check-filled" className="size-4.5 text-success shrink-0" />
                  <span className="line-through text-sm">{item.label}</span>
                </div>
              )
            }

            // slug key — done เสมอตาม BR-18 แต่ป้องกัน edge case ถ้า API คืน pending
            if (item.key === 'slug' || !step) {
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-4 py-3 text-default-400"
                >
                  <Icon icon="circle" className="size-4.5 text-default-400 shrink-0" />
                  <span className="text-sm">{item.label}</span>
                </div>
              )
            }

            // pending + มี step → clickable button (tap target ≥44px ด้วย py-3)
            return (
              <button
                key={item.key}
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 hover:bg-default-100 focus:bg-default-100 transition-colors"
                onClick={() => onOpenModal(step)}
              >
                <Icon icon="circle" className="size-4.5 text-default-400 shrink-0" />
                <span className="text-sm text-start">{item.label}</span>
                <Icon icon="chevron-right" className="size-4 text-default-400 ms-auto shrink-0" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
