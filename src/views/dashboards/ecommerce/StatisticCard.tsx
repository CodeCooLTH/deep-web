/**
 * Admin dashboard stat card — SafePay adaptation.
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * Adaptations:
 *   - Drop month-over-month `change` (we don't track it yet — MVP is cumulative)
 *   - Allow per-card tint class (primary/success/warning/info) via `tone` prop
 *   - Thai `title` + optional `suffix` (e.g. "คน", "ออเดอร์")
 */
import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type AdminStat = {
  title: string
  value: number
  suffix?: string
  icon: string
  tone?: 'primary' | 'success' | 'warning' | 'info' | 'secondary'
}

const toneClass: Record<NonNullable<AdminStat['tone']>, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  secondary: 'bg-secondary/15 text-secondary',
}

const StatisticCard = ({ stat }: { stat: AdminStat }) => {
  const { title, value, suffix, icon, tone = 'primary' } = stat
  return (
    <div className="card h-full">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h5 className="text-default-400 text-sm mb-2 font-medium">
              {title}
            </h5>
            <h3 className="my-5 py-1.25 text-xl">
              <CountUp
                start={0}
                end={value}
                suffix={suffix ?? ''}
                duration={1}
                decimals={Number.isInteger(value) ? 0 : 2}
              />
            </h3>
          </div>
          <div>
            <div className={cn('size-9 rounded-full flex justify-center items-center', toneClass[tone])}>
              <Icon icon={icon} className="size-5.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatisticCard
