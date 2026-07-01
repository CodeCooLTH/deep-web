/**
 * AuctionStatStrip — 4 KPI (กำลังประมูล / บิดวันนี้ / ยอดประมูล live / ใกล้ปิด <1ชม.)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/RevenueStat.tsx
 *   (ผ่าน in-app orders/components/OrdersStatCard.tsx — card > card-header/card-body pattern)
 * Adaptation (least-invasive — HR "strip dep ที่ไม่ใช้"): ตัด ApexChart sparkline ออกทั้งหมด
 *   เพราะ 4 ตัวเลขนี้เป็น "จำนวน ณ ปัจจุบัน" ไม่มี time-series ธรรมชาติเหมือนออเดอร์ (trend รายวัน) —
 *   ตรงกับ mockup FRAME1 `.stat-mini`/D1 `.stat` ที่ไม่มี sparkline เช่นกัน (icon+value+subtext
 *   แทน — pattern เดียวกับ dashboard/components/StatisticCard.tsx)
 *
 * responsive: mobile <lg = การ์ดเล็ก scroll-x (`.stat-mini`); desktop ≥lg = grid 4 คอลัมน์เต็ม (`.stat`)
 * เป็น RSC ล้วน (ไม่มี 'use client') — CountUp เป็น client leaf component ฝังได้ปกติ (เหมือน StatisticCard.tsx)
 */

import Icon from '@/components/wrappers/Icon'
import { CountUp } from '@/components/wrappers/CountUp'

type Props = {
  liveCount: number
  bidsToday: number
  liveTotal: number
  closingSoonCount: number
}

type StatItem = {
  label: string
  value: number
  prefix?: string
  icon: string
  iconClass: string
  sub: string
  subClass: string
}

export default function AuctionStatStrip({ liveCount, bidsToday, liveTotal, closingSoonCount }: Props) {
  const items: StatItem[] = [
    {
      label: 'กำลังประมูล',
      value: liveCount,
      icon: 'gavel',
      iconClass: 'bg-success/15 text-success',
      sub: liveCount > 0 ? 'ไลฟ์อยู่' : 'ไม่มีรายการไลฟ์',
      subClass: liveCount > 0 ? 'text-success' : 'text-default-400',
    },
    {
      label: 'บิดวันนี้',
      value: bidsToday,
      icon: 'trending-up',
      iconClass: 'bg-primary/15 text-primary',
      sub: 'ครั้ง',
      subClass: 'text-default-400',
    },
    {
      label: 'ยอดประมูล (live)',
      value: liveTotal,
      prefix: '฿',
      icon: 'wallet',
      iconClass: 'bg-info/15 text-info',
      sub: 'รวมราคาปัจจุบัน',
      subClass: 'text-default-400',
    },
    {
      label: 'ใกล้ปิด <1ชม.',
      value: closingSoonCount,
      icon: 'clock',
      iconClass: 'bg-warning/15 text-warning',
      sub: closingSoonCount > 0 ? 'ต้องติดตาม' : 'ไม่มี',
      subClass: closingSoonCount > 0 ? 'text-warning' : 'text-default-400',
    },
  ]

  return (
    <>
      {/* mobile: scroll-x compact stat card */}
      <div className="mb-3 flex gap-2.5 overflow-x-auto pb-1 lg:hidden [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <div key={it.label} className="card min-w-36 shrink-0">
            <div className="card-body !p-3">
              <p className="text-xs text-default-400">{it.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-default-900">
                {it.prefix ?? ''}
                <CountUp start={0} end={it.value} duration={1} decimals={0} />
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* desktop: grid 4 คอลัมน์ เต็มรูปแบบ (icon + value + subtext) */}
      <div className="mb-base hidden gap-base lg:grid lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="card">
            <div className="card-body">
              <div className="flex items-center gap-2.5">
                <span className={`flex size-9 items-center justify-center rounded-full ${it.iconClass}`}>
                  <Icon icon={it.icon} className="text-lg" />
                </span>
                <p className="text-sm text-default-400">{it.label}</p>
              </div>
              <p className="mt-3 text-xl font-bold tabular-nums text-default-900">
                {it.prefix ?? ''}
                <CountUp start={0} end={it.value} duration={1} decimals={0} />
              </p>
              <p className={`mt-1 text-xs ${it.subClass}`}>{it.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
