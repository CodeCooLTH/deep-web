/**
 * ShortcutPanel — RSC, 6-tile shortcut grid 4+2 (v7)
 *
 * ทำไม: design v7 เพิ่มสีแต่ละ tile ให้ต่างกัน (5-way color) + เพิ่ม tile size 50px
 * grid 4 cols แถวบน (tile 0-3), grid 2 cols centered แถวล่าง (tile 4-5)
 * tile "การยืนยัน" = link ปกติ ไม่ disabled (spec Q4)
 *
 * ทำไม literal class ไม่ใช้ template string: Tailwind v4 purge scan static text —
 * runtime concat ทำให้ purge ตัด class ทิ้ง → record literal เต็มทุก branch (NF-5)
 *
 * คง disabled pattern (opacity-40 pointer-events-none) ไว้ป้องกัน future tile ที่ยังไม่พร้อม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (adapt: icon slot `size-9 bg-primary/15 rounded-full` → `w-[50px] h-[50px] rounded-[13px]` + color 5-way)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { SHORTCUT_TILES, type ShortcutTile } from '../_constants/command-center'

/*
 * COLOR_BOX / COLOR_ICON — literal class เต็มทุกค่า (NF-5 HARD)
 * ห้าม template-concat เช่น `bg-[rgba(${r},${g},${b},0.14)]`
 * Tailwind v4 purge ต้องเห็น full string ในไฟล์นี้เพื่อไม่ถูกตัดทิ้ง
 */
const COLOR_BOX: Record<string, string> = {
  amber:  'bg-[rgba(255,159,67,0.14)]',
  green:  'bg-[rgba(40,199,111,0.14)]',
  cyan:   'bg-[rgba(0,186,209,0.13)]',
  primary: 'bg-primary/10',
  gray:   'bg-[#F2F1F6]',
}
const COLOR_ICON: Record<string, string> = {
  amber:  'text-[#FF9F43]',
  green:  'text-[#28C76F]',
  cyan:   'text-[#00BAD1]',
  primary: 'text-primary',
  gray:   'text-[rgba(47,43,61,0.60)]',
}

/** render tile เดียว — reuse ทั้งแถวบนและแถวล่าง */
function TileItem({ tile }: { tile: ShortcutTile }) {
  const boxClass = COLOR_BOX[tile.color] ?? COLOR_BOX.gray
  const iconClass = COLOR_ICON[tile.color] ?? COLOR_ICON.gray

  // tile disabled — ไม่ navigate, opacity-40 pointer-events-none (คง pattern กัน future disabled tile)
  if (tile.disabled || !tile.href) {
    return (
      <div
        className="flex flex-col items-center gap-1 opacity-40 pointer-events-none"
        title="เร็ว ๆ นี้"
        aria-disabled="true"
      >
        {/* tile-box 50×50 rounded-[13px] — touch area ≥44px (50px ผ่าน NF-4) */}
        <span className={`w-[50px] h-[50px] rounded-[13px] ${boxClass} flex items-center justify-center`}>
          <Icon icon={tile.icon} className={`text-[24px] ${iconClass}`} />
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
      href={tile.href}
      className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
    >
      {/* tile-box 50×50 rounded-[13px] — touch area ≥44px (50px ผ่าน NF-4) */}
      <span className={`w-[50px] h-[50px] rounded-[13px] ${boxClass} flex items-center justify-center`}>
        <Icon icon={tile.icon} className={`text-[24px] ${iconClass}`} />
      </span>
      <span className="text-[11.5px] font-medium text-[rgba(47,43,61,0.70)] leading-tight">
        {tile.label}
      </span>
    </Link>
  )
}

export default function ShortcutPanel() {
  return (
    <section className="mb-3">
      {/* sec-label v7 — weight 600, ink-70, ตาม mockup .sec-label */}
      <p className="text-[13px] font-semibold text-[rgba(47,43,61,0.70)] mb-2 pl-[2px]">เมนูลัด</p>

      {/* card wrapper v7 — rounded-[14px] shadow-sm bg ขาว */}
      <div className="bg-white rounded-[14px] shadow-[0_2px_8px_rgba(47,43,61,0.07)] px-2 py-2">

        {/* แถวบน: grid 4 cols (tile 0-3) */}
        <div className="grid grid-cols-4 gap-y-2">
          {SHORTCUT_TILES.slice(0, 4).map((tile: ShortcutTile) => (
            <TileItem key={tile.label} tile={tile} />
          ))}
        </div>

        {/* แถวล่าง: grid 2 cols centered max-w-[200px] (tile 4-5) */}
        <div className="grid grid-cols-2 gap-y-2 max-w-[200px] mx-auto mt-2">
          {SHORTCUT_TILES.slice(4).map((tile: ShortcutTile) => (
            <TileItem key={tile.label} tile={tile} />
          ))}
        </div>

      </div>
    </section>
  )
}
