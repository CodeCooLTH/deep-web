'use client'

/**
 * AuctionBidFeed — static bid list (Batch E#11) จาก `bidHistory` ที่ SSR ส่งมา (top 20)
 * ยังไม่ subscribe realtime (Batch #12 จะรับ state ต่อจาก parent ผ่าน setter เดียวกัน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/
 *   ShippingActivity.tsx (list item pattern) ผสม avatar-initials circle จาก
 *   src/app/(paces)/seller/(dashboard)/reviews/components/ProductReviews.tsx
 *   (`bg-primary/10 text-primary rounded-full` — L76/269)
 *
 * โชว์ top 5 ก่อน + ปุ่ม "ดูก่อนหน้า (N)" ขยายเต็ม 20 แถว; แถวบนสุด (bidHistory[0], createdAt ล่าสุด)
 * = ผู้นำปัจจุบัน (ราคาสูงสุดเสมอ เพราะระบบรับเฉพาะบิดที่สูงกว่าราคาปัจจุบัน) → highlight เด่น
 *
 * ⚠️ ข้อจำกัด scope (flag ให้ Controller): `BidDTO` มีแค่ `{id, amount, bidder, atMs}` ไม่มี
 * `successfulBidCount`/`bidderId` — จึงคำนวณ "Lv badge" (`getAuctionLevel`) ของผู้บิดแต่ละคนไม่ได้ในรอบนี้
 * (task ระบุ "ห้ามแตะ auction.service.ts ยกเว้นเพิ่ม orderId" เท่านั้น — ขยาย BidDTO ต้องรอ batch ถัดไป)
 * → ตัด Lv badge ออกจากแถว (ไม่ fake ข้อมูล) ส่วนที่เหลือ (avatar/ชื่อ/ราคา/เวลา) ครบตามสเปก
 *
 * ซ่อนไอคอน block ตาม OOS-2 (ยังไม่มีฟีเจอร์บล็อกผู้บิดใน MVP scope นี้)
 *
 * Batch E#12: เพิ่ม connection indicator ("● สด" / "⟳ กำลังเชื่อมต่อใหม่...") ข้าง card-title —
 * รับ `connectionState` จาก parent (`AuctionConsoleClient` ผูก Supabase Realtime); `undefined`
 * (auction ไม่ใช่ status live) = ไม่แสดง indicator เลย (static list เหมือนเดิม)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { relativeTimeTh } from '@/lib/relative-time-th'
import type { BidDTO } from '@/services/auction.service'
import { toFileUrl } from '@/lib/file-url'

type ConnectionState = 'live' | 'reconnecting'

// สี badge ต่อ bidder level (ladder feat 00002) — Paces semantic token (HR7)
const LEVEL_CLASS: Record<number, string> = {
  5: 'bg-warning/15 text-warning',
  4: 'bg-info/15 text-info',
  3: 'bg-primary/15 text-primary',
  2: 'bg-default-100 text-default-600',
  1: 'bg-default-100 text-default-400',
}

type Props = {
  bidHistory: BidDTO[]
  bidCount: number
  connectionState?: ConnectionState
}

function getInitial(name: string): string {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

/** avatar bidder (รูปจริง + fallback initials) — avatar อาจเป็น http URL (FB) หรือ storage key */
function BidderAvatar({ avatar, name, isLeader }: { avatar: string | null; name: string; isLeader: boolean }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (toFileUrl(avatar)) : null
  if (!src || failed) {
    return (
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          isLeader ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
        }`}
      >
        {getInitial(name)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-9 shrink-0 rounded-full bg-default-100 object-cover"
    />
  )
}

export default function AuctionBidFeed({ bidHistory, bidCount, connectionState }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? bidHistory : bidHistory.slice(0, 5)
  const hiddenCount = bidHistory.length - visible.length

  return (
    <div className="card">
      <div className="card-header justify-between">
        <div className="flex items-center gap-2">
          <h4 className="card-title">ประวัติการเสนอราคา</h4>
          {connectionState === 'live' && (
            <span className="badge badge-label bg-success/15 text-success text-2xs">● สด</span>
          )}
          {connectionState === 'reconnecting' && (
            <span className="badge badge-label bg-warning/15 text-warning text-2xs">⟳ กำลังเชื่อมต่อใหม่...</span>
          )}
        </div>
        {bidCount > bidHistory.length && (
          <span className="text-default-400 text-xs">แสดง {bidHistory.length} ล่าสุด จาก {bidCount} บิด</span>
        )}
      </div>
      <div className="card-body">
        {bidHistory.length === 0 ? (
          <p className="text-default-400 py-4 text-center text-sm">ยังไม่มีการเสนอราคา</p>
        ) : (
          <ul className="divide-y divide-default-100">
            {visible.map((bid, idx) => {
              const isLeader = idx === 0
              return (
                <li key={bid.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <BidderAvatar avatar={bid.avatar} name={bid.bidder} isLeader={isLeader} />
                  <div className="min-w-0 flex-1">
                    <p className="mb-0 flex items-center gap-1.5 text-sm font-medium text-default-800">
                      <span className="truncate">{bid.bidder}</span>
                      {/* bidder level badge (ladder จาก successfulBidCount, TFR-016) */}
                      <span
                        className={`badge badge-label inline-flex shrink-0 items-center gap-0.5 text-2xs ${LEVEL_CLASS[bid.level.level]}`}
                      >
                        <Icon icon={bid.level.icon.replace('tabler-', '')} className="text-2xs" />
                        {bid.level.label}
                      </span>
                      {isLeader && (
                        <span className="badge badge-label bg-success/15 text-success shrink-0 text-2xs">
                          ผู้นำ
                        </span>
                      )}
                    </p>
                    <p className="text-default-400 mb-0 flex items-center gap-2 text-xs">
                      {relativeTimeTh(bid.atMs)}
                      {/* reaction count read-only (feat 00005, OQ-2 seller ไม่กด) */}
                      {bid.reactionCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-danger">
                          <Icon icon="heart-filled" className="text-2xs" />
                          {bid.reactionCount}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="tabular-nums shrink-0 text-sm font-bold text-primary">
                    ฿{bid.amount.toLocaleString('th-TH')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-primary mt-2 w-full text-center text-sm font-medium hover:underline"
          >
            ดูก่อนหน้า ({hiddenCount})
          </button>
        )}
      </div>
    </div>
  )
}
