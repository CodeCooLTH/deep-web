'use client'

/**
 * Bits — ชิ้นเล็กที่ทุกการ์ดของหน้า "สรุปโฆษณา" ใช้ร่วม (00094): % เปลี่ยน (badge / ข้อความ) · ไอคอน info · ป้าย Meta
 *
 * Base (DeltaBadge): theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx (`badge text-sm bg-*\/15 py-0` + ลูกศร + ค่าสัมบูรณ์)
 * Base (FilterSelect): theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx (react-select ผ่าน wrapper · className="select2 react-select")
 * Base (DeltaText): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx (ลูกศร + % เป็นข้อความสี)
 *
 * 🛑 ดีขึ้น success-ink · แย่ลง warning-ink (ไม่ใช้ danger — BR-AIR-03) · กลาง default-700 ไม่มีลูกศร · % ทุกตัว ไม่มี "จุด"
 *    ตัวที่เป็นอัตรา (CTR/ปิดการขาย) บอกค่าช่วงก่อนใน title · ไม่มีฐานเทียบ = "—" (ห้าม +100% จากฐาน 0)
 */
import Icon from '@/components/wrappers/Icon'
import Select from '@/components/wrappers/Select'
import { badgeClass, deltaView, formatValue, inkClass, signedPct, type ValueUnit } from '@/lib/ad-summary/view'
import type { MetricPair, Tone } from '@/lib/ad-summary/types'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'

type DeltaProps = { pair: MetricPair; tone: Tone; /** ส่งมา = ตัวชี้วัดเป็นอัตรา → title "ช่วงก่อน X" */ rateUnit?: ValueUnit; className?: string }

function useSr() {
  const t = useT().adSummary
  return (trend: 'good' | 'bad' | 'neutral' | null) => (trend === 'good' ? t.better : trend === 'bad' ? t.worse : '')
}

export function DeltaBadge({ pair, tone, rateUnit, className }: DeltaProps) {
  const t = useT().adSummary
  const sr = useSr()
  const d = deltaView(pair, tone)
  if (d.pct === null) return <span className="text-default-500 text-xs">—<span className="sr-only">{t.noData}</span></span>
  const title = rateUnit ? fmt(t.prevRate, { v: formatValue(rateUnit, pair.prev) }) : undefined
  return (
    <span className={cn('badge py-0 text-sm tabular-nums', badgeClass(d.trend), className)} title={title}>
      {d.arrow ? (
        <>
          <Icon icon={d.arrow === 'up' ? 'arrow-up' : 'arrow-down'} className="align-middle" aria-hidden="true" />
          {Math.abs(d.pct).toFixed(1)}%
          <span className="sr-only">{sr(d.trend)}</span>
        </>
      ) : (
        signedPct(d.pct)
      )}
    </span>
  )
}

export function DeltaText({ pair, tone, rateUnit, className }: DeltaProps) {
  const t = useT().adSummary
  const sr = useSr()
  const d = deltaView(pair, tone)
  if (d.pct === null) return <span className="text-default-500">—<span className="sr-only">{t.noData}</span></span>
  const title = rateUnit ? fmt(t.prevRate, { v: formatValue(rateUnit, pair.prev) }) : undefined
  return (
    <span className={cn('flex items-center gap-1 tabular-nums', inkClass(d.trend), className)} title={title}>
      {d.arrow ? (
        <>
          <Icon icon={d.arrow === 'up' ? 'arrow-up' : 'arrow-down'} className="text-sm" aria-hidden="true" />
          {Math.abs(d.pct).toFixed(2)}%
          <span className="sr-only">{sr(d.trend)}</span>
        </>
      ) : (
        signedPct(d.pct, 2)
      )}
    </span>
  )
}

/** ไอคอน info + tooltip นิยาม 1 บรรทัด — แท็บเล็ตขยายพื้นที่แตะเป็น 44px โดยไม่ขยายไอคอน */
export function InfoTip({ text }: { text: string }) {
  const t = useT().adSummary
  return (
    <button type="button" title={text} aria-label={fmt(t.infoAria, { t: text })} className="text-default-500 -m-3.5 inline-flex size-11 items-center justify-center lg:m-0 lg:size-auto">
      <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
    </button>
  )
}

/** ป้ายแหล่ง — ติดเฉพาะตัวเลขที่มาจาก Meta (BR-AIR-14: ของร้านไม่ติดป้าย) */
export function MetaBadge({ title }: { title?: string }) {
  const t = useT().adSummary
  return (
    <span className="badge bg-info/15 text-info-ink" title={title ?? t.metaBadgeTip}>
      {t.metaBadge}
    </span>
  )
}

export const NoValue = () => {
  const t = useT().adSummary
  return (
    <>
      <span className="text-default-500">—</span>
      <span className="sr-only">{t.noData}</span>
    </>
  )
}

/** Select2 ของธีม (react-select) — ห้าม <select> native ทั้งหน้า (BR-AIR-17) */
export type Opt = { value: string; label: string }
export function FilterSelect({ value, options, onChange, width, label }: { value: string; options: Opt[]; onChange: (v: string) => void; width: string; label: string }) {
  return (
    <div className={width}>
      <Select
        className="select2 react-select"
        classNamePrefix="react-select"
        isSearchable={false}
        aria-label={label}
        options={options}
        value={options.find((o) => o.value === value) ?? options[0]}
        onChange={(opt: unknown) => onChange((opt as Opt | null)?.value ?? options[0].value)}
      />
    </div>
  )
}

