/**
 * ShortcutPanel — RSC, 8-tile shortcut grid (S-9)
 *
 * ทำไม: Tailwind v4 purge ไม่เห็น class ที่ประกอบ string runtime (`bg-${color}-50`)
 * ดังนั้นต้องใช้ static map ให้ Tailwind เห็น literal class ทุกสี
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (adapt: icon slot `size-9 bg-primary/15 rounded-full` → `w-14 h-14 rounded-2xl` + color token per tile)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { SHORTCUT_TILES, type ShortcutTile } from '../_constants/command-center'

type Props = {
  pendingOrderCount: number
}

/**
 * Static color map — ต้องระบุ literal class ทุกสีที่ SHORTCUT_TILES ใช้
 * เพื่อให้ Tailwind v4 เห็นและ generate CSS (ห้ามประกอบ string runtime)
 * สี: blue / indigo / yellow / emerald / rose / amber / sky / gray
 */
const COLOR_CHIP: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-600',
  indigo:  'bg-indigo-50 text-indigo-600',
  yellow:  'bg-yellow-50 text-yellow-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose:    'bg-rose-50 text-rose-600',
  amber:   'bg-amber-50 text-amber-600',
  sky:     'bg-sky-50 text-sky-600',
  gray:    'bg-gray-50 text-gray-600',
}

// fallback กรณีสีไม่อยู่ใน map
const DEFAULT_CHIP = 'bg-gray-50 text-gray-600'

export default function ShortcutPanel({ pendingOrderCount }: Props) {
  return (
    <section className="mx-3 mb-4">
      <p className="text-[13px] font-semibold text-muted-foreground mb-2 pl-1">เมนูลัด</p>
      <div className="grid grid-cols-4 gap-3">
        {SHORTCUT_TILES.map((tile: ShortcutTile) => {
          const chipClass = COLOR_CHIP[tile.color] ?? DEFAULT_CHIP

          // tile disabled — ไม่มี href, cursor-not-allowed, ไม่ navigate
          // guard ที่ !tile.href (ไม่ใช่ tile.disabled) เพื่อให้ TS narrow href เป็น string
          // ในสาขา active ด้านล่าง — ไม่ต้อง non-null assertion
          if (tile.disabled || !tile.href) {
            return (
              <div
                key={tile.label}
                className="flex flex-col items-center gap-1.5 text-center cursor-not-allowed opacity-50"
                title="เร็ว ๆ นี้"
                aria-disabled="true"
              >
                {/* icon chip — เหมือน active tile แต่ไม่ interactive */}
                <span
                  className={`relative inline-flex w-14 h-14 rounded-2xl ${chipClass} items-center justify-center`}
                >
                  <Icon icon={tile.icon} className="text-[26px]" />
                </span>
                <span className="text-[12px] font-semibold text-default-900 leading-tight">
                  {tile.label}
                </span>
              </div>
            )
          }

          // tile active — Link ที่คลิกได้, ≥44px touch target (w-14 chip ครอบทั้ง tile)
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="flex flex-col items-center gap-1.5 text-center active:scale-95 transition-transform"
            >
              {/* icon chip พร้อม badge (เฉพาะ tile.showBadge && pendingOrderCount > 0) */}
              <span
                className={`relative inline-flex w-14 h-14 rounded-2xl ${chipClass} items-center justify-center`}
              >
                <Icon icon={tile.icon} className="text-[26px]" />

                {/* badge pending count — ซ่อนเมื่อ 0, แสดง "99+" ถ้า ≥100 */}
                {tile.showBadge && pendingOrderCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 text-[11px] font-bold bg-danger text-white rounded-full inline-flex items-center justify-center">
                    {pendingOrderCount > 99 ? '99+' : pendingOrderCount}
                  </span>
                )}
              </span>

              <span className="text-[12px] font-semibold text-default-900 leading-tight">
                {tile.label}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
