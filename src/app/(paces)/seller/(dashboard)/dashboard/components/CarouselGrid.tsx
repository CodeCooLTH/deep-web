/**
 * CarouselGrid — 'use client', เมนูลัด carousel แบ่งหน้า (v10)
 *
 * ทำไม: v8 ShortcutGrid เป็น RSC static grid 8 tile — v10 เพิ่ม carousel page-snap
 * รองรับ tiles จำนวนไม่จำกัด (4 col × 2 row = 8/หน้า; เกิน → หน้าใหม่ + dot pagination)
 * IntersectionObserver คอย observe แต่ละ page → อัปเดต activePage → dot active
 *
 * ทำไมไม่ใช้ Preline hs-carousel: absolute layout พัง re-render (เหมือน FilterDropdown —
 * ดู project_filterdropdown_reusable.md); ใช้ native scroll-snap แทน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * (adapt: `.card .card-header .card-title` skeleton + icon color semantic map;
 *  carousel overflow-x-auto/snap เพิ่มเอง; ShortcutGrid.tsx = intermediate adapt ref)
 */

'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import type { ShortcutTile } from '../_constants/command-center'

// ─── Props ────────────────────────────────────────────────────────────────────

interface CarouselGridProps {
  tiles: ShortcutTile[]
}

// ─── Icon color map ───────────────────────────────────────────────────────────
/**
 * ทำไม literal record เต็ม: Tailwind v4 purge scan static text —
 * runtime concat ทำให้ purge ตัด class ทิ้ง (เหมือน NF-5 ใน ShortcutGrid)
 * ห้าม hardcode hex/#7367F0 (Vuexy); ใช้ Paces semantic token เท่านั้น
 */
const ICON_COLOR: Record<string, string> = {
  primary: 'text-primary',
  warning: 'text-warning',
  success: 'text-success',
  info:    'text-info',
  default: 'text-default-500',
  danger:  'text-danger',
}

// ─── TileItem ─────────────────────────────────────────────────────────────────

// clamp count ≥100 → "99+" กัน badge กว้างเกิน (Base pattern: OrderStatusBand.tsx fmtBadge)
function fmtBadge(n: number): string {
  if (n >= 100) return '99+'
  return String(n)
}

function TileItem({ tile }: { tile: ShortcutTile }) {
  const colorClass = ICON_COLOR[tile.color] ?? ICON_COLOR.default

  // D#13: icon บาง tile (เช่น ประมูล) ใช้ prefix เต็ม (`tabler:gavel`) มาแล้ว — เช็ค ":"
  // ก่อนเติม "solar:" กัน backward-compat พัง (7 tile เดิมไม่มี ":" ยังได้ solar เหมือนเดิม)
  const iconName = tile.icon.includes(':') ? tile.icon : `solar:${tile.icon}`

  // D#13: badge ตัวเลขมุมขวาบน icon — แสดงเฉพาะ showBadge=true และ badgeCount>0
  // Base pattern: OrderStatusBand.tsx badge (bg-danger text-white rounded-full text-2xs)
  const badgeText = tile.showBadge && tile.badgeCount && tile.badgeCount > 0 ? fmtBadge(tile.badgeCount) : null

  const inner = (
    <>
      {/* icon wrapper: relative เพื่อ position badge absolute (Base: OrderStatusBand.tsx) */}
      <span className="relative inline-flex items-center justify-center">
        {/* icon ล้วนไม่มี circle/box/border ครอบ (flat ตาม spec §3 + mockup .g-ic) */}
        {/* HR7: text-[30px] — arbitrary เพราะ Paces ไม่มี text-3xl ที่ให้ขนาด 30px ตรง;
             spec กำหนด ~30px; size-* ไม่ใช้กับ icon font size */}
        <Icon
          icon={iconName}
          className={`${colorClass} text-[30px] leading-none`}
          aria-hidden="true"
        />
        {badgeText !== null && (
          /* arbitrary: -top-1.5/-right-2/min-w-[16px] — Base ตรงจาก OrderStatusBand.tsx badge
             (Paces ไม่มี token สำหรับ negative offset ของ absolute badge overlap มุมไอคอน) — HR7 */
          <span
            className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-danger text-white rounded-full text-2xs font-bold flex items-center justify-center leading-none tabular-nums"
          >
            {badgeText}
          </span>
        )}
      </span>
      {/* text-2xs = 11px (ดู _root.css); text-default-700 เพื่อ a11y contrast */}
      <span className="text-2xs text-default-700 text-center leading-tight">
        {tile.label}
      </span>
    </>
  )

  if (tile.disabled || !tile.href) {
    return (
      <div
        className="flex flex-col items-center gap-2 opacity-40 pointer-events-none"
        aria-disabled="true"
        title="เร็ว ๆ นี้"
      >
        {inner}
        {/* label เพิ่ม "เร็ว ๆ นี้" ใต้ label จริง (ตาม spec disabled tile) */}
        <span className="text-2xs text-default-400 text-center -mt-1">เร็ว ๆ นี้</span>
      </div>
    )
  }

  return (
    <Link
      href={tile.href}
      className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
    >
      {inner}
    </Link>
  )
}

