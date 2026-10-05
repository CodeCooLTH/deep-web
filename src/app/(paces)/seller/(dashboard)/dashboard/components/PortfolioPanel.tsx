'use client'

/**
 * PortfolioPanel — "ภาพรวมทุกธุรกิจ" v1.1 (feature 00069) ใช้ทั้ง desktop (variant card) และในชีตมือถือ (variant sheet)
 * SSOT: docs/20 - Features/00069 - Professional Multi-Business Dashboard/UX-Design-Spec.md "ส่วนแก้ไข v1.1"
 *
 * Base (การ์ด + ตาราง): theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx (.card + stacked bar)
 * Base (กราฟแท่งซ้อน): theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/ColumnChart.tsx
 *   (getStackedColumnChart ใน data.ts) + widgets/charts/components/FinancialOverview.tsx — ผ่าน ApexChart wrapper (HR10)
 * Base (ตัวควบคุมช่วงเวลา ‹ ›, error+ลองใหม่, loading คงของเดิม): ./SalesChartSheet.tsx (in-app precedent)
 * Base (สลับร้านแล้วไปหน้าการเงิน): src/hooks/useShopSwitcher.ts — หนึ่ง hook ต่อแถว เพราะ landingPath ต่างกันตามประเภทร้าน
 *
 * ตารางเป็น list ของ <button> ทั้งแถว (grid) ไม่ใช่ <table> — <button> ห่อ <tr> ไม่ได้ ส่วน cell ใน <tr> ที่กดได้ทั้งแถว
 * ต้องซ้อน interactive ในตาราง; grid 12 คอลัมน์ให้หน้าตาเป็นตาราง 4 คอลัมน์ที่ md+ และแถว 2 บรรทัดที่ 375
 *
 * 🛑 Personal ไม่อยู่ในยอดรวม/กราฟ (มติ Q18/Q23) — แถวท้ายตารางเท่านั้น และไม่ใช่ปุ่มสลับร้าน (อยู่บริบทนี้อยู่แล้ว)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { ApexOptions } from 'apexcharts'
import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { cn, getColor } from '@/utils/helpers'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { todayThaiIsoDate } from '@/lib/date-range'
import { OTHERS_KEY, type ComparisonRow } from '@/lib/business-overview'
import { resolveOrderVocab } from '@/lib/seller-menu'
import {
  PORTFOLIO_BASIS_NOTE, PORTFOLIO_EMPTY_TITLE, PORTFOLIO_ERROR_TEXT, PORTFOLIO_INCOMPLETE_BADGE,
  PORTFOLIO_INCOMPLETE_HINT, PORTFOLIO_ROW_ERROR_TEXT, PORTFOLIO_TITLE,
  excludedCountNote, financeBasisNote, isCurrentOrFuturePeriod, othersLabel, portfolioChartAria,
  portfolioPeriodLabel, portfolioSeriesQuery, profitHeading, profitToneClass, rowAriaLabel, rowDotToken,
  shiftPeriod, shopIncompleteBadges, stackColorToken, switchPeriodMode, type PortfolioPeriod,
  formatSharePct,
  showTotalIncompleteBadge,
  isTotalProfitUnknown,
  PORTFOLIO_PROFIT_UNKNOWN,
  PORTFOLIO_PROFIT_UNKNOWN_HINT,
  PORTFOLIO_PERSONAL_BADGE_PARTS,
} from '@/lib/portfolio-display'
import type { PortfolioSeries } from '@/services/business-overview.service'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { axisAnchorDays } from './sales-chart-axis'

type Props = {
  initial: PortfolioSeries
  variant: 'card' | 'sheet'
}

const CHART_HEIGHT = 220

/** series ของกราฟ — bucket ในอนาคตเป็น null (ไม่วาดแต่ยังนับเป็นหมวดแกน x ให้ยาวเท่าเดือน/ปีเสมอ) */
export function buildPortfolioSeries(data: PortfolioSeries): NonNullable<ApexOptions['series']> {
  const { futureFromIndex } = data.aggregate
  const bizCount = data.rows.filter((r) => !r.isPersonal && r.status === 'OK').length
  const othersCount = bizCount - (data.stack.length - 1)
  return data.stack.map((s) => ({
    name: s.key === OTHERS_KEY ? othersLabel(othersCount) : s.name,
    type: 'bar',
    data: s.values.map((v, i) => (i < futureFromIndex ? v : null)),
  })) as NonNullable<ApexOptions['series']>
}

