/**
 * AuctionStatCards — KPI แถวบนของ Control Console: ราคาปัจจุบัน+ผู้นำ / จำนวนบิด / เหลือเวลา
 * + การ์ดที่ 4 (ExpectedPriceGauge) เมื่อ seller ตั้ง `expectedPrice` ไว้เท่านั้น (ซ่อนถ้า null — grid ปรับ 3→4 คอลัมน์)
 *
 * มติ Controller (Batch E#11): ตัดการ์ด "กำลังดู" (viewer count) ออกจาก KPI เดิม (คงเหลือ 3 การ์ดหลัก
 * ตาม UI-DESIGN-SPEC "ราคา/บิด/ดู/เหลือเวลา" — ดู ตัดออกเหลือ ราคา/บิด/เหลือเวลา)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersStatCard.tsx (card/card-header/
 * card-body primitive — ไม่ได้ copy sparkline chart ของไฟล์นั้น เพราะ stat นี้เป็นค่าเดี่ยว ไม่ใช่ trend)
 */
'use client'

import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/utils/helpers'
import AuctionCountdown from '../../../_shared/AuctionCountdown'
import ExpectedPriceGauge from './ExpectedPriceGauge'
import type { AuctionStatus } from '../../components/data'

type Props = {
  currentPrice: number
  bidCount: number
  endTimeMs: number
  status: AuctionStatus
  leaderName: string | null
  expectedPrice: number | null
}

const StatCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card h-full">
    <div className="card-body">
      <p className="text-default-400 mb-1.25 text-xs">{title}</p>
      {children}
    </div>
  </div>
)

export default function AuctionStatCards({
  currentPrice,
  bidCount,
  endTimeMs,
  status,
  leaderName,
  expectedPrice,
}: Props) {
  const isTerminal = status === 'ended' || status === 'unsold' || status === 'cancelled'
  const showGauge = expectedPrice != null

  return (
    <div className={cn('grid grid-cols-1 gap-base sm:grid-cols-3', showGauge && 'md:grid-cols-4')}>
      <StatCard title="ราคาปัจจุบัน">
        <p className="mb-0 text-xl font-bold tabular-nums text-primary">
          ฿{currentPrice.toLocaleString('th-TH')}
        </p>
        <p className="text-default-400 mb-0 mt-1 truncate text-xs">
          {leaderName ? `ผู้นำ: ${leaderName}` : 'ยังไม่มีผู้เสนอราคา'}
        </p>
      </StatCard>

      <StatCard title="จำนวนบิด">
        <p className="mb-0 text-xl font-bold tabular-nums text-default-900">
          {bidCount.toLocaleString('th-TH')}
        </p>
        <p className="text-default-400 mb-0 mt-1 text-xs">รายการเสนอราคา</p>
      </StatCard>

      <StatCard title="เหลือเวลา">
        {isTerminal ? (
          <p className="mb-0 text-sm font-semibold text-default-500">{formatDateTime(endTimeMs)}</p>
        ) : (
          <p className="mb-0 text-xl font-bold">
            <AuctionCountdown endTimeMs={endTimeMs} />
          </p>
        )}
        <p className="text-default-400 mb-0 mt-1 text-xs">
          {isTerminal ? 'เวลาปิดประมูล' : 'ก่อนปิดประมูล'}
        </p>
      </StatCard>

      {showGauge && <ExpectedPriceGauge currentPrice={currentPrice} expectedPrice={expectedPrice as number} />}
    </div>
  )
}
