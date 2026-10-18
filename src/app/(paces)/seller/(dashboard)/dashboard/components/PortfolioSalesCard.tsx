'use client'

/**
 * PortfolioSalesCard — การ์ดมือถือ "ยอดขายรวม" ของบัญชี Personal ที่เป็นเจ้าของร้าน BUSINESS (00069 ext · 2026-10-18)
 * แตะเลข/กราฟ → PortfolioSheet เดิม · แตะแถวธุรกิจ → สลับไปร้านนั้น (/dashboard)
 * 🛑 ไม่ใช้กับแดชบอร์ดของแต่ละร้าน — ร้านเดี่ยวยังเป็น SalesChartCard/ServiceReportCard ทุกตัวอักษร (user 2026-10-18)
 *
 * Base (shell/pill/hero): ./SalesChartCard.tsx (Base เดิม StatisticCard)
 * Base (เดือนนี้): theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts getGroupedStackedBarChart
 * Base (วันนี้): theme/paces/Admin/TS/src/app/(admin)/charts/apex/area/components/data.ts getStackedAreaChart
 * Base (แถวสลับร้าน): ./PortfolioPanel.tsx ShopRowButton + useShopSwitcher + ShopSwitchOverlay
 * mockup: docs/superpowers/specs/2026-10-18-portfolio-card-stacked-by-business-mockup.html
 */