/** Base: ColumnChart.tsx getStackedColumnChart — stacked bar, สีจาก getColor ตามลำดับร้าน (ไม่มี hex) */
export function buildPortfolioChartOptions(data: PortfolioSeries): ApexOptions {
  const { labels, futureFromIndex } = data.aggregate
  const isDaily = data.mode === 'daily'
  const anchorDays = axisAnchorDays(labels.length, futureFromIndex)
  const todayLabel = futureFromIndex < labels.length ? labels[futureFromIndex - 1] : null
  return {
    series: buildPortfolioSeries(data),
    chart: {
      type: 'bar', height: CHART_HEIGHT, stacked: true, toolbar: { show: false },
      // ปิดลากซูม — จิ้มลากบนมือถือเกิดกล่อง selection ค้าง (ชุดเดียวกับกราฟยอดขาย)
      zoom: { enabled: false }, selection: { enabled: false }, parentHeightOffset: 0,
    },
    plotOptions: { bar: { horizontal: false, columnWidth: isDaily ? '80%' : '60%', borderRadius: 1 } },
    colors: data.stack.map((s, i) => getColor(stackColorToken(i, s.key, OTHERS_KEY))),
    // legend ของ Apex ถูกแทนที่ด้วยจุดสีในตาราง (จุดสี = ซีรีส์ 1:1)
    legend: { show: false },
    dataLabels: { enabled: false },
    fill: { opacity: 1 },
    stroke: { show: false },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: '10px', colors: getColor('default-700') },
        rotate: 0, rotateAlways: false, hideOverlappingLabels: false, trim: false,
        formatter: (v: string) => (isDaily ? (anchorDays.has(Number(v)) ? v : '') : v),
      },
    },
    // แกน y แบบย่อ (฿12k) — ไม่มีแกนแล้วอ่านค่ารายวันไม่ได้เลย (critique 2026-10-05)
    yaxis: { show: true, tickAmount: 3, labels: { style: { fontSize: '10px', colors: getColor('default-700') }, formatter: (v: number) => formatBahtCompact(v ?? 0) } },
    grid: {
      show: true, borderColor: getColor('chart-border-color'), strokeDashArray: 4,
      xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } },
      padding: { top: 0, right: 4, bottom: 0, left: 4 },
    },
    annotations: todayLabel
      ? {
          xaxis: [{
            x: todayLabel, borderColor: getColor('default-400'), strokeDashArray: 3,
            label: {
              text: isDaily ? 'วันนี้' : 'เดือนนี้', position: 'top', orientation: 'horizontal', offsetY: -4,
              borderWidth: 0, style: { background: 'transparent', color: getColor('default-700'), fontSize: '10px' },
            },
          }],
        }
      : undefined,
    tooltip: { shared: true, intersect: false, y: { formatter: (v: number) => formatNumberNoSymbol(v ?? 0) } },
  }
}

