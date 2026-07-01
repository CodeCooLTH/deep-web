/**
 * AuctionInfoCard — kv card ข้อมูลตั้งต้นของประมูล (ขั้นบิด/reserve/ซื้อทันที/เวลาเปิด-ปิด)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetails.tsx
 *   (icon-in-circle + label/value list — Base เดิมของไฟล์นั้นคือ theme
 *   .../order-details/components/CustomerDetails.tsx)
 *
 * PII: แสดงแค่ตัวเลข/เวลาของ auction เอง ไม่มีข้อมูลผู้ใช้ใด ๆ ในการ์ดนี้
 *
 * ⚠️ ข้อจำกัด scope: ไม่แสดง "ราคาเริ่มต้น" (startPrice) — เหตุผลเดียวกับ AuctionControlPanel.tsx
 * (DTO ไม่มี field นี้, ห้ามขยาย DTO เกิน orderId ในรอบนี้)
 * reserve แสดงแค่ "มี"/"ไม่มี" (ไม่โชว์ตัวเลขจริง) ตาม UI-DESIGN-SPEC §3 — ใช้ `hasReserve` boolean
 * ที่มีอยู่แล้วใน DTO (ไม่ใช่ `reservePrice` ตัวเลข)
 */

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import type { SellerAuctionDTO } from '@/services/auction.service'

type Props = {
  auction: SellerAuctionDTO
}

const Row = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <li>
    <div className="flex items-start gap-2.5">
      <span className="btn btn-icon bg-light text-default-800 size-6! shrink-0 rounded-full">
        <Icon icon={icon} className="text-sm" />
      </span>
      <div>
        <p className="text-default-400 mb-0.5 text-xs">{label}</p>
        <p className="text-default-800 mb-0 text-sm">{value}</p>
      </div>
    </div>
  </li>
)

export default function AuctionInfoCard({ auction }: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รายละเอียดประมูล</h4>
      </div>
      <div className="card-body">
        <ul className="space-y-2.5">
          <Row icon="trending-up" label="ขั้นบิด" value={`฿${auction.bidIncrement.toLocaleString('th-TH')}`} />
          <Row icon="shield-lock" label="ราคาขั้นต่ำที่ยอมขาย (Reserve)" value={auction.hasReserve ? 'มี' : 'ไม่มี'} />
          <Row
            icon="bolt"
            label="ซื้อทันที"
            value={auction.buyNowPrice != null ? `฿${auction.buyNowPrice.toLocaleString('th-TH')}` : 'ไม่มี'}
          />
          <Row
            icon="player-play"
            label="เวลาเปิดประมูล"
            value={auction.startTimeMs ? formatDateTime(auction.startTimeMs) : 'เปิดทันที'}
          />
          <Row icon="player-stop" label="เวลาปิดประมูล" value={formatDateTime(auction.endTimeMs)} />
        </ul>
      </div>
    </div>
  )
}
