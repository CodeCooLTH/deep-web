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
 */

import { useState } from 'react'
import { relativeTimeTh } from '@/lib/relative-time-th'
import type { BidDTO } from '@/services/auction.service'

type Props = {
  bidHistory: BidDTO[]
  bidCount: number
}

function getInitial(name: string): string {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

export default function AuctionBidFeed({ bidHistory, bidCount }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? bidHistory : bidHistory.slice(0, 5)
  const hiddenCount = bidHistory.length - visible.length

  return (
    <div className="card">
      <div className="card-header justify-between">
        <h4 className="card-title">ประวัติการเสนอราคา</h4>
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
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      isLeader ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {getInitial(bid.bidder)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-0 flex items-center gap-1.5 truncate text-sm font-medium text-default-800">
                      {bid.bidder}
                      {isLeader && (
                        <span className="badge badge-label bg-success/15 text-success shrink-0 text-2xs">
                          ผู้นำ
                        </span>
                      )}
                    </p>
                    <p className="text-default-400 mb-0 text-xs">{relativeTimeTh(bid.atMs)}</p>
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
