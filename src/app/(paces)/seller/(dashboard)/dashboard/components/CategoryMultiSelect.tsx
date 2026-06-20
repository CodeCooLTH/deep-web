'use client'

// CategoryMultiSelect — chip-grid สำหรับเลือกหมวดร้าน (onboarding step 2 / ตั้งค่าร้าน)
// Base: theme/paces/Admin/TS/src/assets/css/custom/_buttons.css (btn chip)
//       theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (lighten pill badge: bg-primary/15 text-primary rounded-full)

import Icon from '@/components/wrappers/Icon'
import { SHOP_CATEGORY_KEYS, SHOP_CATEGORY_LABELS } from '@/lib/shop-categories'

interface CategoryMultiSelectProps {
  value: string[]
  onChange: (categories: string[]) => void
  max?: number
  disabled?: boolean
}

export default function CategoryMultiSelect({
  value,
  onChange,
  max = 5,
  disabled = false,
}: CategoryMultiSelectProps) {
  const isAtMax = value.length >= max

  function toggle(key: string) {
    if (disabled) return

    if (value.includes(key)) {
      // ยกเลิกการเลือก chip นั้น
      onChange(value.filter((k) => k !== key))
    } else {
      // เพิ่ม chip — ถ้าครบ max แล้วไม่ทำอะไร (pointer-events-none บน chip ด้วย)
      if (isAtMax) return
      onChange([...value, key])
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Counter badge — lighten pill (base: LightenPillBadges ใน badges/page.tsx) */}
      <div>
        <span className="badge bg-primary/15 text-primary rounded-full">
          เลือกแล้ว {value.length}/{max}
        </span>
      </div>

      {/* Grid chip — base: _buttons.css .btn + toggle state */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SHOP_CATEGORY_KEYS.map((key) => {
          const isSelected = value.includes(key)
          // chip ที่ยังไม่เลือก + ครบ max แล้ว → disable (pointer-events-none)
          const isChipDisabled = disabled || (!isSelected && isAtMax)

          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              disabled={isChipDisabled}
              className={[
                'btn min-h-11 w-full py-2.5 px-3 text-sm',
                isSelected
                  ? 'bg-primary/15 text-primary border border-primary'
                  : isChipDisabled
                    ? // chip ปิด (เกิน max หรือ disabled prop) — opacity จาก button:disabled ใน _buttons.css
                      'bg-light text-default-400 border border-default-300 opacity-50 cursor-not-allowed pointer-events-none'
                    : 'bg-light text-dark hover:bg-light-hover border border-default-300',
              ].join(' ')}
            >
              {isSelected && (
                <Icon icon="check" className="size-4 shrink-0" />
              )}
              {SHOP_CATEGORY_LABELS[key]}
            </button>
          )
        })}
      </div>

      {/* Warning bar — แสดงเฉพาะตอน limit ครบและยังไม่ disabled ทั้งหมด */}
      {isAtMax && !disabled && (
        <div className="flex items-center gap-2 bg-warning/15 text-warning rounded px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="size-4 shrink-0" />
          <span>เลือกได้สูงสุด {max} หมวด</span>
        </div>
      )}
    </div>
  )
}
