'use client'

/**
 * PlacementPanel — ตำแหน่งแสดงโฆษณา (FR-006): รายการอันดับตามแชท (Meta) · วงกลมไอคอนแพลตฟอร์ม + ชื่อ · แชทตัวหนา · ชิปต้นทุนต่อแชท (ต่ำสุดเป็นสีเขียวจาง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TopTrafficSources.tsx (แถวพื้นแถบ width% — ผ่าน TopBarList ใน reports/ad-revenue/components/DashBits.tsx)
 * user อนุมัติม็อกอัพ 2026-11-16: เลิกโดนัท + แท่ง Apex → รายการอันดับ
 * สีไอคอนแพลตฟอร์ม: โทเคน chart-* ผ่าน style (ไม่ใช่ arbitrary Tailwind)
 * 🛑 BR-AIQ-02: ไม่มียอดขาย/คำสั่งซื้อ/ROAS ต่อตำแหน่ง · ทุกตัวเลขนำหน้า "≈" · "ต่ำสุด" = view.cheapest (เฉพาะแถวแชท ≥ 20)
 */
import { useMemo } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { formatBaht } from '@/lib/format-money'
import { cn, colorVar } from '@/utils/helpers'
import { TopBarList } from '../../ad-revenue/components/DashBits'
import { fmtInt, type PlacementView } from './data'
import NoDataCell from './NoDataCell'

/** แพลตฟอร์ม → ชื่อโทเคนสี (ไม่ม่วง/เขียว/แดง) — ที่เหลือเทา */
const PLATFORM_COLOR: Record<string, string> = { facebook: 'chart-primary', instagram: 'chart-zeta', messenger: 'chart-delta' }
const tokenOf = (platform: string) => PLATFORM_COLOR[platform] ?? 'default-400'
const ICON: Record<string, string> = { facebook: 'brand-facebook', instagram: 'brand-instagram', messenger: 'brand-messenger' }

export default function PlacementPanel({ view }: { view: PlacementView }) {
  const t = useT().adQuality
  const rows = useMemo(() => {
    const lines = [...view.lines].sort((a, b) => (b.chats ?? -1) - (a.chats ?? -1))
    const max = Math.max(1, ...lines.map((l) => l.chats ?? 0))
    return lines.map((l) => ({
      key: l.key,
      title: l.label,
      pct: ((l.chats ?? 0) / max) * 100,
      name: (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: colorVar(tokenOf(l.platform)) }}>
            <Icon icon={ICON[l.platform] ?? 'speakerphone'} className="text-base" aria-hidden="true" />
          </span>
          <span className="truncate">{l.label}</span>
        </span>
      ),
      value: <b className="text-default-900 font-bold">{l.chats === null ? '—' : `≈${fmtInt(l.chats)}`}</b>,
      chip: (
        <span className={cn('badge rounded-full py-0 text-xs font-semibold tabular-nums', l.key === view.cheapest?.key ? 'bg-success/15 text-success-ink' : 'bg-default-100 text-default-700')}>
          {l.costPerChat === null ? '—' : `≈${formatBaht(l.costPerChat)}`}
        </span>
      ),
    }))
  }, [view])

  if (rows.length === 0) return <p className="text-default-700 text-sm"><NoDataCell /></p>
  return (
    <>
      <p className="text-default-500 mb-2 text-xs">{t.placeRankNote}</p>
      <TopBarList rows={rows} />
    </>
  )
}
