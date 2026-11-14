'use client'

/**
 * ChatQualityHero — ② ปิดการขายจากแชทของแอด (Deep) + อัตราคุยต่อ/ตอบกลับ/บล็อก (F-05…F-09 ที่ระดับยอดรวม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (หัว + แถวแถบ `h-1.25 bg-default-100` ซ้อนแถบสี)
 * ตัด: CountUp · medal/Congratulations · select วันที่ · uppercase
 * สี (HR7 ห้ามม่วง): ไอคอน bg-info · คุยต่อ ≥2 bg-info · ≥3 bg-primary · ตอบกลับ chart-zeta (style เพราะ --color-chart-zeta อยู่ใน :root ไม่ใช่ @theme
 *   จึงไม่มี utility bg-chart-zeta — มติ O6) · บล็อก bg-warning · ไม่ใช้เขียว/แดง
 * 🛑 "ปิดการขาย" ผูกกับ แชท (Deep) · "คุยต่อ/ตอบกลับ/บล็อก" ผูกกับ แชท (Meta) — เขียนตัวหารกำกับทุกแถว · ค่า >100% แสดงตามจริง (แถบ clamp 100%)
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { colorVar } from '@/utils/helpers'
import { fmtInt, fmtPct1, type CardStatus, type QualityTotals } from './data'
import CardState from './CardState'
import NoDataCell from './NoDataCell'

type Props = { status: CardStatus; totals: QualityTotals | null; orders: number; deepChats: number; closeRatePct: number | null; noun: string }

export default function ChatQualityHero({ status, totals, orders, deepChats, closeRatePct, noun }: Props) {
  const t = useT().adQuality
  const ok = status === 'OK' && totals !== null
  const rows: { key: 'depth2' | 'depth3' | 'replied' | 'block'; title: string; bar: string; color?: string }[] = [
    { key: 'depth2', title: t.rate2, bar: 'bg-info' },
    { key: 'depth3', title: t.rate3, bar: 'bg-primary' },
    { key: 'replied', title: t.rateReplied, bar: '', color: colorVar('chart-zeta') },
    { key: 'block', title: t.rateBlock, bar: 'bg-warning' },
  ]
  return (
    <div className="card h-full min-w-0">
      <div className="card-body">
        <h4 className="text-default-700 mb-2.5 text-sm font-bold">{t.h2Title}</h4>
        <div className="mb-2.5 flex items-center gap-2.5 py-1.25">
          <span className="bg-info flex size-9 shrink-0 items-center justify-center rounded-full text-white">
            <Icon icon="messages" className="text-xl" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="mb-0 text-xl tabular-nums">{closeRatePct === null ? <NoDataCell /> : fmtPct1(closeRatePct)}</h3>
            <p className="text-default-700 text-2xs mb-0">{fmt(t.h2Line, { n: fmtInt(orders), noun, m: fmtInt(deepChats) })}</p>
          </div>
        </div>
        {!ok ? (
          status === 'OK' ? <p className="text-default-700 mb-0 text-sm"><NoDataCell /></p> : <CardState status={status as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} />
        ) : (
          rows.map((r, i) => {
            const g = totals.rates[r.key]
            return (
              <div className={i === 0 ? 'mt-2.5 pt-1.25' : 'mt-5'} key={r.key}>
                <div className="mb-1.25 flex items-center justify-between">
                  <h5 className="mb-0 text-sm font-semibold">{r.title}</h5>
                  <span className="text-sm tabular-nums">{g.pct === null ? <NoDataCell /> : fmtPct1(g.pct)}</span>
                </div>
                {/* ความกว้าง/สีแถบเป็นค่าไดนามิก (style แบบธีมเอง) · aria-hidden — ค่าอ่านจากข้อความ */}
                <div className="bg-default-100 mb-1.25 h-1.25 w-full rounded" aria-hidden="true">
                  <div className={`h-full rounded-s ${r.bar}`} style={{ width: `${Math.min(g.pct ?? 0, 100)}%`, ...(r.color ? { backgroundColor: r.color } : {}) }} />
                </div>
                <p className="text-default-700 text-2xs mb-0">
                  {g.num === null || g.den === null ? <NoDataCell /> : fmt(t.fromMeta, { k: fmtInt(g.num), n: fmtInt(g.den) })}
                  {g.pct !== null && g.pct > 100 && ` · ${t.over100}`}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
