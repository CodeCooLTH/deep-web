'use client'

/**
 * SpendDeliveryHero — ③ ค่าโฆษณา + การแสดงผล/เข้าถึง/ความถี่/CTR/CPC/ต้นทุนต่อแชท (Deep) (FR-003 · F-03/F-04/F-11/F-12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx (ส่วนหัวการ์ด kicker + วงกลมไอคอน + เลข + badge)
 *   + theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalVisitors.tsx (ตาราง `table table-sm table-borderless` · `thead bg-default-100 text-2xs thead-sm`)
 * ตัด: แผนภูมิแท่ง/CountUp/select วันที่ · ตัด uppercase ที่ thead · ไอคอน bg-dark (ไม่ผูกความหมาย)
 * 🛑 ค่าโฆษณา = getAdSpend ตัวเดียวกับ /reports/ads (BRD §2) ไม่ใช้ spend จาก Q1 · เข้าถึง/ความถี่ = Q2 (ประมาณการ — ไม่บวกรายแอด)
 * Q2 ล้ม: แสดงเฉพาะที่ได้ ช่องเข้าถึง/ความถี่ "—" พร้อมข้อความสถานะ ไม่ล่มทั้งการ์ด
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatBaht } from '@/lib/format-money'
import { fmtDec2, fmtInt, fmtPct1, type CardStatus } from './data'
import CardState, { type NotInAccount } from './CardState'
import NoDataCell from './NoDataCell'

type Props = {
  spend: number | null
  impressions: number | null
  reach: number | null
  frequency: number | null
  ctr: number | null
  cpc: number | null
  costPerChatMeta: number | null
  costPerChatDeep: number | null
  /** Q1 (แถวรวม) · Q2 (เข้าถึง) — สถานะแยกกัน */
  adStatus: CardStatus
  reachStatus: CardStatus
  notInAccount?: NotInAccount
}

export default function SpendDeliveryHero(p: Props) {
  const t = useT().adQuality
  const baht = (v: number | null) => (v === null ? <NoDataCell /> : formatBaht(v))
  const q1 = p.adStatus === 'OK'
  const q2 = p.reachStatus === 'OK'
  const rows: { label: string; value: React.ReactNode; source: string }[] = [
    { label: t.mImpr, value: q1 ? fmtInt(p.impressions) : <NoDataCell />, source: t.srcMeta },
    { label: t.mReach, value: q2 ? fmtInt(p.reach) : <NoDataCell />, source: t.srcMetaEst },
    { label: t.mFreq, value: q2 ? fmtDec2(p.frequency) : <NoDataCell />, source: t.srcMetaEst },
    { label: t.mCtr, value: q1 ? fmtPct1(p.ctr) : <NoDataCell />, source: t.srcMeta },
    { label: t.mCpc, value: q1 ? baht(p.cpc) : <NoDataCell />, source: t.srcMeta },
    { label: t.mCostDeep, value: baht(p.costPerChatDeep), source: t.srcDeep },
  ]
  return (
    <div className="card h-full min-w-0 md:col-span-2 xl:col-span-1">
      <div className="card-body">
        <h4 className="text-default-700 mb-2.5 text-sm font-bold">{t.h3Title}</h4>
        <div className="mb-2.5 flex items-center gap-2.5 py-1.25">
          <span className="bg-dark flex size-9 shrink-0 items-center justify-center rounded-full text-white">
            <Icon icon="cash" className="text-xl" aria-hidden="true" />
          </span>
          <h3 className="mb-0 text-xl tabular-nums">{baht(p.spend)}</h3>
          {p.costPerChatMeta !== null && q1 && (
            <span className="badge bg-info/15 text-info-ink ms-auto py-0 text-sm">{fmt(t.perChatMeta, { v: formatBaht(p.costPerChatMeta) })}</span>
          )}
        </div>
        {/* Meta ไม่มีข้อมูล → ไม่วาดตารางที่มีแต่ "—" ให้เลื่อนผ่าน */}
        {q1 && (
        <div className="-mb-2.5 overflow-x-auto">
          <table className="table table-sm table-borderless whitespace-nowrap">
            <thead className="bg-default-100 text-2xs thead-sm">
              <tr>
                <th className="p-2 text-start">{t.thMetric}</th>
                <th className="p-2 text-end">{t.thValue}</th>
                <th className="p-2 text-start">{t.thSource}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="text-end tabular-nums">{r.value}</td>
                  <td className="text-default-700 text-xs">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        {!q1 && <div className="mt-5"><CardState status={p.adStatus === 'OK' ? 'EMPTY' : (p.adStatus as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH')} notInAccount={p.notInAccount} /></div>}
        {q1 && !q2 && <div className="mt-5"><CardState status={p.reachStatus as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} /></div>}
      </div>
    </div>
  )
}