// ─── CarouselGrid ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 8 // 4 col × 2 row = 8 tile/หน้า (spec §4.3)

export default function CarouselGrid({ tiles }: CarouselGridProps) {
  // แบ่ง tiles เป็น pages ละ PAGE_SIZE
  const pages: ShortcutTile[][] = []
  for (let i = 0; i < tiles.length; i += PAGE_SIZE) {
    pages.push(tiles.slice(i, i + PAGE_SIZE))
  }

  const [activePage, setActivePage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  // IntersectionObserver: observe แต่ละ page — เมื่อ page visible ≥50% → setActivePage
  const observerRef = useRef<IntersectionObserver | null>(null)

  const setupObserver = useCallback(() => {
    if (observerRef.current) observerRef.current.disconnect()
    if (pages.length <= 1) return // 1 หน้า ไม่ต้อง observe

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement)
            if (idx !== -1) setActivePage(idx)
          }
        })
      },
      {
        root: scrollRef.current,
        threshold: 0.5, // visible ≥50% ถือว่า active
      }
    )

    pageRefs.current.forEach((el) => {
      if (el) observerRef.current!.observe(el)
    })
  }, [pages.length])

  useEffect(() => {
    setupObserver()
    return () => observerRef.current?.disconnect()
  }, [setupObserver])

  const showDots = pages.length > 1

  return (
    <div className="card">
      {/* card-header: ชื่อ + optional link ทั้งหมด (spec §4.3) */}
      <div className="card-header">
        <h4 className="card-title">เมนูลัด</h4>
        {/* "ทั้งหมด" optional — แสดงเฉพาะ tiles มี href ทุกตัว (ปัจจุบัน = 7 tile มี disabled บางตัว) */}
      </div>

      {/* card-body padding ข้าง 0 — carousel เลื่อนชนขอบ (spec §4.3) */}
      <div className="card-body !px-0">

        {/* Scroll container:
            HR7: overflow-x-auto snap-x snap-mandatory — Tailwind utility scroll-snap
            [&::-webkit-scrollbar]:hidden — arbitrary selector เพื่อซ่อน scrollbar Chrome/Safari
            (Paces ไม่มี scrollbar-hide utility; scrollbar-width:none ทำงาน Firefox ผ่าน
             arbitrary CSS ไม่ได้ใน Tailwind v4 โดยตรง → ใช้ selector นี้ + pb-0)
            ยอมรับ arbitrary: carousel behavior เป็น design ที่ user เลือก (spec §10) */}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }} /* Firefox — inline style เพราะ Tailwind ไม่มี utility */
        >
          {pages.map((pageTiles, pageIdx) => (
            <div
              key={pageIdx}
              ref={(el) => { pageRefs.current[pageIdx] = el }}
              /* HR7: shrink-0 w-full snap-start — scroll-snap page alignment;
                 grid-cols-4 gap-x-2 gap-y-3 px-4 — Paces token ยกเว้น gap/px ที่เป็น Tailwind scale */
              className="shrink-0 w-full snap-start grid grid-cols-4 gap-x-2 gap-y-3 px-4"
            >
              {pageTiles.map((tile) => (
                <TileItem key={tile.label} tile={tile} />
              ))}
            </div>
          ))}
        </div>

        {/* Dot pagination — แสดงเฉพาะ pages >1 (spec §4.3) */}
        {showDots && (
          <div className="flex justify-center gap-1.5 mt-3 mb-1" role="tablist" aria-label="หน้าเมนูลัด">
            {pages.map((_, idx) => (
              <button
                key={idx}
                role="tab"
                aria-selected={activePage === idx}
                aria-label={`หน้า ${idx + 1}`}
                onClick={() => {
                  // scroll page ที่กดตรง ๆ โดยใช้ scrollLeft
                  const container = scrollRef.current
                  if (!container) return
                  const page = pageRefs.current[idx]
                  if (!page) return
                  container.scrollTo({ left: page.offsetLeft, behavior: 'smooth' })
                }}
                // dot active: w-4 bg-primary; inactive: w-1.5 bg-default-300 (spec §4.3)
                // rounded-full = Paces token
                className={[
                  'h-1.5 rounded-full transition-all duration-200 border-0 p-0 cursor-pointer',
                  activePage === idx
                    ? 'w-4 bg-primary'
                    : 'w-1.5 bg-default-300',
                ].join(' ')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
