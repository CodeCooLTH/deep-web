'use client'

/**
 * KpiRow — แถว KPI 4 ใบของรายงานคุณภาพโฆษณา (00093): แชท (Deep) · แชท (Meta) · ปิดการขาย (Deep) · ค่าโฆษณา
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx (card h-full > card-body · หัวการ์ด · วงกลมไอคอน + เลข + badge · กราฟท้ายการ์ด)
 *   sparkline: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/ (ApexChart wrapper · toolbar ปิด) · delta: reports/ads/components/DeltaText.tsx
 * ตัด: CountUp · select วันที่ · uppercase · ตัวเลขใช้ <p> ไม่ใช่ <h3> (ตัวเลขไม่ใช่หัวข้อ — WCAG 1.3.1)
 * 🛑 delta/sparkline มาจากฟิลด์ที่ getAdSalesReport คำนวณไว้แล้ว (ช่วงก่อนหน้า/รายวัน) — ฝั่ง Meta ไม่มีรายวันจึงไม่มี sparkline · แชท (Deep) ไม่มีรายวันจึงมีแค่ delta
 * meta/spend = null → ซ่อนใบนั้น (ฝั่ง Meta ไม่พร้อม) แล้วใช้ช่อง status แทน (มติ O1: แถบสถานะเดียว)
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { pointsDelta } from '@/lib/ad-report-view'
import { formatBaht, pctChangeVsPrev } from '@/lib/format-money'
import { getColor } from '@/utils/helpers'
import DeltaText from '../../ads/components/DeltaText'
import NoDataCell from './NoDataCell'
import { HIGH_GAP_PCT, fmtInt, fmtPct1 } from './data'

type Props = {
  noun: string
  deep: { chats: number; prevChats: number; closeRatePct: number | null; prevCloseRatePct: number | null; orders: number; dailyOrders: number[] }
  /** แชท (Meta) + ชุดแอดเดียวกับที่ใช้คิดส่วนต่าง — null = ซ่อน */
  meta: { chats: number | null; deepSameSet: number; gap: number | null; adsCounted: number } | null
  /** null = ซ่อน (Meta ไม่พร้อม หรือไม่มีค่าโฆษณา) */
  spend: { value: number; prev: number | null; daily: number[]; perChatDeep: number | null } | null
  /** แถบสถานะใบเดียวเมื่อซ่อนใบฝั่ง Meta */
  status?: React.ReactNode
}

function Spark({ data, kind, name }: { data: number[]; kind: 'bar' | 'area'; name: string }) {
  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: kind, height: 48, sparkline: { enabled: true }, toolbar: { show: false } },
      series: [{ name, data }],
      colors: [getColor('chart-primary')],
      stroke: { width: kind === 'area' ? 2 : 0, curve: 'smooth' },
      fill: kind === 'area' ? { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } } : { opacity: 0.85 },
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 1 } },
      tooltip: { enabled: true, y: { formatter: (v: number) => (kind === 'area' ? formatBaht(v) : fmtInt(v)) } },
    }),
    [data, kind, name],
  )
  if (data.length < 2) return null
  return (
    <div className="mt-3" role="img" aria-label={name}>
      <ApexChart getOptions={getOptions} type={kind} height={48} />
      <p className="text-default-700 text-2xs mt-1 mb-0">{name}</p>
    </div>
  )
}

