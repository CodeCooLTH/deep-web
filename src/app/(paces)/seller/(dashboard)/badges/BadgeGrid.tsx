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
import { getCategoryLabel, displayProgressPct } from './_constants/badge-labels'

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
            <span className="bg-default-800 text-default-50 text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {earned.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {earned.length === 0 ? (
            <p className="text-center text-default-400 py-8">
              ยังไม่มีรางวัลที่ได้รับ — เริ่มขายเพื่อสะสมรางวัลแรก
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
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
            <span className="bg-default-800 text-default-50 text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {locked.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {locked.length === 0 ? (
            <p className="text-center text-default-400 py-8">
              คุณได้รับรางวัลครบทุกรายการแล้ว
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
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
      className="p-3 text-center rounded-lg bg-default-50 hover:bg-default-100 transition-colors cursor-pointer"
    >
      {/* art wrapper — 72px ตาม spec */}
      <div className={'size-[72px] mx-auto mb-2 relative' /* HR7 carve-out: เหรียญเป็น pixel art (BadgeImage ตั้ง imageRendering:pixelated) ต้องล็อกพิกเซลจำนวนเต็ม — token rem ให้ค่าเศษเมื่อ root font ไม่ใช่ 16px แล้วรูปเบลอ */}>
        <BadgeImage
          nameEN={item.badge.nameEN}
          icon={item.badge.icon}
          imageUrl={item.badge.imageUrl}
          sizeClass={'size-[72px]' /* HR7 carve-out: ต้องตรงกับกล่องแม่ (pixel art) */}
        />
      </div>

      {/* category label — omit ทั้งบรรทัดถ้า map ไม่เจอ (spec: ถ้า map ไม่เจอ → omit) */}
      {categoryLabel && (
        <p className="text-2xs font-bold text-default-400 mb-1">
          {categoryLabel}
        </p>
      )}

      <h3 className="text-xs font-bold text-default-800 mb-1 leading-snug">
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
 * progress bar: bg-primary เส้นเดียว (เดิมสลับเป็น warning ที่ ≥70% — ดูเหตุผลที่ barColor)
 * คลิก/keyboard → เปิด modal รายละเอียด + วิธีปลดล็อก
 */
function LockedCard({ item, onClick }: CardProps) {
  const categoryLabel = getCategoryLabel(item.badge.criteria)
  const pct = displayProgressPct(item.progressRatio, item.earned)
  // 🛑 เดิม threshold 0.7 → bg-warning: ผิดทั้งความหมาย (amber = เตือน/รอดำเนินการ ทุกที่ในระบบ
  // ⇒ ยิ่งใกล้สำเร็จยิ่งดูเหมือนมีปัญหา) และคอนทราสต์ (bg-warning บน track = 1.48:1 ต้องการ 3:1
  // ตาม WCAG 1.4.11 ⇒ สถานะ "เกือบได้แล้ว" มองเห็นยากที่สุด). bg-primary = 4.55:1
  const barColor = 'bg-primary'

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
      className="p-3 text-center rounded-lg bg-default-50 opacity-75 hover:opacity-100 hover:bg-default-100 transition-all cursor-pointer"
    >
      {/* art wrapper — grayscale บอกสถานะ locked */}
      <div className={'size-[72px] mx-auto mb-2' /* HR7 carve-out: เหรียญเป็น pixel art (BadgeImage ตั้ง imageRendering:pixelated) ต้องล็อกพิกเซลจำนวนเต็ม — token rem ให้ค่าเศษเมื่อ root font ไม่ใช่ 16px แล้วรูปเบลอ */}>
        <BadgeImage
          nameEN={item.badge.nameEN}
          icon={item.badge.icon}
          imageUrl={item.badge.imageUrl}
          sizeClass={'size-[72px]' /* HR7 carve-out: ต้องตรงกับกล่องแม่ (pixel art) */}
          className="grayscale opacity-60"
        />
      </div>

      {/* category label — omit ถ้า map ไม่เจอ */}
      {categoryLabel && (
        <p className="text-2xs font-bold text-default-400 mb-1">
          {categoryLabel}
        </p>
      )}

      <h3 className="text-xs font-bold text-default-500 mb-1 leading-snug">
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