import { useState } from 'react'
import type { ApexOptions } from 'apexcharts'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import AccountAvatar from '@/components/AccountAvatar'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { getColor } from '@/utils/helpers'
import { formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { OTHERS_KEY, type PortfolioCard } from '@/lib/business-overview'
import { PORTFOLIO_CARD_TITLE, formatSharePct, othersLabel, rowDotToken, stackColorToken } from '@/lib/portfolio-display'
import type { PortfolioSeries } from '@/services/business-overview.service'
import { useT } from '@/i18n/LocaleProvider'
import { axisAnchorDays } from './sales-chart-axis'
import PortfolioSheet from './PortfolioSheet'

type Period = 'today' | 'month'

/** สูงเท่า SalesChartCard ทั้งสองแท็บ — การ์ดไม่กระโดดตอนสลับ (user สั่ง 2026-08-05) */
const CHART_HEIGHT = 168
const HOUR_ANCHORS = new Set(['00', '06', '12', '18', '24'])
const HOUR_LABELS = Array.from({ length: 25 }, (_, h) => String(h).padStart(2, '0'))
/** ค่าใช้จ่าย = เงินออก (มติ user 2026-10-18 เลือกแท่งแดงข้าง ๆ) — ไม่ใช่สถานะล้มเหลว */
const EXPENSE_TOKEN = 'danger'

const swatch = (token: string | null) => (token ? { backgroundColor: `var(--color-${token})` } : undefined)

export default function PortfolioSalesCard({ initial }: { initial: PortfolioSeries & { card: PortfolioCard } }) {
  const t = useT()
  const card = initial.card
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('month')
  const isToday = period === 'today'

  const hero = isToday ? card.todayTotal : card.total
  // วันนี้ไม่มีฐานเทียบ (user: "ไม่อยากให้เป็นเฉลี่ยของวันอื่น") · เดือน = เทียบเดือนก่อนถึงวันเดียวกัน
  const chgRaw = isToday ? null : pctChangeVsPrev(card.total, card.prevTotalToDate)
  const chg = chgRaw != null ? Math.round(chgRaw) : null

  const stack = isToday ? card.todayStack : card.monthStack
  const bizCount = card.rows.length
  const seriesName = (s: { key: string; name: string }) =>
    s.key === OTHERS_KEY ? othersLabel(bizCount - (stack.length - 1)) : s.name
  const colors = stack.map((s, i) => getColor(stackColorToken(i, s.key, OTHERS_KEY)))
  const hasExpense = card.expense != null

  // วันนี้: เรียงตามยอดของวัน (คำถามคือ "วันนี้ร้านไหนทำได้") · สีติดร้านตามลำดับยอดเดือนเสมอ
  const rows = isToday ? [...card.rows].sort((a, b) => b.todayTotal - a.todayTotal) : card.rows

  const grid = {
    show: true,
    borderColor: getColor('chart-border-color'),
    strokeDashArray: 4,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
    padding: { top: 0, right: 4, bottom: 0, left: 4 },
  }
  const axisLabelStyle = { fontSize: '10px', colors: getColor('default-700') }
  const chartBase = {
    stacked: true,
    toolbar: { show: false },
    // ปิดลากซูม — จิ้มลากบนมือถือเกิดกล่อง selection ค้าง (ชุดเดียวกับ SalesChartCard)
    zoom: { enabled: false },
    selection: { enabled: false },
    parentHeightOffset: 0,
  }

  const anchorDays = axisAnchorDays(card.labels.length, card.futureFromIndex)
  const todayDay = card.futureFromIndex < card.labels.length ? card.futureFromIndex : null
  const maskDays = (arr: number[]) => arr.map((v, i) => (i < card.futureFromIndex ? v : null))

  const monthSeries = [
    ...card.monthStack.map((s) => ({ name: seriesName(s), group: 'sales', data: maskDays(s.values) })),
    ...(hasExpense ? [{ name: 'ค่าใช้จ่าย', group: 'expense', data: maskDays(card.expense!) }] : []),
  ]
  const getMonthOptions = (): ApexOptions => ({
    chart: { type: 'bar', height: CHART_HEIGHT, ...chartBase },
    // แท่งคู่ (ยอดขาย | ค่าใช้จ่าย) ต่อวัน → ขยายช่องให้แต่ละครึ่งไม่บางเกินไปบนจอ 390
    plotOptions: { bar: { horizontal: false, columnWidth: hasExpense ? '94%' : '70%', borderRadius: 1 } },
    colors: [...colors, ...(hasExpense ? [getColor(EXPENSE_TOKEN)] : [])],
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    fill: { opacity: 1 },
    xaxis: {
      categories: card.labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: axisLabelStyle,
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: false,
        trim: false,
        formatter: (v: string) => (anchorDays.has(Number(v)) ? v : ''),
      },
    },
    yaxis: { show: false },
    grid,
    annotations: {
      xaxis: todayDay
        ? [{
            x: String(todayDay),
            borderColor: getColor('default-400'),
            strokeDashArray: 3,
            label: {
              text: t.dashboard.chartToday,
              position: 'top',
              orientation: 'horizontal',
              offsetY: -4,
              borderWidth: 0,
              style: { background: 'transparent', color: getColor('default-700'), fontSize: '10px' },
            },
          }]
        : [],
    },
    tooltip: { enabled: false },
  })

  // จุดสะสม 25 จุด (00:00–24:00) · หลังชั่วโมงปัจจุบันไม่วาด ไม่ลากเส้นเรียบไปถึงเที่ยงคืน
  const todaySeries = card.todayStack.map((s) => ({
    name: seriesName(s),
    data: s.values.map((v, i) => (i <= card.hourFutureFromIndex ? v : null)),
  }))
  const getTodayOptions = (): ApexOptions => ({
    chart: { type: 'area', height: CHART_HEIGHT, ...chartBase },
    colors,
    stroke: { width: 2, curve: 'stepline' },
    fill: { type: 'solid', opacity: 0.35 },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: HOUR_LABELS,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: axisLabelStyle,
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: false,
        trim: false,
        formatter: (v: string) => (HOUR_ANCHORS.has(v) ? `${v}:00` : ''),
      },
    },
    yaxis: { show: false },
    grid: { ...grid, padding: { ...grid.padding, left: 14, right: 10 } },
    tooltip: { enabled: false },
  })

  const pillClass = (on: boolean) =>
    `min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${on ? 'bg-card text-primary shadow' : 'text-default-700'}`

  return (
    <>
      <div className="card">
        <div className="card-body !p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Icon icon="chart-bar" className="size-4 text-primary" />
              <span className="text-sm font-bold text-dark">{PORTFOLIO_CARD_TITLE}</span>
            </div>
            <div role="group" aria-label={t.dashboard.salesCardRangeAria} className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
              <button type="button" onClick={() => setPeriod('today')} aria-pressed={isToday} className={pillClass(isToday)}>
                {t.dashboard.rangeToday}
              </button>
              <button type="button" onClick={() => setPeriod('month')} aria-pressed={!isToday} className={pillClass(!isToday)}>
                {t.dashboard.rangeMonth}
              </button>
            </div>
          </div>

          {/* โซนเปิดชีต: เลขใหญ่ + กราฟ · แถวธุรกิจอยู่นอกปุ่มนี้ (ห้ามปุ่มซ้อนปุ่ม) */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full text-start"
            aria-label={`${PORTFOLIO_CARD_TITLE}${isToday ? t.dashboard.rangeTodayInline : t.dashboard.rangeMonthInline} ${formatNumberNoSymbol(hero)}${hasExpense && !isToday ? ` ค่าใช้จ่าย ${formatNumberNoSymbol(card.expenseTotal)}` : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-4xl font-extrabold tracking-tight tabular-nums text-dark">{formatNumberNoSymbol(hero)}</p>
              <Icon icon="chevron-right" className="size-4 shrink-0 text-default-500" aria-hidden="true" />
            </div>
            {/* min-h กันการ์ดกระเด้งตอนสลับไปแท็บวันนี้ที่ไม่มี % */}
            <div className="min-h-5 -mt-0.5">
              {chg != null && (
                <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'}`}>
                  {chg !== 0 && <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-3.5" aria-hidden="true" />}
                  {Math.abs(chg)}% <span className="font-normal text-default-700">{t.dashboard.compareLastMonth}</span>
                </span>
              )}
            </div>
            <div className="mt-2">
              {isToday && card.todayTotal === 0 ? (
                <div className="flex h-42 items-center justify-center text-sm text-default-700">ยังไม่มียอดวันนี้</div>
              ) : isToday ? (
                <ApexChart key="today" getOptions={getTodayOptions} series={todaySeries} type="area" height={CHART_HEIGHT} />
              ) : (
                <ApexChart key="month" getOptions={getMonthOptions} series={monthSeries} type="bar" height={CHART_HEIGHT} />
              )}
            </div>
          </button>

          <ul className="mt-1 flex flex-col">
            {rows.map((r) => {
              const pct = isToday ? (card.todayTotal > 0 ? (r.todayTotal / card.todayTotal) * 100 : 0) : null
              return (
                <li key={r.shopId}>
                  <ShopSwitchRow
                    row={r}
                    dot={rowDotToken(card.monthStack, { shopId: r.shopId, isPersonal: false, status: 'OK' })}
                    amount={isToday ? r.todayTotal : r.monthTotal}
                    pct={pct}
                  />
                </li>
              )
            })}
            {/* แถวค่าใช้จ่ายคงไว้ในแท็บวันนี้แบบมองไม่เห็น — ความสูงการ์ดเท่ากันทั้งสองแท็บ */}
            {hasExpense && (
              <li className={isToday ? 'invisible' : undefined} aria-hidden={isToday || undefined}>
                <div className="flex min-h-11 min-w-0 items-center gap-2 px-1">
                  <span className="size-2 shrink-0 rounded-full" style={swatch(EXPENSE_TOKEN)} aria-hidden="true" />
                  <span className="bg-danger/15 text-danger-ink inline-flex size-6 shrink-0 items-center justify-center rounded-full">
                    <Icon icon="receipt-2" className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-default-800">ค่าใช้จ่าย</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-dark">{formatNumberNoSymbol(card.expenseTotal)}</span>
                  {/* เว้นที่เท่า chevron ให้ตัวเลขตรงแนวกับแถวธุรกิจ */}
                  <span className="size-4 shrink-0" aria-hidden="true" />
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      {open && <PortfolioSheet initial={initial} onClose={() => setOpen(false)} />}
    </>
  )
}

/** แถวธุรกิจ — แตะแล้วสลับไปร้านนั้น (หนึ่ง hook ต่อแถว · module level ห้ามประกาศใน render) */
function ShopSwitchRow({
  row,
  dot,
  amount,
  pct,
}: {
  row: PortfolioCard['rows'][number]
  dot: string | null
  amount: number
  pct: number | null
}) {
  const { switching, target, switchShop } = useShopSwitcher()
  return (
    <>
      <button
        type="button"
        disabled={switching}
        aria-label={`สลับไปร้าน ${row.shopName} ยอด ${formatNumberNoSymbol(amount)}`}
        onClick={() => switchShop(row.shopId, { name: row.shopName, kind: 'business', logo: row.logoUrl })}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-1 text-start hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      >
        <span className="size-2 shrink-0 rounded-full" style={swatch(dot)} aria-hidden="true" />
        <AccountAvatar src={row.logoUrl} kind="business" className="size-6" />
        <span className="min-w-0 flex-1 truncate text-sm text-default-800" title={row.shopName}>
          {row.shopName}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-dark">{formatNumberNoSymbol(amount)}</span>
        {pct != null && <span className="w-9 shrink-0 text-end text-xs text-default-700">{formatSharePct(pct)}</span>}
        <Icon icon="chevron-right" className="size-4 shrink-0 text-default-500" aria-hidden="true" />
      </button>
      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </>
  )
}
