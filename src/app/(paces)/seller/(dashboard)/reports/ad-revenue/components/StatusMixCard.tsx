'use client'

/**
 * StatusMixCard — "สถานะคำสั่งซื้อรายโฆษณา": แถบ 100% แบ่ง 5 สถานะ · top 10 โฆษณาตามจำนวนใบ (00091 เฟส 3 FR-013)
 *
 * user 2026-11-16 "แก้ chart คำสั่งซื้อรายโฆษณาด้วย" (ต่อจาก waterfall แบบ modern) — เดิม Apex 100% stacked bar: แกน 0–100% · ชื่อตัดสั้นซ้าย · ไม่มีจำนวนใบ
 * ใหม่: แถวละโฆษณา — รูป + ชื่อ · แถบแบ่งสถานะมุมโค้งเว้นช่องเล็ก · จำนวนใบตัวหนา + % สำเร็จ · คำอธิบายสีเป็นชิปด้านบน
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (แถบ rounded ความกว้าง style) ต่อเป็นหลายช่วง
 *   แบบเดียวกับ StatusWaterfallCard ข้างกัน (การ์ดคู่หน้าตาเป็นชุดเดียว) · ไม่ใช่กราฟ Apex — เป็นแถบเหมือน SegBar
 * 🛑 ค่าแต่ละช่วงอยู่ใน title ของช่วง + sr-only ทั้งแถว (ไม่พึ่งสีอย่างเดียว) · สี: รอ warning · จัดส่ง info · สำเร็จ success · ยกเลิก danger จาง · ตีกลับ danger
 */
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'
import { placedOf, STATUS_KEYS } from '@/lib/ad-revenue-view'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import type { AdMetrics, StatusLabels } from './data'

const TOP = 10
const BG: Record<(typeof STATUS_KEYS)[number], string> = { PENDING: 'bg-warning', SHIPPED: 'bg-info', CONFIRMED: 'bg-success', CANCELLED: 'bg-danger/50', RETURNED: 'bg-danger' }

type Ad = Pick<AdMetrics, 'adId' | 'adTitle' | 'status'> & { adPhotoFileId?: string | null }

export default function StatusMixCard({ ads, noun, labels }: { ads: Ad[]; noun: string; labels: StatusLabels }) {
  const tt = useT()
  const t = tt.adRevenue
  const top = [...ads].filter((a) => placedOf(a.status) > 0).sort((x, y) => placedOf(y.status) - placedOf(x.status)).slice(0, TOP)
  const nameOf = (a: Ad) => adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId

  return (
    <div className="card h-full min-w-0">
      <div className="card-header"><h4 className="card-title">{fmt(t.statusMixTitle, { noun })}</h4></div>
      <div className="card-body flex flex-col gap-4">
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
          {STATUS_KEYS.map((k) => (
            <li key={k} className="text-default-700 flex items-center gap-1.5"><span className={cn('size-2.5 rounded-sm', BG[k])} aria-hidden="true" />{labels[k]}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          {top.map((a) => {
            const n = placedOf(a.status)
            const done = n > 0 ? (a.status.CONFIRMED / n) * 100 : 0
            const sr = STATUS_KEYS.map((k) => `${labels[k]} ${formatNumberNoSymbol(a.status[k])}`).join(' · ')
            return (
              <div key={a.adId} className="grid grid-cols-12 items-center gap-3">
                <span className="col-span-4 flex min-w-0 items-center gap-2">
                  <AdThumb photoFileId={a.adPhotoFileId ?? null} className="size-7 rounded-md" iconClass="text-sm" />
                  <span className="text-default-800 min-w-0 truncate text-sm" title={nameOf(a)}>{nameOf(a)}</span>
                </span>
                <span className="col-span-5 flex h-3 gap-0.5" aria-hidden="true">
                  {STATUS_KEYS.filter((k) => a.status[k] > 0).map((k) => (
                    <span key={k} className={cn('h-full rounded-sm first:rounded-s-full last:rounded-e-full', BG[k])} style={{ width: `${(a.status[k] / n) * 100}%` }} title={`${labels[k]} ${formatNumberNoSymbol(a.status[k])}`} />
                  ))}
                </span>
                <span className="col-span-3 text-end text-sm whitespace-nowrap tabular-nums">
                  <b className="text-default-900 font-bold">{fmt(t.ordersCount, { n: formatNumberNoSymbol(n) })}</b>
                  <span className="text-default-500 text-xs"> · {fmt(t.dash.doneShare, { p: done.toFixed(0) })}</span>
                </span>
                <span className="sr-only">{`${nameOf(a)}: ${sr}`}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