/** เนื้อแถว — ใช้ร่วมทั้งปุ่มร้านธุรกิจ และลิงก์ Personal (module level: ห้ามประกาศ component ใน render) */
function RowBody({ row, dot, personal }: { row: ComparisonRow; dot: string | null; personal: boolean }) {
  // ป้ายอยู่ "ในปุ่ม" ของแถว — แตะแล้วไปหน้าการเงินของร้านที่ตั้งต้นทุน/บันทึกค่าใช้จ่ายได้ (critique P1: ป้ายต้องพาไปแก้ได้)
  const badges = shopIncompleteBadges(row, resolveOrderVocab(row.vertical).costNoun)
  // สีเตือนตามป้ายเท่านั้น — ยอด 0 ไม่มีป้าย จึงต้องไม่ส้มด้วย (QA ยืนยัน 2026-10-05)
  const incomplete = badges.length > 0
  return (
    <>
      <span className="col-span-6 flex min-w-0 items-center gap-2 md:col-span-4">
        {/* จุดสี = สีแท่งในกราฟ · ว่างเว้นที่ไว้ให้ชื่อตรงกันทุกแถว */}
        <span
          className="size-2 shrink-0 rounded-full"
          style={dot ? { backgroundColor: `var(--color-${dot})` } : undefined}
          aria-hidden="true"
        />
        <AccountAvatar src={row.logoUrl} kind={row.isPersonal ? 'personal' : 'business'} className="size-7 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-sm font-semibold" title={row.shopName}>
            {row.shopName}
          </span>
          {/* ไม่ truncate — ป้าย "ไม่นับในยอดรวม" คือข้อมูลหลักของแถวนี้ ถูกตัดแล้วความหมายหาย (QA 2026-10-05) */}
          {personal && (
            <span className="text-default-700 flex min-w-0 flex-wrap gap-x-1 text-xs">
              {PORTFOLIO_PERSONAL_BADGE_PARTS.map((part) => (
                <span key={part} className="whitespace-nowrap">{part}</span>
              ))}
            </span>
          )}
        </span>
      </span>
      <span className="col-span-4 text-end text-sm font-semibold tabular-nums md:col-span-3">{formatBaht(row.sales)}</span>
      <span className="text-default-700 col-span-2 text-end text-xs tabular-nums md:order-4 md:col-span-2 md:text-sm">
        {formatSharePct(row.sharePct)}
      </span>
      <span
        className={cn(
          'col-span-12 ps-4 text-xs tabular-nums md:order-3 md:col-span-3 md:ps-0 md:text-end md:text-sm',
          profitToneClass(row.netProfit, incomplete),
        )}
      >
        <span className="md:sr-only">{profitHeading(row.netProfit, 'shop')} </span>
        {formatBaht(row.netProfit)}
      </span>
      {badges.length > 0 && (
        <span className="text-warning-ink col-span-12 flex min-w-0 items-center gap-1.5 ps-4 text-xs md:order-5">
          <Icon icon="info-circle" className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{badges.join(' · ')}</span>
        </span>
      )}
    </>
  )
}

const ROW_GRID = 'grid min-h-11 w-full grid-cols-12 items-center gap-x-2 gap-y-0.5 px-1 py-2.5 text-start'

/** แถวร้านธุรกิจ — ปุ่มทั้งแถว: สลับ session ร้านก่อนไปหน้าการเงิน (หนึ่ง hook ต่อแถว) */
function ShopRowButton({ row, dot }: { row: ComparisonRow; dot: string | null }) {
  const { switching, target, switchShop } = useShopSwitcher({ landingPath: row.href })
  return (
    <>
      <button
        type="button"
        disabled={switching}
        aria-label={rowAriaLabel(row.shopName)}
        onClick={() => switchShop(row.shopId, { name: row.shopName, kind: 'business', logo: row.logoUrl })}
        className={cn(ROW_GRID, 'hover:bg-default-100 focus-visible:ring-primary rounded-md focus-visible:ring-2 disabled:opacity-60')}
      >
        <RowBody row={row} dot={dot} personal={false} />
      </button>
      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </>
  )
}

function RowErrorLine({ row, dot, onRetry }: { row: ComparisonRow; dot: string | null; onRetry: () => void }) {
  return (
    <div className={cn(ROW_GRID, 'text-default-700')}>
      <span className="col-span-12 flex min-w-0 items-center gap-2 md:col-span-7">
        <span className="size-2 shrink-0 rounded-full" style={dot ? { backgroundColor: `var(--color-${dot})` } : undefined} aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-semibold" title={row.shopName}>{row.shopName}</span>
      </span>
      <span className="text-warning-ink col-span-12 flex min-w-0 items-center gap-1.5 text-xs md:col-span-5 md:justify-end">
        <Icon icon="alert-triangle" className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{PORTFOLIO_ROW_ERROR_TEXT} ·</span>
        <button type="button" onClick={onRetry} className="text-primary min-h-11 shrink-0 px-1 text-xs font-medium underline">
          ลองใหม่
        </button>
      </span>
    </div>
  )
}

