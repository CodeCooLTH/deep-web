'use client'

// Base: theme/paces/Admin/TS/src/assets/css/custom/_buttons.css
// ใช้ .btn soft/light pattern จาก Paces — bg-primary/15 (selected) / bg-light (unselected)
// ห้าม arbitrary value: ไม่มี text-[Npx], hex, bg-[rgba()] ใด ๆ

import { Icon } from '@iconify/react'
import { SALES_CHANNEL_KEYS, SALES_CHANNEL_LABELS } from '@/lib/validations'

// icon แต่ละ channel — tabler + simple-icons ตาม spec
const CHANNEL_ICONS: Record<(typeof SALES_CHANNEL_KEYS)[number], string> = {
  facebook:   'tabler:brand-facebook',
  offline:    'tabler:building-store',
  line:       'tabler:brand-line',
  tiktok_shop: 'tabler:brand-tiktok',
  lazada:     'simple-icons:lazada',
  shopee:     'simple-icons:shopee',
}

interface SalesChannelPickerProps {
  value: string[]
  onChange: (channels: string[]) => void
  disabled?: boolean
}

export default function SalesChannelPicker({
  value,
  onChange,
  disabled = false,
}: SalesChannelPickerProps) {
  // toggle channel เข้า/ออก array
  function toggle(key: string) {
    if (disabled) return
    const next = value.includes(key)
      ? value.filter((k) => k !== key)
      : [...value, key]
    onChange(next)
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SALES_CHANNEL_KEYS.map((key) => {
        const selected = value.includes(key)
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(key)}
            // Paces .btn primitive + soft-light pattern ตาม _buttons.css
            // selected: bg-primary/15 text-primary border-primary
            // unselected: bg-light text-dark border-default-300 hover:bg-light-hover
            className={[
              'btn min-h-11 py-2.5 px-3 w-full flex items-center gap-2',
              selected
                ? 'bg-primary/15 text-primary border border-primary'
                : 'bg-light text-dark hover:bg-light-hover border border-default-300',
            ].join(' ')}
            aria-pressed={selected}
          >
            <Icon icon={CHANNEL_ICONS[key]} className="size-4.5 shrink-0" />
            <span className="text-sm font-medium truncate">
              {SALES_CHANNEL_LABELS[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
