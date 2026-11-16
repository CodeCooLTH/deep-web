'use client'

/**
 * DashBits — ชิ้นส่วนกลางของหน้า "วิเคราะห์ยอดขายจากโฆษณา" แบบ analytics dashboard (00091 · user อนุมัติม็อกอัพ 2026-11-16)
 *
 * KPI: Tile/Spark ของ reports/ad-quality/components/KpiRow.tsx (Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx) — ใช้ตัวเดียวกัน ไม่ทำชุดที่สาม
 * SegBar: แถบแบ่งช่อง — Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (แถบ h-1.25 bg-default-100) แยกเป็นช่อง flex
 *   user 2026-11-16: ความคืบหน้าใช้แถบหนาสีทึบ + ตัวเลขตัวหนา (ไม่ใช่ข้อความจาง)
 * TopBarList: Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TopTrafficSources.tsx (แถว relative h-10 + พื้นแถบ absolute width%)
 * ความกว้างแถบเป็น style (ค่าคำนวณรายแถว) ตามที่ธีมทำเอง ไม่ใช่ arbitrary class (HR7)
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { Spark, Tile } from '../../ad-quality/components/KpiRow'
import InfoTip from './InfoTip'

export { Spark }

export type KpiSpec = {
  key: string
  title: string
  icon: string
  /** สีวงกลมไอคอน (ตามลำดับใบในม็อกอัพ: primary · info · dark · default-600) */
  iconBg: string
  value: React.ReactNode
  badge?: React.ReactNode
  sub?: React.ReactNode
  spark?: { data: number[]; kind: 'bar' | 'area'; name: string }
}

const ICON_BG = ['bg-primary', 'bg-info', 'bg-dark', 'bg-default-600']
export const kpiBg = (i: number) => ICON_BG[i % ICON_BG.length]

/** แถว KPI ไม่เกิน 4 ใบ (มติ user) — แท็บเล็ต 2 ใบต่อแถว */
export function KpiGrid({ items }: { items: KpiSpec[] }) {
  return (
    <div className="gap-base mb-base grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {items.slice(0, 4).map((k) => (
        <Tile key={k.key} title={k.title} icon={k.icon} iconBg={k.iconBg} number={k.value} badge={k.badge}>
          {k.sub && <p className="text-default-700 mt-1 mb-0 text-xs tabular-nums">{k.sub}</p>}
          {k.spark && <Spark data={k.spark.data} kind={k.spark.kind} name={k.spark.name} />}
        </Tile>
      ))}
    </div>
  )
}

/** การ์ดหัวเดียวกันทั้งหน้า (card-header + ⓘ + เครื่องมือขวา) */
export function DashCard({ title, tip, tools, children, bodyClass }: { title: React.ReactNode; tip?: string; tools?: React.ReactNode; children: React.ReactNode; bodyClass?: string }) {
  return (
    <div className="card h-full min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{title}</h4>
        {tip && <InfoTip text={tip} />}
        {tools && <div className="ms-auto">{tools}</div>}
      </div>
      <div className={cn('card-body', bodyClass)}>{children}</div>
    </div>
  )
}

export type SegTone = 'primary' | 'warning' | 'success' | 'danger' | 'default'
const SEG_BG: Record<SegTone, string> = { primary: 'bg-primary', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger', default: 'bg-default-500' }

/** แถบแบ่งช่อง — pct 0–100 · ช่องเต็มสีทึบ ช่องว่าง bg-default-100 · aria-hidden เพราะค่าอ่านจากตัวเลขข้างแถบ */
export function SegBar({ pct, tone = 'primary', segments = 20, className }: { pct: number; tone?: SegTone; segments?: number; className?: string }) {
  const filled = Math.max(0, Math.min(segments, Math.round((pct / 100) * segments)))
  return (
    <span className={cn('flex h-2 gap-0.5', className)} aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn('flex-1 rounded-sm', i < filled ? SEG_BG[tone] : 'bg-default-100')} />
      ))}
    </span>
  )
}

/** แถว "ชื่อ — ค่า (ตัวหนา) · %" + แถบแบ่งช่อง */
export function SegRow({ label, value, pct, tone }: { label: React.ReactNode; value: React.ReactNode; pct: number; tone?: SegTone }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-default-900 font-semibold">{label}</span>
        <span className="text-default-700 tabular-nums whitespace-nowrap"><b className="text-default-900 font-bold">{value}</b> · {pct.toFixed(1)}%</span>
      </div>
      <SegBar pct={pct} tone={tone} />
    </div>
  )
}

export type TopRow = { key: string; name: React.ReactNode; title?: string; value: React.ReactNode; pct: number; chip?: React.ReactNode; onClick?: () => void }

/** รายการอันดับพร้อมพื้นแถบ (TopTrafficSources) */
export function TopBarList({ rows, empty }: { rows: TopRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-default-500 mb-0 py-6 text-center text-sm">{empty}</p>
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="bg-primary/15 absolute inset-y-0 start-0 rounded" style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }} aria-hidden="true" />
            <span className="relative z-10 flex size-full items-center justify-between gap-3 px-3.75">
              <span className="text-default-900 min-w-0 truncate text-sm font-medium" title={r.title}>{r.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">{r.value}{r.chip}</span>
            </span>
          </>
        )
        return r.onClick ? (
          <button key={r.key} type="button" onClick={r.onClick} className="bg-light/50 hover:bg-light relative h-11 w-full rounded text-start lg:h-10">{inner}</button>
        ) : (
          <div key={r.key} className="bg-light/50 relative h-10 w-full rounded">{inner}</div>
        )
      })}
    </div>
  )
}

/** ชิป ROAS — สีตามกำไรส่วนเกิน (บวก success · ติดลบ warning) ไม่ใช่เกณฑ์ ROAS ตายตัว · ติดลบมีไอคอนเตือน ไม่พึ่งสีอย่างเดียว */
export function RoasChip({ roas, loss }: { roas: string; loss: boolean | null }) {
  return (
    <span className={cn('badge rounded-full py-0 text-xs font-semibold tabular-nums', loss === null ? 'bg-light text-default-700' : loss ? 'bg-warning/15 text-warning-ink' : 'bg-success/15 text-success-ink')}>
      {loss && <Icon icon="alert-triangle" className="me-0.5 text-xs" aria-hidden="true" />}
      {roas}
    </span>
  )
}
