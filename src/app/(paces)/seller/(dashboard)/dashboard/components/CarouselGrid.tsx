/**
 * CarouselGrid — การ์ด "เมนูลัด" บน command center (มือถือ)
 *
 * v11 (feature 00027): เลิกใช้ลิสต์ตายตัว `SHORTCUT_TILES` — รายการมาจาก catalog ที่ derive
 * จากเมนู sidebar จริง (สิทธิ์ของผู้ใช้คนนั้น ณ ร้านนั้น) และผู้ใช้เลือกเองได้ผ่านปุ่ม "แก้ไข"
 *
 * ตัด pagination/dots/IntersectionObserver ทิ้งทั้งหมด — เพดานคือ 8 ช่อง ซึ่งพอดี 1 หน้าเสมอ
 * โค้ดแบ่งหน้าจึงเป็น dead code ที่รันทุก render โดยไม่มีวันได้ใช้
 *
 * ชื่อไฟล์ยังเป็น CarouselGrid เพื่อไม่ให้ diff บวมโดยไม่จำเป็น (ไม่ใช่ carousel แล้ว)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (.card/.card-header/.card-title skeleton) — โครงเดิมของไฟล์นี้ ไม่แตะ
 * ปุ่ม "แก้ไข": in-app precedent ActivityTimeline.tsx (ปุ่มข้อความ+ไอคอนบน card-header)
 * Empty state: _shared/SellerEmptyState.tsx (compact) — ปุ่ม action render เองเพราะต้องเปิด
 *   sheet ไม่ใช่ navigate (component เดิมรับได้แต่ href)
 * Design Spec: docs/superpowers/specs/2026-08-02-shortcut-edit-sheet-design-spec.md
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import ShortcutEditSheet from './ShortcutEditSheet'
import type { ShortcutCatalogItemDto, ShortcutStateDto } from '../_constants/command-center'

type Props = {
  initialTiles: ShortcutCatalogItemDto[]
  /** จำนวนประมูลที่กำลังเปิดอยู่ — แปะเป็น badge บนช่อง "การประมูล" (พฤติกรรมเดิม D#13) */
  liveAuctionCount?: number
}

// HR7 carve-out: 30px คือขนาดที่ Design Spec กำหนด และ Paces ไม่มี token ที่ให้ 30px ตรง ๆ
// (text-3xl = 30px ก็จริง แต่ผูก line-height ของ heading มาด้วย ซึ่งดันระยะในกริดเพี้ยน)
const TILE_ICON_CLASS = 'text-primary text-[30px] leading-none' // HR7: arbitrary — ดูเหตุผลด้านบน

// HR7 carve-out: badge เกยมุมไอคอน ต้องใช้ระยะติดลบ + ความกว้างขั้นต่ำที่ Paces ไม่มี token ให้
// คลาสชุดนี้ copy ตรงจาก OrderStatusBand.tsx (badge เดียวกัน คนละที่วาง)
const TILE_BADGE_CLASS =
  'bg-danger text-2xs absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-bold leading-none tabular-nums text-white' // HR7: arbitrary — ดูเหตุผลด้านบน

/** clamp ≥100 → "99+" กัน badge กว้างเกิน (Base pattern: OrderStatusBand.tsx) */
function fmtBadge(n: number): string {
  return n >= 100 ? '99+' : String(n)
}

export default function CarouselGrid({ initialTiles, liveAuctionCount = 0 }: Props) {
  // ถือ state เองเพื่อให้การ์ดอัปเดตทันทีที่แก้ในชีต ไม่ต้องรอปิดชีตหรือ reload หน้า
  const [tiles, setTiles] = useState(initialTiles)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <div className="card">
        <div className="card-header !py-3">
          <h4 className="card-title flex items-center gap-1.5">
            <Icon icon="layout-grid" className="size-4 text-primary" />
            เมนูลัด
          </h4>
          {/* min-h-11 + negative margin: tap target ≥44px โดยไม่ดันความสูง card-header ให้โป่ง
              (บราวเซอร์นับพื้นที่กดจากกล่องของ element ที่กดได้เท่านั้น — .card-header เองกดไม่ได้) */}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-primary -my-2.5 inline-flex min-h-11 items-center gap-1 py-2.5 text-sm font-medium"
          >
            <Icon icon="pencil" className="size-4" />
            แก้ไข
          </button>
        </div>

        <div className="card-body !px-0 !py-4">
          {tiles.length === 0 ? (
            <div className="px-4">
              {/* เกิดได้จริง: ถอดช่องที่หมดสิทธิ์ช่องสุดท้ายออก หรือสิทธิ์หลุดพร้อมกันทุกช่อง
                  icon 'apps-off' — spec ระบุ 'layout-grid-off' แต่ verify แล้วไม่มีในชุด tabler
                  จึงใช้ fallback ที่ spec อนุมัติไว้ (verified มีจริง) */}
              <SellerEmptyState
                compact
                icon="apps-off"
                title="ยังไม่มีเมนูลัด"
                description="เลือกเมนูที่ใช้บ่อยมาไว้ตรงนี้ เพื่อกดถึงได้ในคลิกเดียว"
              />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn bg-primary hover:bg-primary-hover min-h-11 rounded-full px-6 text-sm font-medium text-white"
                >
                  ตั้งเมนูลัด
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 px-4">
              {tiles.map((tile) => (
                <TileItem
                  key={tile.slug}
                  tile={tile}
                  badgeCount={tile.slug === 'seller:auctions' ? liveAuctionCount : 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ShortcutEditSheet
          onClose={() => setEditing(false)}
          onSync={(state: ShortcutStateDto) => setTiles(state.tiles)}
        />
      )}
    </>
  )
}

function TileItem({ tile, badgeCount }: { tile: ShortcutCatalogItemDto; badgeCount: number }) {
  const badgeText = badgeCount > 0 ? fmtBadge(badgeCount) : null

  return (
    <Link href={tile.url} className="flex flex-col items-center gap-2 transition-transform active:scale-95">
      <span className="relative inline-flex items-center justify-center">
        <Icon icon={tile.icon} className={TILE_ICON_CLASS} aria-hidden="true" />
        {badgeText !== null && <span className={TILE_BADGE_CLASS}>{badgeText}</span>}
      </span>
      {/* text-2xs = 11px (ดู _root.css); text-default-700 เพื่อ contrast ผ่าน AA */}
      <span className={cn('text-2xs text-default-700 text-center leading-tight')}>{tile.label}</span>
    </Link>
  )
}
