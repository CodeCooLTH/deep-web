'use client'

/**
 * BadgeGrid — client island สำหรับ grid การ์ด badge + modal state
 *
 * Base: src/app/(paces)/seller/(dashboard)/badges/page.tsx — moved EarnedCard/LockedCard JSX
 *   (ย้ายมาจาก page.tsx โดยไม่ rewrote ใหม่ เพื่อ match spec "ย้ายมา ไม่เขียนใหม่")
 *
 * เหตุที่ extract เป็น client island: page.tsx ต้องเป็น RSC (getServerSession + fetch)
 * แต่ onClick + useState ต้องการ client — RSC island pattern แยก interactivity ออก
 */

import { useState } from 'react'
import type { BadgeProgress } from '@/types/badge'
import { BadgeImage } from './BadgeImage'
import { BadgeDetailModal } from './BadgeDetailModal'
import { getCategoryLabel } from './_constants/badge-labels'

type BadgeGridProps = {
  earned: BadgeProgress[]
  locked: BadgeProgress[]
}

export function BadgeGrid({ earned, locked }: BadgeGridProps) {
  // selectedBadge: badge ที่ผู้ใช้คลิก; null = modal ปิด
  const [selectedBadge, setSelectedBadge] = useState<BadgeProgress | null>(null)

  return (
    <>
      <div className="container-fluid space-y-8">

        {/* ── Section: ได้รับแล้ว ─────────────────────────────────────────── */}
        <section>
          {/* header row — count pill + divider line (จาก products-grid page header pattern) */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-default-800 shrink-0">ได้รับแล้ว</h2>
            <span className="bg-default-800 text-white text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {earned.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {earned.length === 0 ? (
            <p className="text-center text-default-400 py-8">
              ยังไม่มีรางวัลที่ได้รับ — เริ่มขายเพื่อสะสมรางวัลแรก
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {earned.map((item) => (
                <EarnedCard
                  key={item.badge.id}
                  item={item}
                  onClick={() => setSelectedBadge(item)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Section: ยังล็อกอยู่ ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-bold text-default-800 shrink-0">ยังล็อกอยู่</h2>
            <span className="bg-default-800 text-white text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {locked.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {locked.length === 0 ? (
            <p className="text-center text-default-400 py-8">
              คุณได้รับรางวัลครบทุกรายการแล้ว
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {locked.map((item) => (
                <LockedCard
                  key={item.badge.id}
                  item={item}
                  onClick={() => setSelectedBadge(item)}
                />
              ))}
            </div>
          )}
        </section>

      </div>

      {/* modal — render เมื่อ selectedBadge !== null */}
      <BadgeDetailModal
        badge={selectedBadge}
        onClose={() => setSelectedBadge(null)}
      />
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type CardProps = {
  item: BadgeProgress
  onClick: () => void
}

/**
 * EarnedCard — badge card สำหรับ badge ที่ได้รับแล้ว
 * shell: Paces card (ProductCard theme) + hover-lift
 * content: art 72px + category label + name + "ได้รับแล้ว"
 * คลิก/keyboard → เปิด modal รายละเอียด
 */
function EarnedCard({ item, onClick }: CardProps) {
  const categoryLabel = getCategoryLabel(item.badge.criteria)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.badge.name}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="card p-3 text-center rounded-2xl border border-default-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer"
    >
      {/* art wrapper — 72px ตาม spec */}
      <div className="size-[72px] mx-auto mb-2 relative">
        <BadgeImage
          nameEN={item.badge.nameEN}
          imageUrl={item.badge.imageUrl}
          sizeClass="size-[72px]"
        />
      </div>

      {/* category label — omit ทั้งบรรทัดถ้า map ไม่เจอ (spec: ถ้า map ไม่เจอ → omit) */}
      {categoryLabel && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">
          {categoryLabel}
        </p>
      )}

      <h3 className="text-[13px] font-bold text-default-800 mb-1 leading-snug">
        {item.badge.name}
      </h3>
      <p className="text-xs text-default-500">ได้รับแล้ว</p>
    </div>
  )
}

/**
 * LockedCard — badge card สำหรับ badge ที่ยังไม่ได้รับ
 * shell: bg-default-50, ไม่มี hover-lift (spec ระบุชัด)
 * grayscale + opacity-70 บน BadgeImage
 * progress bar: spec สี warning ≥70%, primary <70%
 * คลิก/keyboard → เปิด modal รายละเอียด + วิธีปลดล็อก
 */
function LockedCard({ item, onClick }: CardProps) {
  const categoryLabel = getCategoryLabel(item.badge.criteria)
  const pct = Math.round(item.progressRatio * 100)
  // ทำไม threshold 0.7: spec กำหนด progressRatio>=0.7 → bg-warning else bg-primary
  const barColor = item.progressRatio >= 0.7 ? 'bg-warning' : 'bg-primary'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.badge.name}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="card bg-default-50 p-3 text-center rounded-2xl border border-default-200 shadow-sm cursor-pointer"
    >
      {/* art wrapper — grayscale บอกสถานะ locked */}
      <div className="size-[72px] mx-auto mb-2">
        <BadgeImage
          nameEN={item.badge.nameEN}
          imageUrl={item.badge.imageUrl}
          sizeClass="size-[72px]"
          className="grayscale opacity-60"
        />
      </div>

      {/* category label — omit ถ้า map ไม่เจอ */}
      {categoryLabel && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">
          {categoryLabel}
        </p>
      )}

      <h3 className="text-[13px] font-bold text-default-500 mb-1 leading-snug">
        {item.badge.name}
      </h3>

      {/* progress block — dashed divider + track + label */}
      <div className="border-t border-dashed border-default-200 mt-3 pt-3">
        {/* track — Paces canonical bar (h-1.5 ตาม spec) */}
        <div
          className="bg-default-200 h-1.5 w-full rounded-full overflow-hidden mb-1.5"
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
        <p className="text-xs font-bold text-default-600 text-center tabular-nums">
          {item.progressLabel ?? 'ยังไม่เริ่ม'}
        </p>
      </div>
    </div>
  )
}
