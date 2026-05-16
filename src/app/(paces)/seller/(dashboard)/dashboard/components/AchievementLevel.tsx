/**
 * AchievementLevel — widget แสดงระดับ trust + badges ของร้านค้า
 *
 * Base (compose-from): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (card shell: card/card-header/card-body primitives จาก Paces; behavior + data logic เป็น SafePay core)
 *
 * เป็น SafePay core system — ห้ามลบ; badge grid แสดง earned/unearned state
 * Circular ring วาด SVG ตรงๆ ไม่พึ่ง lib เพิ่มเติม
 */
'use client'

import { CountUp } from '@/components/wrappers/CountUp'
import { cn } from '@/utils/helpers'
import { Icon as IconifyIcon } from '@iconify/react'

export type AchievementBadge = {
  id: string
  name: string
  nameEN: string
  icon: string | null // legacy (emoji) — nullable since Badge.icon migration; not rendered (uses LUCIDE_FOR_BADGE)
  earned: boolean
  criteria: string    // human-readable criteria (e.g. "สั่ง 50 ออเดอร์")
}

// Map badge nameEN → lucide icon. Uses paces `@iconify/react` with
// the 'lucide:' prefix (see theme/paces/Admin/TS/src/app/(admin)/icons/lucide).
const LUCIDE_FOR_BADGE: Record<string, string> = {
  'First Sale':          'lucide:store',
  'Trusted Seller 50':   'lucide:star',
  'Century Club':        'lucide:trophy',
  'Perfect Rating':      'lucide:gem',
  'Highly Rated':        'lucide:sparkles',
  'Zero Complaint':      'lucide:shield-check',
  'Veteran':             'lucide:medal',
  'Speed Demon':         'lucide:zap',
  'Fully Verified':      'lucide:badge-check',
  'Community Favorite':  'lucide:heart',
}
const FALLBACK_LUCIDE = 'lucide:award'

export type AchievementLevelProps = {
  score: number            // 0-100
  level: string            // 'A+' | 'A' | ...
  levelColor?: string      // tailwind text color class, defaults 'text-primary'
  badges: AchievementBadge[]
  nextMilestone?: string   // text for the line
}

export default function AchievementLevel({
  score,
  level,
  levelColor = 'text-primary',
  badges,
  nextMilestone,
}: AchievementLevelProps) {
  const earned = badges.filter((b) => b.earned).length
  const total = badges.length

  // Ring constants
  const R = 54
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.min(100, Math.max(0, score)) / 100)

  return (
    <div className="card h-full">
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title">ระดับความสำเร็จ</h4>
        <span className="text-default-400 text-xs">{earned} / {total} badges</span>
      </div>
      <div className="card-body">
        <div className="flex flex-col items-center text-center">
          {/* Circular score ring */}
          <div className="relative size-36">
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
              <div className={cn('text-4xl font-bold leading-none', levelColor)}>{level}</div>
              <div className="text-default-400 mt-1 text-sm">
                <CountUp start={0} end={score} duration={1} decimals={0} />/100
              </div>
            </div>
          </div>

          {nextMilestone && (
            <p className="text-default-400 text-xs mt-3">{nextMilestone}</p>
          )}
        </div>

        {/* Badges grid */}
        <div className="grid grid-cols-5 gap-2 mt-5">
          {badges.map((b) => {
            const lucide = LUCIDE_FOR_BADGE[b.nameEN] ?? FALLBACK_LUCIDE
            return (
              <div
                key={b.id}
                title={b.earned ? b.name : b.criteria}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-lg border border-default-200 transition',
                  b.earned ? 'bg-card' : 'bg-default-50 opacity-40 grayscale',
                )}
              >
                <IconifyIcon
                  icon={lucide}
                  className={cn(
                    'size-6',
                    b.earned ? 'text-primary' : 'text-default-400',
                  )}
                />
                <div className="text-[10px] text-default-500 text-center leading-tight line-clamp-2">
                  {b.name}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
