'use client'

/**
 * AuctionLiveStrip — แถบ "LIVE กำลังประมูลตอนนี้" (การ์ดแนวนอน scroll-x) — desktop เท่านั้น
 *
 * Base: docs/mockups/auction/seller-auction-v1.html D1 (บรรทัด 906-917) `.livestrip`/`.livecard`/
 *   `.lh`/`.live-badge`/`.cdov`/`.lb`/`.lname`/`.lprice`/`.lmeta`
 *   theme card + absolute badge overlay: theme/paces/Admin/TS/src/app/(admin)/apps/blog/grid/components/Blog.tsx
 *   (.card > relative image + badge absolute) — adapt: badge LIVE = solid danger, เพิ่ม overlay countdown มุมล่างขวา
 *   horizontal-scroll container: pattern เดียวกับ sibling AuctionStatStrip.tsx (flex overflow-x-auto — token ล้วน)
 *
 * ปรับจาก mockup (SSOT หน้าตา) 2 จุด ตามข้อมูลจริง:
 *   - "142 กำลังดู" (concurrent viewer) = impossible-data (ไม่มี presence tracking; ทีมตัด viewer count
 *     ออกไปแล้ว Batch E#11) → ใช้ "ติดตาม N" = COUNT WatchList แทน
 *   - width 248px/font 17px = นอก token scale → map เป็น token ใกล้สุด (w-64/text-lg) ตามมติ user
 *
 * thumb ใช้ <img> + onError fallback (imageUrl external URL หรือ storage key) — pattern เดียวกับ AuctionRow.Thumb
 */

import Link from 'next/link'
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import AuctionCountdown from '../../_shared/AuctionCountdown'
import { formatDateTime } from '@/lib/format-date'

export type LiveStripItem = {
  id: string
  title: string
  imageUrl: string
  currentPrice: number
  bidCount: number
  endTimeMs: number
  startTimeMs: number | null
  /** 'live' | 'scheduled' — strip แสดงเฉพาะ 2 สถานะนี้ (ตาม mockup: live card + "เริ่มเร็ว ๆ นี้") */
  status: 'live' | 'scheduled'
  watchCount: number
}

/** รูป cover 112px + fallback ไอคอน (เหมือน AuctionRow.Thumb แต่เป็น cover เต็มความกว้างการ์ด) */
function CoverThumb({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="flex h-28 w-full items-center justify-center bg-default-100 text-default-300">
        <Icon icon="photo" className="text-3xl" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-28 w-full bg-default-100 object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function resolveImg(imageUrl: string): string | undefined {
  if (!imageUrl) return undefined
  return imageUrl.startsWith('http') ? imageUrl : `/api/files/${imageUrl}`
}

export default function AuctionLiveStrip({ items }: { items: LiveStripItem[] }) {
  // ไม่มีรายการ live/scheduled → ซ่อนทั้ง section (ไม่โชว์ header ลอย)
  if (items.length === 0) return null

  return (
    // desktop เท่านั้น (mockup ไม่มี mobile variant ของ strip)
    <div className="mb-base hidden lg:block">
      {/* header: LIVE badge (success soft + pulse) + ข้อความ */}
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-default-900">
        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          LIVE
        </span>
        กำลังประมูลตอนนี้
      </div>

      {/* strip: การ์ดแนวนอน scroll-x (pattern เดียวกับ AuctionStatStrip) */}
      <div className="flex gap-base overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <Link
            key={it.id}
            href={`/auctions/${it.id}`}
            className="card w-64 shrink-0 overflow-hidden transition-shadow hover:shadow-lg"
          >
            {/* รูป cover + overlay 2 badge */}
            <div className="relative">
              <CoverThumb src={resolveImg(it.imageUrl)} alt={it.title} />

              {/* top-left: LIVE (solid danger) / "เริ่มเร็ว ๆ นี้" (info) */}
              {it.status === 'live' ? (
                <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">
                  <span className="size-1.5 animate-pulse rounded-full bg-white" />
                  LIVE
                </span>
              ) : (
                <span className="absolute start-2 top-2 rounded-full bg-info px-2 py-0.5 text-xs font-bold text-white">
                  เริ่มเร็ว ๆ นี้
                </span>
              )}

              {/* bottom-right: countdown (live) / เวลาเปิด (scheduled) — overlay dark/70 */}
              <span className="absolute bottom-2 end-2 rounded bg-dark/70 px-2 py-0.5 text-xs font-bold text-white">
                {it.status === 'live' ? (
                  <AuctionCountdown endTimeMs={it.endTimeMs} className="text-white" />
                ) : it.startTimeMs ? (
                  formatDateTime(it.startTimeMs)
                ) : (
                  'เร็ว ๆ นี้'
                )}
              </span>
            </div>

            {/* body: ชื่อ + ราคา + meta */}
            <div className="card-body !p-3">
              <p className="truncate text-sm font-semibold text-default-900">{it.title}</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-primary">
                ฿{it.currentPrice.toLocaleString('th-TH')}
                {it.status === 'scheduled' && (
                  <span className="ms-1 text-xs font-medium text-default-400">เริ่มต้น</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-default-500">
                {it.status === 'live'
                  ? `${it.bidCount > 0 ? `${it.bidCount} บิด` : 'ยังไม่มีบิด'} · ${
                      it.watchCount > 0 ? `ติดตาม ${it.watchCount}` : 'ยังไม่มีคนติดตาม'
                    }`
                  : 'รอเปิดประมูล'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
