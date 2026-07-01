'use client'

/**
 * AuctionControlPanel — พารามิเตอร์ read-only + danger zone (จบก่อนเวลา/ยกเลิก)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/
 *   OrderSummary.tsx (kv list pattern) ผสม card border-s-3 accent (paces-component-reference §7)
 *   สำหรับ danger-zone block
 *
 * MVP: "ต่อเวลาอัตโนมัติ" แสดงอ่านอย่างเดียว (antiSnipeCount/5) — ไม่มีปุ่มต่อเวลาเอง/แก้ buy-now
 * (UI-DESIGN-SPEC ระบุ full-control เป็น FR-AUC-10..14 PROPOSED รอ sign-off — ไม่อยู่ใน scope Batch E#11)
 *
 * ⚠️ ข้อจำกัด scope: ไม่แสดง "ราคาเริ่มต้น" (startPrice) — `SellerAuctionDTO` ไม่มี field นี้
 * (mapper เก็บแค่ `currentPrice` ซึ่งขยับตามบิดจริง ไม่ใช่ราคาเริ่ม) และ task ระบุห้ามแก้ DTO
 * เกินกว่า `orderId` ในรอบนี้ — flag ให้ Controller พิจารณาเพิ่ม field ใน batch ถัดไปถ้าต้องการ
 */

import { useAuctionActions } from './useAuctionActions'
import type { AuctionStatus } from '../../components/data'

type Props = {
  id: string
  status: AuctionStatus
  bidCount: number
  bidIncrement: number
  buyNowPrice: number | null
  antiSnipeCount: number
}

export default function AuctionControlPanel({
  id,
  status,
  bidCount,
  bidIncrement,
  buyNowPrice,
  antiSnipeCount,
}: Props) {
  const { endEarly, endingEarly, cancel, cancelling } = useAuctionActions(id)

  const isTerminal = status === 'ended' || status === 'unsold' || status === 'cancelled'
  const canCancel = status === 'draft' || status === 'scheduled' || (status === 'live' && bidCount === 0)

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">แผงควบคุม</h4>
      </div>
      <div className="card-body">
        <ul className="space-y-2.5">
          <li className="flex items-center justify-between gap-2">
            <span className="text-default-400 text-sm">ขั้นบิด</span>
            <span className="tabular-nums text-sm font-medium text-default-800">
              ฿{bidIncrement.toLocaleString('th-TH')}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-default-400 text-sm">ซื้อทันที</span>
            <span className="tabular-nums text-sm font-medium text-default-800">
              {buyNowPrice != null ? `฿${buyNowPrice.toLocaleString('th-TH')}` : 'ไม่มี'}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-default-400 text-sm">ต่อเวลาอัตโนมัติ</span>
            <span className="tabular-nums text-sm font-medium text-default-800">{antiSnipeCount}/5</span>
          </li>
        </ul>

        {!isTerminal && (
          <div className="border-danger/30 bg-danger/5 mt-5 space-y-2.5 rounded-lg border border-dashed p-3.75">
            <p className="text-danger mb-0 text-xs font-semibold">โซนอันตราย</p>

            {status === 'live' && (
              <button
                type="button"
                onClick={endEarly}
                disabled={endingEarly}
                className="btn bg-danger text-white hover:bg-danger-hover w-full text-sm disabled:opacity-60"
              >
                {endingEarly ? 'กำลังจบประมูล...' : 'จบประมูลก่อนเวลา'}
              </button>
            )}

            <button
              type="button"
              onClick={cancel}
              disabled={!canCancel || cancelling}
              title={!canCancel ? 'ยกเลิกไม่ได้ — มีผู้เสนอราคาแล้ว' : undefined}
              className="btn border border-danger text-danger hover:bg-danger/15 w-full text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิกประมูล'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
