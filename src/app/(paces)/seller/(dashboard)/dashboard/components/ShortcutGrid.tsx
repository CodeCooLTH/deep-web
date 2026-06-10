/**
 * ShortcutGrid — RSC, เมนูลัด grid 4 คอลัมน์ 8 tile (v8)
 *
 * ทำไม: supersede ShortcutPanel.tsx (v7 ใช้ arbitrary class + 6-tile 4+2 layout)
 * v8 เปลี่ยนเป็น Paces token เต็ม (.card/.card-header/.card-title/.card-body)
 * และ grid-cols-4 สม่ำเสมอ 8 tile (2 แถว × 4) ตาม spec T4 + mockup command-center-v8.html FRAME 1
 *
 * ทำไม literal class ไม่ใช้ template string: Tailwind v4 purge scan static text —
 * runtime concat ทำให้ purge ตัด class ทิ้ง → Record literal เต็มทุก branch (NF-5/Hard Rule 7)
 *
 * ทำไม size-12 (48px) ไม่ใช่ w-[50px]: spec NF-4 ต้องการ ≥44px, 48px ผ่าน,
 * และ size-12 เป็น Paces token ไม่ใช่ arbitrary
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (adapt: `.card .card-body` skeleton + icon chip `size-9 bg-primary/15 text-primary rounded-full`
 *  → `.card .card-header .card-title` + chip `size-12 rounded-lg` + 5-way color map)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { SHORTCUT_TILES, type ShortcutTile } from '../_constants/command-center'

/**
 * CHIP — 5-way color map (Paces semantic token เท่านั้น, ห้าม arbitrary/hex)
 * key ตรงกับ ShortcutTile.color ใน _constants/command-center.ts
 * literal เต็มทุก branch เพื่อ Tailwind v4 purge (NF-5)
 */
const CHIP: Record<string, string> = {
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
  info:    'bg-info/15 text-info',
  primary: 'bg-primary/15 text-primary',
  default: 'bg-default-100 text-default-500',
}

/** TileLink — RSC tile เดียว (Link ห่อ chip+label รวม tap area ≥44px — NF-4) */
function TileLink({ tile }: { tile: ShortcutTile }) {
  const chipClass = CHIP[tile.color] ?? CHIP.default

  // tile disabled หรือ href null — ใช้ div แทน Link (ป้องกัน future disabled tile)
  if (tile.disabled || !tile.href) {
    return (
      <div
        className="flex flex-col items-center gap-2 opacity-40 pointer-events-none"
        title="เร็ว ๆ นี้"
        aria-disabled="true"
      >
        {/* chip 48×48 (size-12) rounded-lg — touch area ≥44px (NF-4) */}
        <span className={`size-11 rounded-lg flex items-center justify-center ${chipClass}`}>
          <Icon icon={tile.icon} className="text-2xl" />
        </span>
        <span className="text-xs font-medium text-default-700 text-center leading-tight">
          {tile.label}
        </span>
      </div>
    )
  }

  return (
    <Link
      href={tile.href}
      className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
    >
      {/* chip 48×48 (size-12) rounded-lg — touch area ≥44px (NF-4) */}
      <span className={`size-12 rounded-lg flex items-center justify-center ${chipClass}`}>
        <Icon icon={tile.icon} className="text-2xl" />
      </span>
      {/* text-default-700 (ไม่ใช่ default-400) — a11y contrast */}
      <span className="text-xs font-medium text-default-700 text-center leading-tight">
        {tile.label}
      </span>
    </Link>
  )
}

/** ShortcutGrid — .card header + grid 4 คอลัมน์ 8 tile */
export default function ShortcutGrid() {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">เมนูลัด</h4>
      </div>
      <div className="card-body">
        {/* grid-cols-4 8 tile = 2 แถวละ 4 (ตาม .grid4 ใน mockup command-center-v8.html) */}
        <div className="grid grid-cols-4 gap-x-2 gap-y-3">
          {SHORTCUT_TILES.map((tile: ShortcutTile) => (
            <TileLink key={tile.label} tile={tile} />
          ))}
        </div>
      </div>
    </div>
  )
}
