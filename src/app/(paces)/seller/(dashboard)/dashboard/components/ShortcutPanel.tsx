/**
 * ShortcutPanel — RSC, 6-tile shortcut grid 3×2 (T5 v6)
 *
 * ทำไม: design v6 ลด tile จาก 8 → 6 (คำสั่งซื้อ + สินค้า ย้ายไป bottom nav แล้ว)
 * grid 3 คอลัมน์ × 2 แถว, tile-box 46×46px rounded-[13px]
 * color: 'green' = เติมเงิน (tint เขียว), 'neutral' = ที่เหลือ (bg #F2F1F6)
 *
 * ทำไม literal class ไม่ใช้ template string: Tailwind v4 purge ต้องเห็น full class literal ในไฟล์
 *
 * ลบ COLOR_CHIP 4-group เดิม + badge / showBadge logic (badge ย้ายไป bottom nav)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (adapt: icon slot `size-9 bg-primary/15 rounded-full` → `w-[46px] h-[46px] rounded-[13px]` + color 2-way)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { SHORTCUT_TILES, type ShortcutTile } from '../_constants/command-center'

export default function ShortcutPanel() {
  return (
    <section className="mb-3">
      {/* sec-label v6 — weight 600, ink-70, ตาม mockup .sec-label */}
      <p className="text-[13px] font-semibold text-[rgba(47,43,61,0.70)] mb-2 pl-[2px]">เมนูลัด</p>

      {/* card wrapper v6 — rounded-[14px] shadow-sm bg ขาว (v6.1: padding 8-pt grid py-2) */}
      <div className="bg-white rounded-[14px] shadow-[0_2px_8px_rgba(47,43,61,0.07)] px-2 py-2">

        {/* grid 3×2 (v6.1: gap-y 8px = 8-pt grid) */}
        <div className="grid grid-cols-3 gap-y-2">
          {SHORTCUT_TILES.map((tile: ShortcutTile) => {

            /*
             * ทำไมแยก box/icon class แบบ literal ไม่ใช้ template string:
             * Tailwind v4 purge scan static text — runtime concat ทำให้ purge ตัด class ทิ้ง
             * → เขียน mapping ตรง 2 branch เท่านั้น
             */
            const boxClass =
              tile.color === 'green'
                ? 'bg-[rgba(40,199,111,0.14)]'
                : 'bg-[#F2F1F6]'

            const iconClass =
              tile.color === 'green'
                ? 'text-[#28C76F]'
                : 'text-[rgba(47,43,61,0.70)]'

            // tile disabled (Blacklist) — ไม่ navigate, opacity-40 pointer-events-none
            if (tile.disabled || !tile.href) {
              return (
                <div
                  key={tile.label}
                  className="flex flex-col items-center gap-1 opacity-40 pointer-events-none"
                  title="เร็ว ๆ นี้"
                  aria-disabled="true"
                >
                  {/* tile-box 46×46 rounded-[13px] — touch area ≥44px (46px ผ่าน) */}
                  <span
                    className={`w-[46px] h-[46px] rounded-[13px] ${boxClass} flex items-center justify-center`}
                  >
                    <Icon icon={tile.icon} className={`text-[22px] ${iconClass}`} />
                  </span>
                  <span className="text-[11.5px] font-medium text-[rgba(47,43,61,0.70)] leading-tight">
                    {tile.label}
                  </span>
                </div>
              )
            }

            // tile active — Link RSC (next/link), active:scale-95 feedback
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                {/* tile-box 46×46 rounded-[13px] — touch area ≥44px (46px ผ่าน) */}
                <span
                  className={`w-[46px] h-[46px] rounded-[13px] ${boxClass} flex items-center justify-center`}
                >
                  <Icon icon={tile.icon} className={`text-[22px] ${iconClass}`} />
                </span>
                <span className="text-[11.5px] font-medium text-[rgba(47,43,61,0.70)] leading-tight">
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