export default function PortfolioPanel({ initial, variant }: Props) {
  // "ตอนนี้" ตามปฏิทินไทย ไม่ใช่ของเบราว์เซอร์ — ตัวเดียวกับที่ server ตัดยอด
  const now = useMemo(() => {
    const [year, month] = todayThaiIsoDate().split('-').map(Number)
    return { year, month }
  }, [])
  const [period, setPeriod] = useState<PortfolioPeriod>({
    mode: initial.mode,
    year: initial.year,
    month: initial.month ?? now.month,
  })
  const [data, setData] = useState<PortfolioSeries>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  // กดลองใหม่ = เปลี่ยนค่านี้ให้ effect ยิงซ้ำ (ไม่ต้องก๊อป logic fetch สองที่เหมือนชีตยอดขาย)
  const [reloadKey, setReloadKey] = useState(0)
  // เปิดครั้งแรกใช้ initial ที่ server เตรียมมาแล้ว — ข้าม fetch รอบแรก
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    let cancelled = false
    fetch(`/api/seller/portfolio-series?${portfolioSeriesQuery({ mode: period.mode, year: period.year, month: period.month })}`, {
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json() as Promise<PortfolioSeries>
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, reloadKey])

  // ตั้ง loading ที่จุดกด ไม่ใช่ใน effect (react-hooks/set-state-in-effect) — effect ทำแค่ fetch
  const startLoad = useCallback(() => {
    setLoading(true)
    setError(false)
  }, [])
  const retry = useCallback(() => {
    startLoad()
    setReloadKey((k) => k + 1)
  }, [startLoad])
  const changePeriod = useCallback(
    (next: (p: PortfolioPeriod) => PortfolioPeriod) => {
      startLoad()
      setPeriod(next)
    },
    [startLoad],
  )
  const getOptions = useCallback(() => buildPortfolioChartOptions(data), [data])
  const series = useMemo(() => buildPortfolioSeries(data), [data])

  const nextDisabled = isCurrentOrFuturePeriod(period, now)
  const periodLabel = portfolioPeriodLabel(period)
  const { totals, rows } = data
  const bizRows = rows.filter((r) => !r.isPersonal)
  const failedCount = bizRows.filter((r) => r.status === 'ERROR').length
  const basisNote = financeBasisNote(totals.mixedFinanceRules)
  const excludedNote = excludedCountNote(failedCount)
  const isEmpty = !loading && !error && totals.sales === 0
  const hasRows = rows.length > 0

  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* segmented [รายวัน|รายเดือน] — utility ล้วน ไม่ arbitrary (ชุดเดียวกับ SalesChartSheet) */}
      <div role="group" aria-label="ความละเอียดของช่วงเวลา" className="bg-default-100 flex items-center gap-0.5 rounded-lg p-0.5">
        {(['daily', 'monthly'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={period.mode === m}
            onClick={() => period.mode !== m && changePeriod(() => switchPeriodMode(m, now))}
            className={cn(
              'min-h-11 rounded-md px-3 text-xs font-medium transition-colors',
              period.mode === m ? 'bg-card text-primary shadow' : 'text-default-700',
            )}
          >
            {m === 'daily' ? 'รายวัน' : 'รายเดือน'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => changePeriod((p) => shiftPeriod(p, -1, now))}
          aria-label="ช่วงก่อนหน้า"
          className="btn btn-icon border-default-300 min-h-11 min-w-11"
        >
          <Icon icon="chevron-left" className="size-5" />
        </button>
        <p className="min-w-24 text-center text-sm font-bold text-dark" aria-live="polite">{periodLabel}</p>
        <button
          type="button"
          onClick={() => changePeriod((p) => shiftPeriod(p, 1, now))}
          disabled={nextDisabled}
          aria-label="ช่วงถัดไป"
          className={cn('btn btn-icon border-default-300 min-h-11 min-w-11', nextDisabled && 'pointer-events-none opacity-40')}
        >
          <Icon icon="chevron-right" className="size-5" />
        </button>
      </div>
    </div>
  )

  const profitUnknown = isTotalProfitUnknown(rows)
  const hero = (
    <div className={cn('min-w-0', variant === 'card' ? 'text-start' : 'text-center')}>
      <p className="text-default-700 text-xs">ยอดขายรวม</p>
      <p className="text-3xl font-bold tabular-nums break-words text-dark">{formatBaht(totals.sales)}</p>
      <p className="text-default-700 mt-2 text-xs">{profitHeading(profitUnknown ? 0 : totals.netProfit, 'total')}</p>
      {profitUnknown ? (
        <div>
          <p className="text-default-800 text-base font-semibold">{PORTFOLIO_PROFIT_UNKNOWN}</p>
          <p className="text-default-700 text-xs">{PORTFOLIO_PROFIT_UNKNOWN_HINT}</p>
        </div>
      ) : (
      <div className={cn('flex flex-wrap items-center gap-2', variant === 'sheet' && 'justify-center')}>
        <p className={cn('text-xl font-semibold tabular-nums break-words', profitToneClass(totals.netProfit, totals.incomplete))}>
          {formatBaht(totals.netProfit)}
        </p>
        {showTotalIncompleteBadge(totals) && (
          <span className="badge bg-warning/15 text-warning-ink gap-1.5" title={PORTFOLIO_INCOMPLETE_HINT}>
            <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
            {PORTFOLIO_INCOMPLETE_BADGE}
          </span>
        )}
      </div>
      )}
      {excludedNote && (
        <div className="text-default-700 mt-2 flex flex-col gap-1 text-xs">
          {excludedNote && (
            <p className="text-warning-ink flex items-start gap-1.5">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              {excludedNote}
            </p>
          )}
        </div>
      )}
    </div>
  )

  const chart = loading ? (
    // skeleton เฉพาะกราฟ — ตัวเลขด้านบนคงของเดิมไว้ (ห้ามกระพริบเป็นหน้าว่าง)
    <div className="bg-default-100 h-55 animate-pulse rounded-lg" />
  ) : isEmpty ? (
    <SellerEmptyState compact icon="chart-bar-off" title={PORTFOLIO_EMPTY_TITLE} />
  ) : (
    <div role="img" aria-label={portfolioChartAria(formatBaht(totals.sales), periodLabel)}>
      <ApexChart getOptions={getOptions} series={series} type="bar" height={CHART_HEIGHT} />
    </div>
  )

  const table = hasRows && (
    <div className="min-w-0">
      {/* หัวคอลัมน์ — เฉพาะ md+ (375 ใช้แถว 2 บรรทัดที่มีป้ายในตัว) */}
      <div className="text-default-700 border-default-200 hidden grid-cols-12 gap-x-2 border-b px-1 pb-2 text-xs md:grid">
        <span className="col-span-4">ธุรกิจ</span>
        <span className="col-span-3 text-end">ยอดขาย</span>
        <span className="col-span-3 text-end">กำไรสุทธิ</span>
        <span className="col-span-2 text-end">สัดส่วน</span>
      </div>
      <ul className="divide-default-200 divide-y">
        {rows.map((row) => {
          const dot = rowDotToken(data.stack, row, OTHERS_KEY)
          return (
            <li key={row.shopId}>
              {row.status === 'ERROR' ? (
                <RowErrorLine row={row} dot={dot} onRetry={retry} />
              ) : row.isPersonal ? (
                <Link
                  href={row.href}
                  aria-label={rowAriaLabel(row.shopName)}
                  className={cn(ROW_GRID, 'hover:bg-default-100 focus-visible:ring-primary rounded-md focus-visible:ring-2')}
                >
                  <RowBody row={row} dot={dot} personal />
                </Link>
              ) : (
                <ShopRowButton row={row} dot={dot} />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )

  const body = error ? (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <p className="text-default-700 text-sm">{PORTFOLIO_ERROR_TEXT}</p>
      <button type="button" onClick={retry} className="btn btn-sm border-default-300">
        ลองใหม่
      </button>
    </div>
  ) : (
    // loading: จางทั้งก้อนแต่ไม่ซ่อน — ตัวเลขเดิมยังอ่านได้ระหว่างรอช่วงใหม่
    <div aria-busy={loading} className={cn('transition-opacity', loading && 'opacity-50')}>
      {variant === 'card' ? (
        <div className="grid grid-cols-1 gap-base lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-4">{hero}</div>
            {chart}
          </div>
          <div className="min-w-0">{table}</div>
        </div>
      ) : (
        <>
          <div className="mb-3">{hero}</div>
          <div className="mb-4">{chart}</div>
          {table}
        </>
      )}
      {/* หมายเหตุอยู่ท้ายแผง ใกล้ตาราง ไม่คั่นระหว่างตัวเลขกับกราฟ (critique 2026-10-05 P3) */}
      <div className="text-default-700 mt-4 flex flex-col gap-1 text-xs">
        <p>{PORTFOLIO_BASIS_NOTE}</p>
        {basisNote && (
          <p className="flex items-start gap-1.5">
            <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            {basisNote}
          </p>
        )}
      </div>
    </div>
  )

  if (variant === 'sheet') {
    return (
      <>
        <div className="mb-4">{controls}</div>
        {body}
      </>
    )
  }
  return (
    <section aria-labelledby="portfolio-title" className="card">
      <div className="card-header flex-wrap items-center gap-3">
        <h2 id="portfolio-title" className="card-title">{PORTFOLIO_TITLE}</h2>
        {controls}
      </div>
      <div className="card-body">{body}</div>
    </section>
  )
}
