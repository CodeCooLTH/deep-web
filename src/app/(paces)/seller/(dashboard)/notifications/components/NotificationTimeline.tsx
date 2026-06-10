'use client'

/**
 * NotificationTimeline — T10 rewrite
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 *       (timeline: date group header + dashed connector node + content area + spinner)
 *       ปรับตาม FRAME 2 ของ docs/mockups/home/command-center-v8.html (.np-* classes)
 *
 * เพิ่มจาก CRM source:
 *  - tab filter (type)
 *  - lazy-load ด้วย IntersectionObserver (เริ่ม 5 รายการ → เพิ่ม 3 ทุก scroll sentinel)
 *  - unread tint (bg-primary/5)
 *  - ตัด w-30 time column (mobile cramped) → time อยู่ใน meta row แทน
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import type { Notification, NotiColor, NotificationType } from './notification-data'

// ── color literal maps (Tailwind v4 purge-safe — ต้องเป็น full string ในไฟล์) ──
const NODE_COLOR_MAP: Record<NotiColor, string> = {
  primary: 'text-primary',
  success: 'text-success',
  info:    'text-info',
  warning: 'text-warning',
  default: 'text-default-400',
}

const BADGE_COLOR_MAP: Record<NotiColor, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  info:    'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
  default: 'bg-default-100 border border-default-300 text-default-400',
}

// ── แปล daysAgo → ป้ายหัวกลุ่ม ──
function dayLabel(daysAgo: number): string {
  if (daysAgo === 0) return 'วันนี้'
  if (daysAgo === 1) return 'เมื่อวานนี้'
  return `${daysAgo} วันก่อน`
}

// ── tab config ──
const TABS: { label: string; value: NotificationType | 'all' }[] = [
  { label: 'ทั้งหมด',   value: 'all' },
  { label: 'คำสั่งซื้อ', value: 'order' },
  { label: 'รีวิว',     value: 'review' },
  { label: 'การเงิน',   value: 'finance' },
  { label: 'ระบบ',      value: 'system' },
]

const INITIAL_COUNT = 5
const LOAD_MORE_COUNT = 3

type Props = {
  notifications: Notification[]
}

export default function NotificationTimeline({ notifications }: Props) {
  const [activeTab, setActiveTab] = useState<NotificationType | 'all'>('all')
  const [showCount, setShowCount] = useState(INITIAL_COUNT)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // กรอง + จำกัดตาม showCount
  const filtered = useMemo(
    () =>
      activeTab === 'all'
        ? notifications
        : notifications.filter((n) => n.type === activeTab),
    [notifications, activeTab],
  )

  const visible = filtered.slice(0, showCount)
  const hasMore = showCount < filtered.length

  // reset count เมื่อ tab เปลี่ยน
  const handleTabChange = (tab: NotificationType | 'all') => {
    setActiveTab(tab)
    setShowCount(INITIAL_COUNT)
  }

  // IntersectionObserver — load more เมื่อ sentinel ปรากฏ
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShowCount((prev) => prev + LOAD_MORE_COUNT)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, visible.length]) // re-attach เมื่อ visible เปลี่ยน (sentinel ย้าย)

  // group visible items ตาม daysAgo
  const groups = useMemo(() => {
    const map = new Map<number, Notification[]>()
    for (const n of visible) {
      const arr = map.get(n.daysAgo) ?? []
      arr.push(n)
      map.set(n.daysAgo, arr)
    }
    // เรียง daysAgo น้อย → มาก (วันนี้ก่อน)
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [visible])

  return (
    <div>
      {/* ── Tab bar ── */}
      <div className="flex gap-5 border-b border-default-200 overflow-x-auto px-4">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabChange(tab.value)}
            /* NF-4: touch target ≥44px — py-3 = 12px top+bottom + font ≈ 44px */
            className={[
              'py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === tab.value
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-default-500 hover:text-default-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Timeline body ── */}
      <div className="space-y-5 p-4">
        {groups.length === 0 && (
          <p className="text-sm text-default-400 py-6 text-center">ไม่มีการแจ้งเตือน</p>
        )}

        {groups.map(([daysAgo, items]) => (
          <div key={daysAgo}>
            {/* date group header — pattern จาก CRM activities */}
            <h6 className="text-xs font-bold mb-5 text-default-400">{dayLabel(daysAgo)}</h6>

            {items.map((item, idx) => {
              const isLast = idx === items.length - 1

              return (
                <div
                  key={item.id}
                  className={[
                    'flex gap-x-5',
                    /* unread tint — bg-primary/5 บน row */
                    item.unread ? 'bg-primary/5 rounded-lg' : '',
                  ].join(' ')}
                >
                  {/* ── node + dashed connector (CRM Activities pattern) ── */}
                  <div
                    className={[
                      'after:border-default-300 relative after:absolute after:start-1/2 after:top-7 after:bottom-0 after:w-px after:border-e -ms-px after:border-dashed',
                      isLast ? 'after:hidden' : '',
                    ].join(' ')}
                  >
                    <div className="relative z-10">
                      <div className="flex justify-center items-center border border-dashed border-default-300 rounded-full size-7.5">
                        <Icon
                          icon={item.icon}
                          className={`text-lg ${NODE_COLOR_MAP[item.color]}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── content ── */}
                  <div className="grow pb-7.5">
                    {/* title */}
                    <p className="mb-1.25 text-default-900">
                      <strong>{item.title}</strong>
                    </p>

                    {/* desc */}
                    <p className="text-sm text-default-700 mb-2">{item.desc}</p>

                    {/* action button (ถ้ามี href) — NF-4: btn btn-sm มี padding พอ */}
                    {item.href && (
                      <div className="my-2.5">
                        <Link
                          href={item.href}
                          className="btn btn-sm border-primary text-primary hover:bg-primary hover:text-white inline-flex items-center gap-1"
                        >
                          ดูรายละเอียด
                          <Icon icon="chevron-right" className="text-base" />
                        </Link>
                      </div>
                    )}

                    {/* meta: badge + time */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {item.badge && item.badgeColor && (
                        <span className={`badge ${BADGE_COLOR_MAP[item.badgeColor]} text-xs font-medium`}>
                          {item.badge}
                        </span>
                      )}
                      <small className="text-default-500 text-xs">{item.timeText}</small>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* ── Lazy-load sentinel + spinner ── */}
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
