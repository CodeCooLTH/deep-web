'use client'

/**
 * AuctionBidVelocity — "ความถี่การบิด" (bar histogram) + อัตราการบิด (บิด/นาที)
 *
 * Base: docs/mockups/auction/seller-auction-v1.html Frame3/D3 `.velo`/`.velo-h`/`.velo-bars`
 *   (bar histogram = plain div height% ไม่ใช่ chart lib → ไม่เข้า HR10; ใช้ Paces token bg-primary/15
 *    + bg-primary(hot) + bg-danger(now) เหมือน mockup .velo-bars span/.hot/.now)
 *   card shell ยึด sibling AuctionBidFeed.tsx (card/card-header/card-body)
 *
 * ⚠️ scope (skill mockup-to-nextjs FLAG gate — user เคาะ "ทำเฉพาะที่ทำได้จริง"):
 *   คำนวณจาก bidHistory (SSR top 20) ที่มีอยู่แล้ว — ไม่แตะ backend/ไม่สร้าง endpoint ใหม่
 *   → ถ้า bidCount > 20 ป้ายกำกับว่า "จากบิดล่าสุด N รายการ" (ไม่ fake ครบทั้งหมด)
 *   ตัด metric ที่ไม่มี data จริงออกตาม mockup (พีคผู้ชม/คาดราคาปิด/โมเมนตัม = impossible/ไม่มีสูตร)
 *
 * anchor bucket ที่เวลาบิด "ล่าสุด" (max atMs) ไม่ใช่ Date.now() → SSR-safe (ไม่มี hydration mismatch)
 * height ของ bar = inline style % (data-driven ไม่ใช่ design token — เหมือน progress bar fill, ไม่ผิด HR7)
 */

import type { BidDTO } from '@/services/auction.service'
import Icon from '@/components/wrappers/Icon'

type Props = {
  bidHistory: BidDTO[]
  bidCount: number
}

const BUCKETS = 12

export default function AuctionBidVelocity({ bidHistory, bidCount }: Props) {
  // ต้องมีอย่างน้อย 2 บิดจึงมีช่วงเวลาให้คิดความถี่
  if (bidHistory.length < 2) return null

  const sorted = [...bidHistory].sort((a, b) => a.atMs - b.atMs)
  const firstMs = sorted[0].atMs
  const lastMs = sorted[sorted.length - 1].atMs
  const spanMs = lastMs - firstMs
  if (spanMs <= 0) return null

  // histogram: แบ่ง [firstMs, lastMs] เป็น BUCKETS ช่วงเท่า ๆ กัน นับบิดต่อช่วง
  const bucketMs = spanMs / BUCKETS
  const counts = new Array(BUCKETS).fill(0)
  for (const b of sorted) {
    let i = Math.floor((b.atMs - firstMs) / bucketMs)
    if (i >= BUCKETS) i = BUCKETS - 1
    counts[i]++
  }
  const maxCount = Math.max(...counts, 1)

  // อัตราการบิด = จำนวนบิด (ที่มี) หารด้วยช่วงเวลาเป็นนาที
  const spanMin = spanMs / 60000
  const rate = spanMin > 0 ? sorted.length / spanMin : 0

  // เร่งช่วงท้าย: ครึ่งหลังถี่กว่าครึ่งแรก
  const firstHalf = counts.slice(0, BUCKETS / 2).reduce((s, c) => s + c, 0)
  const lastHalf = counts.slice(BUCKETS / 2).reduce((s, c) => s + c, 0)
  const accelerating = lastHalf > firstHalf

  return (
    <div className="card">
      <div className="card-header justify-between">
        <h4 className="card-title">ความถี่การบิด</h4>
        {accelerating && (
          <span className="badge badge-label bg-danger/15 text-danger text-2xs inline-flex items-center gap-1"><Icon icon="flame" className="text-2xs" /> พุ่งช่วงท้าย</span>
        )}
      </div>
      <div className="card-body">
        {/* บาร์ histogram — bar สุดท้าย (ล่าสุด) เน้น danger, ครึ่งหลังเน้น primary */}
        <div className="flex h-12 items-end gap-1">
          {counts.map((c, i) => {
            const isNow = i === BUCKETS - 1
            const isHot = !isNow && i >= BUCKETS / 2
            const pct = Math.max(6, Math.round((c / maxCount) * 100))
            return (
              <span
                key={i}
                className={`flex-1 rounded-t ${isNow ? 'bg-danger' : isHot ? 'bg-primary' : 'bg-primary/15'}`}
                // height data-driven (สัดส่วนจำนวนบิด) — inline style ไม่ใช่ arbitrary token (เหมือน progress fill)
                style={{ height: `${pct}%` }}
              />
            )
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-dashed border-default-200 pt-3">
          <div>
            <p className="text-default-500 mb-0 text-xs">อัตราการบิด</p>
            <p className="mb-0 text-lg font-bold tabular-nums text-default-900">
              {rate.toFixed(1)} <span className="text-xs font-medium text-default-400">บิด/นาที</span>
            </p>
          </div>
          {bidCount > bidHistory.length && (
            <p className="text-default-400 mb-0 self-end text-2xs">จากบิดล่าสุด {bidHistory.length} รายการ</p>
          )}
        </div>
      </div>
    </div>
  )
}
