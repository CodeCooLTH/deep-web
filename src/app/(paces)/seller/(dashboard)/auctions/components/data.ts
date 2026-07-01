/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/data.ts
 * (STATUS_CONFIG/label-map pattern; ค่า status เองเป็น SafePay-specific ตาม Auction.status enum
 * — ดู src/services/auction.service.ts `PublicAuctionDTO['status']`)
 */

import type { SellerAuctionListItemDTO } from '@/services/auction.service'

export type AuctionStatus = SellerAuctionListItemDTO['status']

/** ป้ายชื่อภาษาไทยต่อสถานะ */
export const STATUS_LABEL: Record<AuctionStatus, string> = {
  draft: 'ฉบับร่าง',
  scheduled: 'รอเปิด',
  live: 'กำลังประมูล',
  ended: 'จบแล้ว',
  unsold: 'ขายไม่ออก',
  cancelled: 'ยกเลิก',
}

/** สี badge ต่อสถานะ (Hard Rule 7 — semantic token เท่านั้น ห้าม hex)
 * draft=default · scheduled=info · live=success(+pulse dot) · ended=primary · unsold=warning · cancelled=danger
 */
export const STATUS_BADGE_CLASS: Record<AuctionStatus, string> = {
  draft: 'bg-default-100 text-default-500',
  scheduled: 'bg-info/15 text-info',
  live: 'bg-success/15 text-success',
  ended: 'bg-primary/15 text-primary',
  unsold: 'bg-warning/15 text-warning',
  cancelled: 'bg-danger/15 text-danger',
}

/** chip filter tabs — 'all' + 6 สถานะจริง (ใช้ทั้ง mobile และ desktop toolbar) */
export const STATUS_TABS: { value: 'all' | AuctionStatus; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'scheduled', label: 'รอเปิด' },
  { value: 'live', label: 'กำลังประมูล' },
  { value: 'ended', label: 'จบแล้ว' },
  { value: 'unsold', label: 'ขายไม่ออก' },
  { value: 'cancelled', label: 'ยกเลิก' },
]
