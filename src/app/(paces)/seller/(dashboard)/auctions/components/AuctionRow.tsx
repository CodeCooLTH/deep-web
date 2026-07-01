'use client'

/**
 * AuctionRow — แถวประมูล 1 รายการ บนมือถือ (flat row, border-top คั่น — ไม่ใช่การ์ดแยกต่อแถว)
 *
 * Base: docs/mockups/auction/seller-auction-v1.html FRAME 1 `.auc`/`.auc-img`/`.auc-body`/
 *   `.auc-top`/`.auc-name`/`.auc-price`/`.auc-meta`/`.auc-menu` (flex row, thumb 64px,
 *   border-top คั่นระหว่างแถว — ห่อด้วย .card เดียวทั้งลิสต์ ไม่ใช่การ์ดแยกต่อแถวแบบ OrderCard)
 *   ผสม pattern divide-y จาก src/components/table/DataTable.tsx (mobileCard rendering)
 *
 * thumb ใช้ <img> ธรรมดา (ไม่ใช่ next/image) เพราะ imageUrl อาจเป็น external URL (seed/CDN)
 * หรือ storage key (/api/files/{key}) — เหมือน pattern OrderCard.tsx ProductImage
 */

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'
import type { SellerAuctionListItemDTO } from '@/services/auction.service'
import { STATUS_BADGE_CLASS, STATUS_LABEL } from './data'
import AuctionMeta from './AuctionMeta'
import AuctionRowMenu from './AuctionRowMenu'

type Props = {
  auction: SellerAuctionListItemDTO
  onPublishRequest: (id: string) => void
  onCancelRequest: (id: string) => void
}

/** thumb 64px + fallback ไอคอนเมื่อโหลดรูปไม่สำเร็จ/ไม่มีรูป */
function Thumb({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-default-200 bg-default-100 text-default-400">
        <Icon icon="photo" className="text-xl" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="size-16 shrink-0 rounded-lg border border-default-200 bg-default-100 object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export default function AuctionRow({ auction, onPublishRequest, onCancelRequest }: Props) {
  const imageUrl = auction.imageUrl
    ? auction.imageUrl.startsWith('http')
      ? auction.imageUrl
      : `/api/files/${auction.imageUrl}`
    : undefined

  return (
    <div className="flex gap-3 px-4 py-3">
      <Thumb src={imageUrl} alt={auction.title} />

      <div className="min-w-0 flex-1">
        {/* .auc-top: ชื่อ + status badge */}
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-default-900">{auction.title}</p>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[auction.status]}`}
          >
            {auction.status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
            {STATUS_LABEL[auction.status]}
          </span>
        </div>

        {/* .auc-price: ราคาปัจจุบัน + จำนวนบิด */}
        <p className="mt-0.5 text-sm font-bold tabular-nums text-primary">
          ฿{auction.currentPrice.toLocaleString('th-TH')}
          <span className="ms-1 text-xs font-medium text-default-400">
            {auction.bidCount > 0 ? `· ${auction.bidCount} บิด` : 'เริ่มต้น · ยังไม่มีบิด'}
          </span>
        </p>

        {/* .auc-meta: countdown/วันที่เปิด/สถานะเพิ่มเติม ตามสถานะ */}
        <div className="mt-0.5">
          <AuctionMeta status={auction.status} endTimeMs={auction.endTimeMs} startTimeMs={auction.startTimeMs} />
        </div>
      </div>

      <AuctionRowMenu
        id={auction.id}
        status={auction.status}
        bidCount={auction.bidCount}
        onPublishRequest={onPublishRequest}
        onCancelRequest={onCancelRequest}
      />
    </div>
  )
}