function Tile({ title, icon, iconBg, number, badge, children }: { title: string; icon: string; iconBg: string; number: React.ReactNode; badge?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="card h-full min-w-0">
      <div className="card-body">
        <h4 className="text-default-700 mb-2.5 text-sm font-bold">{title}</h4>
        <div className="flex items-center gap-2.5 py-1.25">
          <span className={`${iconBg} flex size-9 shrink-0 items-center justify-center rounded-full text-white`}>
            <Icon icon={icon} className="text-xl" aria-hidden="true" />
          </span>
          <p className="mb-0 text-xl font-semibold tabular-nums">{number}</p>
          {badge && <span className="ms-auto">{badge}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

export default function KpiRow({ noun, deep, meta, spend, status }: Props) {
  const t = useT().adQuality
  const max = meta ? Math.max(meta.chats ?? 0, meta.deepSameSet, 1) : 1
  const gap = meta?.gap ?? null
  return (
    <div className="gap-base mb-base grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <Tile title={t.chatDeep} icon="message-circle" iconBg="bg-primary" number={fmtInt(deep.chats)} badge={<DeltaText value={pctChangeVsPrev(deep.chats, deep.prevChats)} className="text-sm" />}>
        <p className="text-default-700 text-xs mt-1 mb-0">{fmt(t.prevLine, { n: fmtInt(deep.prevChats) })}</p>
      </Tile>

      {meta && (
        <Tile
          title={t.chatMeta} icon="brand-meta" iconBg="bg-default-600" number={fmtInt(meta.chats)}
          badge={gap === null ? null : (
            <span className={`badge py-0 text-sm ${gap >= HIGH_GAP_PCT ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800'}`}>
              {gap < 0 ? fmt(t.deepMore, { p: Math.abs(gap).toFixed(1) }) : fmt(t.gapLabel, { p: gap.toFixed(1) })}
            </span>
          )}>
          {/* แถบเทียบชุดแอดเดียวกัน — ความกว้างไดนามิกเป็น style แบบธีมเอง · aria-hidden เพราะค่าอ่านจากข้อความ */}
          <div className="mt-1">
            <div className="mb-1 flex items-center justify-between text-xs"><span>{t.chatMeta}</span><span className="tabular-nums">{fmtInt(meta.chats)}</span></div>
            <div className="bg-default-100 mb-2 h-1.25 w-full rounded" aria-hidden="true"><div className="bg-default-400 h-full rounded" style={{ width: `${((meta.chats ?? 0) / max) * 100}%` }} /></div>
            <div className="mb-1 flex items-center justify-between text-xs"><span>{t.chatDeep}</span><span className="tabular-nums">{fmtInt(meta.deepSameSet)}</span></div>
            <div className="bg-default-100 mb-1 h-1.25 w-full rounded" aria-hidden="true"><div className="bg-primary h-full rounded" style={{ width: `${(meta.deepSameSet / max) * 100}%` }} /></div>
            <p className="text-default-700 text-2xs mb-0">{fmt(t.adsIn, { n: meta.adsCounted })}</p>
          </div>
        </Tile>
      )}

      <Tile
        title={t.colClose} icon="shopping-bag" iconBg="bg-info"
        number={deep.closeRatePct === null ? <NoDataCell /> : fmtPct1(deep.closeRatePct)}
        badge={<DeltaText value={pointsDelta(deep.closeRatePct, deep.prevCloseRatePct)} unit="pt" className="text-sm" />}>
        <p className="text-default-700 text-xs mt-1 mb-0">{fmt(t.h2Line, { n: fmtInt(deep.orders), noun, m: fmtInt(deep.chats) })}</p>
        <Spark data={deep.dailyOrders} kind="bar" name={fmt(t.dailyOf, { noun })} />
      </Tile>

      {spend && (
        <Tile title={t.h3Title} icon="cash" iconBg="bg-dark" number={formatBaht(spend.value)} badge={<DeltaText tone="neutral" value={pctChangeVsPrev(spend.value, spend.prev)} className="text-sm" />}>
          <p className="text-default-700 text-xs mt-1 mb-0">{spend.perChatDeep === null ? <NoDataCell /> : fmt(t.perChatDeep, { v: formatBaht(spend.perChatDeep) })}</p>
          <Spark data={spend.daily} kind="area" name={t.spendDaily} />
        </Tile>
      )}

      {status && <div className="sm:col-span-2 xl:col-span-2 flex items-center *:w-full">{status}</div>}
    </div>
  )
}
