/**
 * AchievementLevel — widget แสดงระดับ trust + badges ของร้านค้า (T9 redesign)
 *
 * Base (card shell): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * Progress bar pattern: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueDetailModal.tsx (lines 54-56)
 * Section header pattern: src/app/(paces)/seller/(dashboard)/badges/BadgeGrid.tsx (lines ~35-41)
 *
 * T9: แยก "ได้รับแล้ว" strip + "ใกล้ได้รับ" top4-progress rows
 * ลบ local BadgeIcon (ซ้ำซ้อนกับ BadgeImage) → ใช้ BadgeImage จาก badges/
 * เหตุที่ import cross-feature: BadgeImage เป็น client island ที่แยกไว้เพราะ onError
 * ต้องการ useState — ไม่มี equivalent ใน dashboard component tree
 *
 * เป็น SafePay core system — ห้ามลบ widget
 * Circular ring วาด SVG ตรงๆ ไม่พึ่ง lib เพิ่มเติม
 */
'use client'

import { CountUp } from '@/components/wrappers/CountUp'
import { cn } from '@/utils/helpers'
import type { BadgeProgress } from '@/types/badge'
// cross-feature import — BadgeImage ต้องการ useState (onError) จึง extract แยกไฟล์;
// ไม่ duplicate ไว้ใน dashboard เพราะเป็น pattern เดียวกันทุกประการ (perf debt ยอมรับ)
import { BadgeImage } from '../../badges/BadgeImage'
// SSOT ของ % บนแถบ — ต้องเป็นตัวเดียวกับหน้า /badges ไม่งั้นการ์ดนี้กับหน้าเต็มโชว์เลขคนละตัว
import { displayProgressPct } from '../../badges/_constants/badge-labels'
import { useRouter } from 'next/navigation'

export type AchievementLevelProps = {
  score: number           // 0-100
  level: string           // 'A+' | 'A' | ...
  levelColor?: string     // tailwind text color class, defaults 'text-primary'
  earnedBadges: BadgeProgress[]
  topInProgress: BadgeProgress[]
}

export default function AchievementLevel({
  score,
  level,
  levelColor = 'text-primary',
  earnedBadges,
  topInProgress,
}: AchievementLevelProps) {
  const router = useRouter()

  // Ring constants
  const R = 54
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.min(100, Math.max(0, score)) / 100)

  // earned strip: แสดงสูงสุด 8 รางวัล; ถ้าเกิน → chip "+N รางวัล"
  const EARNED_MAX = 8
  const earnedSlice = earnedBadges.slice(0, EARNED_MAX)
  const earnedOverflow = earnedBadges.length - EARNED_MAX

  return (
    <div className="card h-full">

      {/* card-header: title ซ้าย + SVG ring (size-14 = 56px) ขวา */}
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title">ระดับความสำเร็จ</h4>

        {/* Circular score ring ย่อ size-14 (56px) — คง score/level/levelColor metric */}
        <div className="relative size-14">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle
              cx="60" cy="60" r={R}
              className="stroke-default-200"
              strokeWidth="8" fill="none"
            />
            <circle
              cx="60" cy="60" r={R}
              className={cn('stroke-current transition-all duration-700', levelColor)}
              strokeWidth="8" fill="none"
              strokeDasharray={C}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={cn('text-xs font-bold leading-none', levelColor)}>{level}</div>
            <div className={'text-default-400 text-[9px] tabular-nums' /* HR7 carve-out: ขั้นเล็กสุดของธีมคือ text-2xs (11px) ซึ่งดันบรรทัดนี้ชนขอบวงในของ ring size-14 (56px − stroke 8px ทั้งสองด้าน) ที่ซ้อนอยู่ใต้ตัวอักษรระดับ 13px แล้ว */}>
              <CountUp start={0} end={score} duration={1} decimals={0} />
            </div>
          </div>
        </div>
      </div>

      <div className="card-body space-y-5">

        {/* ── Section: ได้รับแล้ว ────────────────────────────────────────── */}
        <section>
          {/* section header — count pill + divider (copy pattern จาก BadgeGrid.tsx บรรทัด ~35-41) */}
          <div className="flex items-center gap-3 mb-3">
            <h5 className="text-sm font-bold text-default-800 shrink-0">ได้รับแล้ว</h5>
            <span className="bg-default-800 text-default-50 text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {earnedBadges.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {earnedBadges.length === 0 ? (
            <p className="text-xs text-default-400">
              ยังไม่มีรางวัล — เริ่มขายเพื่อสะสม
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {earnedSlice.map((item) => (
                <div
                  key={item.badge.id}
                  title={item.badge.name}
                  className="shrink-0"
                >
                  <BadgeImage
                    nameEN={item.badge.nameEN}
                    imageUrl={item.badge.imageUrl}
                    sizeClass="size-8"
                  />
                </div>
              ))}
              {earnedOverflow > 0 && (
                <span className="text-xs font-bold text-default-500 bg-default-100 rounded-full px-2 py-0.5 shrink-0">
                  +{earnedOverflow} รางวัล
                </span>
              )}
            </div>
          )}
        </section>

        {/* ── Section: ใกล้ได้รับ ──────────────────────────────────────── */}
        <section>
          {/* section header — count pill + divider (copy pattern จาก BadgeGrid.tsx) */}
          <div className="flex items-center gap-3 mb-3">
            <h5 className="text-sm font-bold text-default-800 shrink-0">ใกล้ได้รับ</h5>
            <span className="bg-default-800 text-default-50 text-xs font-bold rounded-full px-2.5 py-0.5 shrink-0">
              {topInProgress.length}
            </span>
            <div className="flex-1 h-px bg-default-200" />
          </div>

          {topInProgress.length === 0 ? (
            <p className="text-xs text-default-400">
              คุณได้รับทุกรางวัลแล้ว
            </p>
          ) : (
            <div className="space-y-3">
              {topInProgress.map((item) => {
                const pct = displayProgressPct(item.progressRatio, item.earned)
                // เหตุผลเดียวกับ BadgeGrid.tsx: bg-warning บน track = 1.48:1 (ต้องการ 3:1) และ
                // amber ในระบบนี้แปลว่า "เตือน" ⇒ ยิ่งใกล้สำเร็จยิ่งดูเหมือนมีปัญหา
                const barColor = 'bg-primary'
                return (
                  <div key={item.badge.id}>
                    <div className="flex items-center gap-2 mb-1">
                      {/* badge icon — grayscale opacity-60 บอกสถานะ locked */}
                      <BadgeImage
                        nameEN={item.badge.nameEN}
                        imageUrl={item.badge.imageUrl}
                        sizeClass="size-8"
                        className="grayscale opacity-60 shrink-0"
                      />
                      <span className="text-xs text-default-700 flex-1 line-clamp-1">
                        {item.badge.name}
                      </span>
                      <span className="text-xs font-bold text-default-500 tabular-nums shrink-0">
                        {item.progressLabel ?? 'ยังไม่เริ่ม'}
                      </span>
                    </div>
                    {/* progress bar — Base: IssueDetailModal.tsx lines 54-56 */}
                    <div className="h-1.5 w-full rounded bg-default-200">
                      <div
                        className={`h-full rounded transition-[width] duration-500 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {/* card-footer: link ไป /badges (ห้าม component={Link} ใน 'use client' component ที่มี router) */}
      <div className="card-footer border-t border-default-200 pt-3">
        <button
          type="button"
          onClick={() => router.push('/badges')}
          className="text-sm text-primary hover:underline"
        >
          ดูทั้งหมด →
        </button>
      </div>

    </div>
  )
}
