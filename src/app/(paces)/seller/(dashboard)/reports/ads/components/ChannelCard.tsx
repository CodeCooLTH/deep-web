'use client'

/**
 * ChannelCard — ⑦ ยอดขายตามช่องทาง (ยอดทั้งร้านในช่วง รวมที่ไม่ได้มาจากโฆษณา) (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TopTrafficSources.tsx
 *   (ไทล์ `relative h-10 w-full` + ชั้นข้อมูล `absolute size-full px-3.75 z-10` + ชั้นแถบ `absolute h-full` กว้างตามสัดส่วน)
 * ตัด: เมนู dropdown/tooltip hs-* · แบ่ง 2 คอลัมน์ chunk · สีพื้นหลายสี → fill เดียว bg-default-200 ทุกไทล์ · แถว TikTok "ยังไม่ได้เชื่อม" (มติ O2)
 * โลโก้: src/components/safepay/SalesChannelBadge.tsx (SalesChannelLogo — โลโก้จริงใน public/images/logos + fallback tabler) · MESSENGER → Facebook
 */
import { SalesChannelLogo } from '@/components/safepay/SalesChannelBadge'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { shareOf, type AdReportView } from './data'

const KEY: Record<string, string> = { MESSENGER: 'FACEBOOK', INSTAGRAM: 'INSTAGRAM' }

export default function ChannelCard({ report }: { report: AdReportView }) {
  const t = useT().adReport
  const list = report.channels.filter((c) => c.sales > 0)
  const total = list.reduce((s, c) => s + c.sales, 0)
  const label = (p: string | null) => (p === 'MESSENGER' ? 'Facebook' : p === 'INSTAGRAM' ? 'Instagram' : t.channelStore)

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.channelTitle}</h4>
      </div>
      <div className="card-body">
        <p className="text-default-700 mb-4 text-xs">{t.channelNote} <span className="text-default-900 font-semibold tabular-nums">{formatBaht(total)}</span> · {t.channelBarNote}</p>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {list.map((c) => {
            const pct = shareOf(c.sales, total)
            return (
              <li key={String(c.provider)} className="relative h-10 w-full">
                <div className="absolute z-10 flex size-full items-center justify-between gap-2 px-3.75">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <SalesChannelLogo channel={c.provider ? (KEY[c.provider] ?? 'OTHER') : 'STOREFRONT'} size={24} />
                    <span className="text-default-900 truncate text-md font-semibold">{label(c.provider)}</span>
                  </span>
                  <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">
                    {formatBaht(c.sales)} <span className="text-default-700 font-normal">· {formatNumberNoSymbol(Math.round(pct * 10) / 10)}%</span>
                  </span>
                </div>
                {/* ความกว้างเป็นค่าไดนามิกตามสัดส่วน — ธีมทำแบบเดียวกัน */}
                <div className="bg-default-200 absolute h-full overflow-hidden rounded" style={{ width: `${pct}%` }} aria-hidden="true" />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
