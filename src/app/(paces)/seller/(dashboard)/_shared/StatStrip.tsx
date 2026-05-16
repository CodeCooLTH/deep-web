/**
 * StatStrip — แถบ stat card แนวนอน (grid หลายช่อง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * Adapted: multiple cards rendered as a single horizontal strip inside one card shell;
 *   divided by dashed vertical border (lg breakpoint). ตัด: `stat.change` arrow-icon dependency
 *   ของ theme (ใช้ chevron จาก Icon wrapper แทน ซึ่ง consistent กับ codebase); เพิ่ม
 *   `compactNumber` formatter สำหรับค่าขนาดใหญ่; เพิ่ม `sinceLabel` prop สำหรับ
 *   custom period label. font-family: ไม่ได้ระบุ — inherit Anuphan จาก Paces layout (safe).
 * Prop contract: StatStripItem[] — backward-compatible กับทุก importer เดิม.
 */

'use client'

import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

// จัดรูปแบบตัวเลขแบบ compact: 999 → "999", 1000 → "1K", 1_250_000 → "1.25M"
// ตัด trailing ".0" เพื่อความกระชับ
function compactNumber(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs < 1000) {
    return sign + (Number.isInteger(n) ? abs.toString() : abs.toFixed(2))
  }
  if (abs < 1_000_000) {
    const v = abs / 1000
    return sign + (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '') + 'K'
  }
  if (abs < 1_000_000_000) {
    const v = abs / 1_000_000
    return sign + (v >= 100 ? v.toFixed(0) : v.toFixed(2)).replace(/\.?0+$/, '') + 'M'
  }
  const v = abs / 1_000_000_000
  return sign + (v >= 100 ? v.toFixed(0) : v.toFixed(2)).replace(/\.?0+$/, '') + 'B'
}

export type StatStripItem = {
  title: string
  value: number
  prefix?: string
  suffix?: string
  change: number         // % เทียบเดือนก่อน (0 = ไม่มีข้อมูลเปรียบเทียบ)
  icon: string           // tabler icon name
  iconClass: string      // Tailwind class สำหรับไอคอน เช่น 'bg-primary/15 text-primary'
  sinceLabel?: string    // ค่า default: "เทียบเดือนก่อน"
}

export default function StatStrip({ items }: { items: StatStripItem[] }) {
  return (
    <div className="card">
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2',
          items.length === 3
            ? 'lg:grid-cols-3'
            : items.length === 5
              ? 'lg:grid-cols-5'
              : 'lg:grid-cols-4',
        )}
      >
        {items.map((item, idx) => (
          <div
            key={item.title}
            className={cn(
              idx < items.length - 1
                ? 'lg:border-e border-dashed border-default-300'
                : '',
            )}
          >
            {/* โครงสร้าง card-body มาจาก StatisticCard: title → value+icon → change+label */}
            <div className="card-body">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {/* Title — uppercase label เหมือน StatisticCard */}
                  <h5 className="text-default-400 text-xs uppercase mb-2 font-medium">
                    {item.title}
                  </h5>

                  {/* Value — CountUp พร้อม compactNumber formatter */}
                  <h3 className="my-5 py-1 text-xl font-bold">
                    <CountUp
                      start={0}
                      end={item.value}
                      duration={1}
                      prefix={item.prefix}
                      suffix={item.suffix}
                      formattingFn={(n) =>
                        `${item.prefix ?? ''}${compactNumber(n)}${item.suffix ?? ''}`
                      }
                    />
                  </h3>

                  {/* Change indicator — ลดเป็น chevron-up/down/minus (tabler) */}
                  <p className="text-default-400 text-sm flex items-center gap-3">
                    <span
                      className={cn(
                        'flex items-center gap-1',
                        item.change > 0
                          ? 'text-success'
                          : item.change < 0
                            ? 'text-danger'
                            : 'text-default-400',
                      )}
                    >
                      <Icon
                        icon={
                          item.change > 0
                            ? 'arrow-up'
                            : item.change < 0
                              ? 'arrow-down'
                              : 'minus'
                        }
                      />
                      {Math.abs(item.change)}%
                    </span>
                    <span className="text-nowrap">
                      {item.sinceLabel ?? 'เทียบเดือนก่อน'}
                    </span>
                  </p>
                </div>

                {/* Icon — rounded circle พร้อม iconClass (เหมือน StatisticCard) */}
                <div
                  className={cn(
                    'size-9 rounded-full flex justify-center items-center',
                    item.iconClass,
                  )}
                >
                  <Icon icon={item.icon} className="size-5.5" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
