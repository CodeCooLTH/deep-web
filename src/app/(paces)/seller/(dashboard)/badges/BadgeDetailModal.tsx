'use client'

/**
 * BadgeDetailModal — modal แสดงรายละเอียด badge + วิธีปลดล็อก (Design Spec T8c)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   — card shell (card-header / card-body / card-footer) + ✕ button + backdrop pattern
 *
 * Controlled ด้วย React state (ไม่ใช้ HSOverlay API/CustomEvent) — selectedBadge state
 * อยู่ที่ BadgeGrid.tsx ซึ่งส่ง badge prop + onClose callback มาให้
 *
 * A11y: role="dialog" aria-modal="true" aria-labelledby; Esc keydown listener
 */

import { useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'
import type { BadgeProgress } from '@/types/badge'
import { BadgeImage } from './BadgeImage'
import { getCategoryLabel, criteriaToText } from './_constants/badge-labels'

type BadgeDetailModalProps = {
  badge: BadgeProgress | null
  onClose: () => void
}

export function BadgeDetailModal({ badge, onClose }: BadgeDetailModalProps) {
  // Esc keydown listener — ปิด modal เมื่อกด Escape
  useEffect(() => {
    if (!badge) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [badge, onClose])

  // render ก็ต่อเมื่อมี badge ที่เลือก (conditional — ไม่ใช้ hidden class)
  if (!badge) return null

  const categoryLabel = getCategoryLabel(badge.badge.criteria)
  const pct = Math.round(badge.progressRatio * 100)
  // threshold 0.7: spec กำหนด progressRatio>=0.7 → bg-warning else bg-primary
  const barColor = badge.progressRatio >= 0.7 ? 'bg-warning' : 'bg-primary'

  return (
    <>
      {/* backdrop — semi-transparent overlay; คลิกนอก card → ปิด */}
      <div
        className="fixed inset-0 z-70 bg-black/60"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* dialog container — center screen */}
      <div
        className="fixed inset-0 z-80 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="badge-detail-modal-label"
          className="w-full max-w-3xl max-h-[90vh] flex flex-col card pointer-events-auto overflow-hidden"
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="card-header p-5 shrink-0">
            <h3 id="badge-detail-modal-label" className="font-medium text-base">
              รายละเอียดรางวัล
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={onClose}
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ── Body — 2-col layout ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[200px_1fr] min-h-0">

            {/* badge image side */}
            <div className="flex flex-col items-center justify-center p-6 bg-default-50 border-b border-default-200 md:border-b-0 md:border-r md:border-default-200">
              <BadgeImage
                nameEN={badge.badge.nameEN}
                imageUrl={badge.badge.imageUrl}
                sizeClass="size-[160px]"
                className={badge.earned ? '' : 'grayscale opacity-60'}
              />
            </div>

            {/* detail side */}
            <div className="overflow-y-auto p-6">

              {/* category tag — omit ถ้า map ไม่เจอ */}
              {categoryLabel && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-2">
                  {categoryLabel}
                </p>
              )}

              {/* badge name */}
              <h3 className="text-lg font-bold text-default-800 mb-3 leading-snug">
                {badge.badge.name}
              </h3>

              {/* status block */}
              {badge.earned ? (
                /* earned — แค่ status badge ไม่แสดง progress หรือวิธีปลดล็อก */
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-success/10 text-success">
                  ได้รับแล้ว ✓
                </span>
              ) : (
                /* locked — progress bar + progressLabel + วิธีปลดล็อก */
                <div className="space-y-4">
                  {/* progress block */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-default-600">ความคืบหน้า</span>
                      <span className="text-xs font-bold tabular-nums text-default-700">{pct}%</span>
                    </div>
                    <div
                      className="bg-default-100 h-2.5 w-full rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-default-500">
                      {badge.progressLabel ?? 'ยังไม่เริ่ม'}
                    </p>
                  </div>

                  {/* วิธีปลดล็อก */}
                  <div>
                    <p className="text-xs font-bold text-default-700 uppercase tracking-wide mb-1">
                      วิธีปลดล็อก
                    </p>
                    <p className="text-sm text-default-600">
                      {criteriaToText(badge.badge.criteria)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="card-footer border-t border-default-200 flex justify-end shrink-0 p-4">
            <button
              type="button"
              className="btn bg-light hover:text-primary"
              onClick={onClose}
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
