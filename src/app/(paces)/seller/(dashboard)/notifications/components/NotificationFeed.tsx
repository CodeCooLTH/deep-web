'use client'

/**
 * NotificationFeed — T8 (seller-command-center-v10, S-9)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 *       (group header pattern: text-xs font-bold text-default-400 + dashed connector node)
 *       theme/paces/Admin/TS/src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx
 *       (unread tint concept)
 *
 * สิ่งที่เพิ่มจาก theme:
 *  - lazy-load ด้วย IntersectionObserver (copy pattern จาก NotificationTimeline.tsx)
 *  - unread heuristic: item ที่อยู่กลุ่ม "วันนี้" = unread (UI-only — ActivityItem ไม่มี read flag; persist = Phase 2 OOS-2)
 *  - "อ่านทั้งหมด" local-state only (dot หาย; persist = Phase 2 OOS-2)
 *  - empty state
 *  - icon Solar Duotone ตาม type (ห้าม Tabler — spec §3 + §5)
 *  - item.href → ครอบ Link (next/link) ตาม Hard Rule 2 (wrapper ไม่ใช่ component={Link})
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import type { ActivityItem } from '@/services/activity.service'
import { formatDate, formatDateTime } from '@/lib/format-date'

// ──────────────────────────────────────────────────────────────────────────────
// ค่าคงที่ lazy-load
// ──────────────────────────────────────────────────────────────────────────────
const INITIAL_COUNT = 8   // เริ่มต้น 8 รายการ (spec S-9)
const LOAD_MORE = 6       // เพิ่มทีละ 6 รายการ (spec S-9)

// ──────────────────────────────────────────────────────────────────────────────
// icon + color map — Tailwind v4 purge-safe: full class string เท่านั้น
// ห้ามสร้าง dynamic string เช่น `text-${color}` (purge จะตัดทิ้ง)
// ──────────────────────────────────────────────────────────────────────────────
const ICON_MAP: Record<ActivityItem['type'], string> = {
  ORDER_CREATED:    'solar:bag-check-bold-duotone',
  ORDER_CONFIRMED:  'solar:check-circle-bold-duotone',
  SMS_SENT:         'solar:letter-bold-duotone',
  REVIEW_RECEIVED:  'solar:star-bold-duotone',
  TOPUP:            'solar:wallet-bold-duotone',
  // S-6/S-14 (00009 Deep Stock Pro) — low-stock alert (PRO only), สี/icon สื่อ "เตือน"
  LOW_STOCK_ALERT:  'solar:danger-triangle-bold-duotone',
}

const ICON_COLOR_MAP: Record<ActivityItem['type'], string> = {
  ORDER_CREATED:    'text-primary',
  ORDER_CONFIRMED:  'text-success',
  SMS_SENT:         'text-info',
  REVIEW_RECEIVED:  'text-warning',
  TOPUP:            'text-success',
  LOW_STOCK_ALERT:  'text-danger',
}

// ──────────────────────────────────────────────────────────────────────────────
// helper — จัดกลุ่มวัน (เทียบ item.at กับ today midnight ใน timezone ไทย)
// ──────────────────────────────────────────────────────────────────────────────
type Group = 'today' | 'yesterday' | 'older'

// จัดกลุ่มวันโดยเทียบ "วันที่ Bangkok" ผ่าน formatDate (sanctioned lib)
// — ไม่ใช้ Intl date API ตรงในไฟล์นี้ ตาม date-format.md grep gate (lib handle TZ ไทยให้แล้ว)

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────
type Props = {
  items: ActivityItem[]
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export default function NotificationFeed({ items }: Props) {
  const [showCount, setShowCount] = useState(INITIAL_COUNT)
  // "อ่านทั้งหมด" — local state ซ่อน dot; persist = Phase 2 OOS-2
  const [allRead, setAllRead] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // visible slice
  const visible = items.slice(0, showCount)
  const hasMore = showCount < items.length

  // ──────────────────────────────────────────────────────────────────────────
  // IntersectionObserver — copy pattern จาก NotificationTimeline.tsx
  // re-attach เมื่อ visible.length เปลี่ยน (sentinel ย้าย)
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShowCount((prev) => prev + LOAD_MORE)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, visible.length])

  // ──────────────────────────────────────────────────────────────────────────
  // จัดกลุ่ม visible items
  // ──────────────────────────────────────────────────────────────────────────
  const groupedItems = useMemo(() => {
    // เทียบวันด้วย formatDate ("2569-06-07" Bangkok TZ) — ไม่ใช้ Intl ในไฟล์นี้ (date-format.md)
    const todayStr = formatDate(new Date())
    const yesterdayStr = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000))

    const today: ActivityItem[] = []
    const yesterday: ActivityItem[] = []
    const older: ActivityItem[] = []

    for (const item of visible) {
      const k = formatDate(item.at)
      if (k === todayStr) today.push(item)
      else if (k === yesterdayStr) yesterday.push(item)
      else older.push(item)
    }

    return { today, yesterday, older }
  }, [visible])

  // ──────────────────────────────────────────────────────────────────────────
  // Empty state
  // ──────────────────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-default-400">
        <Icon icon="solar:bell-off-bold-duotone" className="text-5xl text-default-300" />
        <p className="text-sm">ยังไม่มีการแจ้งเตือน</p>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  const sections: { label: string; key: Group; items: ActivityItem[] }[] = [
    { label: 'วันนี้',     key: 'today',     items: groupedItems.today     },
    { label: 'เมื่อวานนี้', key: 'yesterday', items: groupedItems.yesterday },
    { label: 'ก่อนหน้า',   key: 'older',     items: groupedItems.older     },
  ]

  return (
    <div>
      {/* ── "อ่านทั้งหมด" header row ── */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-default-100">
        <button
          type="button"
          onClick={() => setAllRead(true)}
          className="flex min-h-11 items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80 lg:min-h-0"
          /* UI-only: persist = Phase 2 OOS-2 */
        >
          <Icon icon="solar:check-read-line-duotone" className="text-base" />
          อ่านทั้งหมด
        </button>
      </div>

      {/* ── Timeline body ── */}
      <div className="space-y-5 p-4">
        {sections.map(({ label, key, items: sectionItems }) => {
          if (sectionItems.length === 0) return null
          // unread heuristic: เฉพาะกลุ่ม "วันนี้" = unread (UI-only; ActivityItem ไม่มี read flag — Phase 2 OOS-2)
          const isUnreadGroup = key === 'today' && !allRead

          return (
            <div key={key}>
              {/* group header — copy pattern จาก CRM activities page.tsx (Base) */}
              <h6 className="text-xs font-bold mb-5 text-default-400">{label}</h6>

              {sectionItems.map((item, idx) => {
                const isLast = idx === sectionItems.length - 1
                const isUnreadItem = isUnreadGroup

                return (
                  <div
                    key={`${item.type}-${item.at.getTime()}-${idx}`}
                    className={[
                      'flex gap-x-5',
                      /* unread tint: bg-primary/5 — arbitrary opacity utility (HR7: Paces ไม่มี token สำหรับ tint ระดับนี้; ref spec §5 "rgba(primary,.055)"; ใช้ Tailwind /5 ≈ .05 แทน) */
                      isUnreadItem ? 'bg-primary/5 rounded-lg' : '',
                    ].join(' ')}
                  >
                    {/* ── dashed connector node — copy pattern จาก CRM activities/page.tsx (Base) ── */}
                    <div
                      className={[
                        'after:border-default-300 relative after:absolute after:start-1/2 after:top-7 after:bottom-0 after:w-px after:border-e -ms-px after:border-dashed',
                        isLast ? 'after:hidden' : '',
                      ].join(' ')}
                    >
                      <div className="relative z-10">
                        {/* icon: Solar Duotone flat (ไม่มี circle) ตาม spec §3 "Flat + borderless" */}
                        <div className="flex justify-center items-center size-7.5">
                          <Icon
                            icon={ICON_MAP[item.type]}
                            className={`text-2xl ${ICON_COLOR_MAP[item.type]}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── content area ── */}
                    <div className="grow pb-7.5 relative">
                      {/* unread dot — UI-only heuristic (ActivityItem ไม่มี read flag; persist = Phase 2 OOS-2) */}
                      {isUnreadItem && (
                        /* arbitrary: absolute position dot; Paces ไม่มี token สำหรับ indicator dot ขนาดนี้ */
                        <span className="absolute end-0 top-1 size-2 rounded-full bg-primary" aria-hidden />
                      )}

                      {/* label */}
                      <p className="mb-1 text-sm text-default-900 font-medium pr-4">
                        {item.label}
                      </p>

                      {/* เวลา — formatDateTime (ห้าม toLocale/date-fns ตาม convention) */}
                      <small className="text-xs text-default-500">
                        {formatDateTime(item.at)}
                      </small>

                      {/* ปุ่มดูรายละเอียด (ถ้ามี href) — ครอบ Link ไม่ใช่ component={Link} (Hard Rule 2) */}
                      {item.href && (
                        <div className="mt-2">
                          <Link
                            href={item.href}
                            className="btn btn-sm border-primary text-primary hover:bg-primary hover:text-white inline-flex items-center gap-1"
                          >
                            ดูรายละเอียด
                            <Icon icon="solar:arrow-right-linear" className="text-sm" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* ── Lazy-load sentinel + spinner — copy pattern จาก NotificationTimeline.tsx ── */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center gap-3 py-4">
            <div
              className="animate-spin size-5 border-2 border-primary border-t-transparent rounded-full"
              role="status"
              aria-label="กำลังโหลด"
            />
            <span className="text-sm text-default-500 font-medium">กำลังโหลด...</span>
          </div>
        )}
      </div>
    </div>
  )
}
