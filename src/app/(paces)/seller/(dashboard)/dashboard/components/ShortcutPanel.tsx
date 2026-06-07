/**
 * ShortcutPanel — RSC, 8-tile shortcut grid (S-9)
 *
 * ทำไม: Tailwind v4 purge ไม่เห็น class ที่ประกอบ string runtime (`bg-${color}-50`)
 * ดังนั้นต้องใช้ static map ให้ Tailwind เห็น literal class ทุกสี
 *
 * V4 polish: 8 tile เก็บเข้า card เดียว (contained), สี 4 กลุ่มความหมาย,
 * chip 52px, badge ring ขาว, disabled opacity-45
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (adapt: icon slot `size-9 bg-primary/15 rounded-full` → `w-[52px] h-[52px] rounded-2xl` + color token per tile)
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
 * V4: 4 กลุ่มความหมาย — blue (งานหลัก) / emerald (เงิน) / amber (engagement) / slate (utility)
 */
const COLOR_CHIP: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50 text-amber-600',
  slate:   'bg-slate-100 text-slate-600',
}

// fallback กรณีสีไม่อยู่ใน map
const DEFAULT_CHIP = 'bg-slate-100 text-slate-600'

export default function ShortcutPanel({ pendingOrderCount }: Props) {
  return (
    <section className="px-4 mb-4">
      <p className="text-[13.5px] font-bold text-default-500 mb-2.5 pl-1.5">เมนูลัด</p>
      {/* card wrapper — V4: 8 tile อยู่ใน card เดียว (contained ไม่ลอยบน bg เปล่า) */}
      <div className="bg-white rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-8px_rgba(16,24,40,0.10)] p-3">
        <div className="grid grid-cols-4 gap-y-4 gap-x-1">
          {SHORTCUT_TILES.map((tile: ShortcutTile) => {
            const chipClass = COLOR_CHIP[tile.color] ?? DEFAULT_CHIP

            // tile disabled — ไม่มี href, cursor-not-allowed, ไม่ navigate
            // guard ที่ !tile.href (ไม่ใช่ tile.disabled) เพื่อให้ TS narrow href เป็น string
            // ในสาขา active ด้านล่าง — ไม่ต้อง non-null assertion
            if (tile.disabled || !tile.href) {
              return (
                <div
                  key={tile.label}
                  className="flex flex-col items-center gap-2 text-center cursor-not-allowed opacity-45"
                  title="เร็ว ๆ นี้"
                  aria-disabled="true"
                >
                  {/* icon chip — เหมือน active tile แต่ไม่ interactive */}
                  <span
                    className={`relative inline-flex w-[52px] h-[52px] rounded-2xl ${chipClass} items-center justify-center`}
                  >
                    <Icon icon={tile.icon} className="text-[25px]" />
                  </span>
                  <span className="text-[11.5px] font-semibold text-default-500 leading-tight">
                    {tile.label}
                  </span>
                </div>
              )
            }

            // tile active — Link ที่คลิกได้, ≥44px touch target (chip ครอบทั้ง tile)
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex flex-col items-center gap-2 text-center active:scale-95 transition-transform"
              >
                {/* icon chip พร้อม badge (เฉพาะ tile.showBadge && pendingOrderCount > 0) */}
                <span
                  className={`relative inline-flex w-[52px] h-[52px] rounded-2xl ${chipClass} items-center justify-center`}
                >
                  <Icon icon={tile.icon} className="text-[25px]" />

                  {/* badge pending count — ซ่อนเมื่อ 0, แสดง "99+" ถ้า ≥100, ring ขาวกัน chip ซ้อน */}
                  {tile.showBadge && pendingOrderCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 text-[11px] font-bold bg-danger text-white rounded-full inline-flex items-center justify-center ring-2 ring-white">
                      {pendingOrderCount > 99 ? '99+' : pendingOrderCount}
                    </span>
                  )}
                </span>

                <span className="text-[11.5px] font-semibold text-default-500 leading-tight">
                  {tile.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
