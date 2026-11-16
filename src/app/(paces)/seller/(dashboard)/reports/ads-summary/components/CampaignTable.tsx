'use client'

/**
 * CampaignTable — แคมเปญ → ชุดโฆษณา → โฆษณา + ป้ายจัดกลุ่ม + เทียบที่ติ๊ก ≤3 + ส่งออก CSV (00094 FR-007/008)
 *
 * Base (โครงการ์ด: ค้นหา · "กรองตาม:" · ปุ่มหลักขวา · thead พื้นจาง · footer แบ่งหน้า):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 * Base (ปุ่ม ⊕/⊖ วงกลม primary · table-striped · แถวลูกเป็นตารางย่อ): theme/paces/Admin/TS/src/app/(admin)/tables/datatables/child-rows/components/Table.tsx
 * Base (การ์ดเทียบ): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * Base (แบ่งหน้า): src/components/table/TablePagination.tsx · Select = src/components/wrappers/Select.tsx (react-select ท่า form/select/components/Select2.tsx)
 *
 * ทำไมไม่ใช้ DataTable/tanstack: แถวลูก 3 ชั้น + แถวรวม/ไม่ทราบแคมเปญ ที่ผลรวมต้องเท่าตัวเลขหลัก — คุมลำดับแถวเองง่ายกว่า (ตัดสินตอน build ตาม O3)
 * 🛑 ห้าม <select>/checkbox native (BR-AIR-17) · แถวรวม = kpi ตัวเลขหลักตรง ๆ (ไม่รวมซ้ำจากแถว) · ข้อมูลน้อย = จาง ไม่ติดป้ายเชิงลบ
 * แท็บเล็ต 768: ตารางเลื่อนแนวนอนในการ์ดตัวเอง (ไม่มีมุมมองการ์ดมือถือ)
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import TablePagination from '@/components/table/TablePagination'
import { ratePct } from '@/lib/ad-quality-formulas'
import {
  ALL_COLS, COLS_STORAGE_KEY, DEFAULT_COLS, MAX_COMPARE, NO_FILTER, TAG_KEYS, TONE, filterCampaigns, formatValue, metricOf, objectiveLabel, pageSlice,
  parseCols, sortCampaigns, statusGroup, toggleSelect, type CampFilter, type ColKey,
} from '@/lib/ad-summary/view'
import type { AdRow, AdSummaryReport, AdsetRow, PerfTag, RollUp, TagReasonKey, TagReasonText } from '@/lib/ad-summary/types'
import type { AdReportRow } from '@/services/ad-sales-report.service'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import AdOrdersSheet from '../../ads/components/AdOrdersSheet'
import AdImage from './AdImage'
import { DeltaBadge, FilterSelect, NoValue, type Opt } from './Bits'

const ROW = 'border-default-200 hover:bg-default-50 border-t'
const TAG_STYLE: Record<NonNullable<PerfTag>, { cls: string; icon: string }> = {
  good: { cls: 'bg-primary/15 text-primary-ink', icon: 'trending-up' },
  watch: { cls: 'bg-warning/15 text-warning-ink', icon: 'alert-triangle' },
  ok: { cls: 'bg-light text-default-800', icon: '' },
  thin: { cls: 'border border-default-300 text-default-700', icon: 'info-circle' },
}

const REASON_KEYS: Record<TagReasonKey, string> = {
  other: 'rsOther', thin: 'rsThin', noBase: 'rsNoBase', good: 'rsGood', watchNoOrders: 'rsWatchNoOrders', watchRoas: 'rsWatchRoas', watchCpo: 'rsWatchCpo', ok: 'rsOk',
}

function TagBadge({ tag, reason }: { tag: PerfTag; reason: TagReasonText | null }) {
  const t = useT().adSummary
  if (!tag) return null
  const s = TAG_STYLE[tag]
  return (
    <span className={cn('badge', s.cls)} title={reason ? fmt((t as Record<string, string>)[REASON_KEYS[reason.key]], reason.params) : undefined}>
      {s.icon && <Icon icon={s.icon} className="text-xs" aria-hidden="true" />}
      {(t as Record<string, string>)[TAG_KEYS[tag]]}
    </span>
  )
}

/** ปุ่มเลือกคอลัมน์ — ปิดด้วย Esc / คลิกนอก */
function ColumnPicker({ cols, onChange }: { cols: ColKey[]; onChange: (c: ColKey[]) => void }) {
  const t = useT().adSummary
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="true" aria-expanded={open} title={t.pickColumns} aria-label={t.pickColumns} onClick={() => setOpen((o) => !o)} className="btn btn-icon border-default-300 hover:text-primary size-11 border lg:size-9">
        <Icon icon="columns-3" className="text-lg" aria-hidden="true" />
      </button>
      {open && (
        <div className="bg-card border-default-300 absolute end-0 top-full z-30 mt-1 w-56 rounded border p-2 shadow-lg" role="group" aria-label={t.pickColumns}>
          {ALL_COLS.map((c) => (
            <label key={c.key} className="hover:bg-default-100 flex min-h-11 cursor-pointer items-center gap-2.5 rounded px-2 text-sm lg:min-h-8">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={cols.includes(c.key)}
                // ต้องเหลืออย่างน้อย 1 คอลัมน์ — ตารางเปล่าคอลัมน์ไม่มีความหมาย
                disabled={cols.includes(c.key) && cols.length === 1}
                onChange={() => onChange(ALL_COLS.map((x) => x.key).filter((k) => (k === c.key ? !cols.includes(k) : cols.includes(k))))}
              />
              {(t as Record<string, string>)[c.label]}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function Cell({ row, col, prevSpend }: { row: Pick<RollUp, 'spend' | 'sales' | 'orders' | 'coveredSales' | 'coveredOrders' | 'chats' | 'chatsMeta' | 'impressions' | 'clicks'>; col: ColKey; prevSpend?: number | null }) {
  if (col === 'delta') return prevSpend === undefined ? null : <DeltaBadge pair={{ cur: row.spend, prev: prevSpend }} tone={TONE.spend} />
  const v = metricOf(row, col)
  const unit = ALL_COLS.find((c) => c.key === col)!.unit
  return v === null ? <NoValue /> : <>{formatValue(unit, v)}</>
}

const toSheetRow = (a: AdRow): AdReportRow => ({
  adId: a.adId, adTitle: a.name, adPhotoFileId: a.photoFileId, chats: a.chats, orders: a.orders, cogs: a.cogs, closeRatePct: ratePct(a.orders, a.chats),
  sales: a.sales, avgPerOrder: a.orders > 0 ? a.sales / a.orders : null, cancelledOrReturned: 0, spend: a.spend, noChats: false,
})

/** แถวลูก: ตารางย่อ ชุดโฆษณา → โฆษณา (ชุด null name = ไม่ทราบแคมเปญ ไม่มีหัวชุด) */
function ChildTable({ groups, cols, onOpen }: { groups: { set: AdsetRow | null; ads: AdRow[] }[]; cols: ColKey[]; onOpen: (a: AdRow) => void }) {
  const t = useT().adSummary
  const dict = t as Record<string, string>
  const childCols = cols.filter((c) => c !== 'delta')
  return (
    <div className="border-default-200 overflow-hidden rounded border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-default-50 text-default-700 text-2xs">
            <th className="px-3 py-2 text-start font-semibold">{t.cName}</th>
            <th className="px-3 py-2 text-start font-semibold">{t.cTag}</th>
            {childCols.map((c) => (
              <th key={c} className="px-3 py-2 text-end font-semibold whitespace-nowrap">
                {dict[ALL_COLS.find((x) => x.key === c)!.label]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <ChildGroup key={g.set?.adsetId ?? `g${gi}`} group={g} childCols={childCols} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChildGroup({ group, childCols, onOpen }: { group: { set: AdsetRow | null; ads: AdRow[] }; childCols: ColKey[]; onOpen: (a: AdRow) => void }) {
  const t = useT().adSummary
  return (
    <>
      {group.set && (
        <tr className="bg-light font-medium">
          <td className="px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Icon icon="stack-2" className="text-default-600 text-base" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-default-800 mb-0 max-w-72 truncate" title={group.set.name ?? group.set.adsetId}>
                  {fmt(t.adsetPrefix, { name: group.set.name ?? group.set.adsetId })}
                </p>
                <p className="text-default-600 text-2xs mb-0 font-normal">{fmt(t.adsCount, { n: group.ads.length })}</p>
              </div>
            </div>
          </td>
          <td className="px-3 py-2" />
          {childCols.map((c) => (
            <td key={c} className="text-default-900 px-3 py-2 text-end tabular-nums">
              <Cell row={group.set!} col={c} />
            </td>
          ))}
        </tr>
      )}
      {group.ads.map((a) => (
        <tr key={a.adId} className={cn('border-default-200 border-t', a.tag === 'thin' && 'opacity-70')}>
          <td className="px-3 py-2">
            <div className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: group.set ? 18 : 0 }}>
              <AdImage ad={a} className="size-8 rounded" iconClass="text-base" />
              <div className="min-w-0">
                <p className="text-default-900 mb-0 max-w-72 truncate" title={a.name ?? a.adId}>
                  {a.name ?? a.adId}
                </p>
                <button type="button" onClick={() => onOpen(a)} className="text-primary-ink text-2xs inline-flex min-h-11 items-center font-medium lg:min-h-0">
                  {t.viewOrders}
                </button>
              </div>
            </div>
          </td>
          <td className="px-3 py-2">
            <TagBadge tag={a.tag} reason={a.tagReason} />
          </td>
          {childCols.map((c) => (
            <td key={c} className="text-default-900 px-3 py-2 text-end tabular-nums">
              <Cell row={a} col={c} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export default function CampaignTable({ report, rangeQuery, noun, shopChannelId }: { report: AdSummaryReport; rangeQuery: string; noun: string; shopChannelId: string | null }) {
  const t = useT().adSummary
  const dict = t as Record<string, string>
  const { campaigns, unknownCampaign, kpi } = report
  const [filter, setFilter] = useState<CampFilter>(NO_FILTER)
  const [sort, setSort] = useState<{ key: ColKey; dir: 'asc' | 'desc' }>({ key: 'spend', dir: 'desc' })
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)
  const [expanded, setExpanded] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS)
  const [sheetRow, setSheetRow] = useState<AdReportRow | null>(null)

  // อ่านจาก localStorage หลัง mount — ถ้าอ่านตอน render เซิร์ฟเวอร์กับ client จะ hydrate ไม่ตรงกัน
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync จากที่เก็บภายนอกหลัง mount (ไม่มีทางอ่านตอน SSR)
    // เบราว์เซอร์บล็อกที่เก็บ (โหมดส่วนตัว/นโยบาย) = ใช้ค่าตั้งต้น ห้ามพังทั้งตาราง
    try { setCols(parseCols(window.localStorage.getItem(COLS_STORAGE_KEY))) } catch { /* ใช้ DEFAULT_COLS */ }
  }, [])
  const changeCols = (next: ColKey[]) => {
    setCols(next)
    try { window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)) } catch { /* จำค่าไม่ได้ก็ยังเปลี่ยนคอลัมน์ได้ */ }
  }
  // เปลี่ยนตัวกรอง = กลับหน้าแรก (ไม่งั้นหน้าเกินจำนวนแถวที่เหลือ)
  const patch = (p: Partial<CampFilter>) => {
    setFilter((f) => ({ ...f, ...p }))
    setPageIndex(0)
  }

  const objectives = useMemo(() => [...new Set(campaigns.map((c) => c.objective).filter((o): o is string => o !== null))], [campaigns])
  const rows = useMemo(() => sortCampaigns(filterCampaigns(campaigns, filter), sort.key, sort.dir), [campaigns, filter, sort])
  const page = pageSlice(rows.length, pageIndex, pageSize)
  const visible = rows.slice(page.from, page.to)
  const toggleExpand = (id: string) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]))
  const compare = selected.map((id) => campaigns.find((c) => c.campaignId === id)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const hasUnknown = unknownCampaign.ads.length > 0
  // ส่งออกตามระดับที่กางอยู่ (FR-008 AC-1) — กางแล้ว = ระดับโฆษณา · ยังไม่กาง = แคมเปญ
  const level = expanded.length > 0 ? 'ad' : 'campaign'
  const exportHref = `/api/reports/ads-summary/export?${rangeQuery}&level=${level}`

  const toggleSort = (key: ColKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  const statusOpts: Opt[] = [{ value: 'all', label: t.fAllStatus }, { value: 'on', label: t.stOn }, { value: 'off', label: t.stOff }]
  const objOpts: Opt[] = [{ value: 'all', label: t.fAllObjective }, ...objectives.map((o) => ({ value: o, label: objectiveLabel(dict, o) }))]
  const tagOpts: Opt[] = [{ value: 'all', label: t.fAllTag }, ...(['good', 'ok', 'watch', 'thin'] as const).map((k) => ({ value: k, label: dict[TAG_KEYS[k]] }))]
  const sizeOpts: Opt[] = ['5', '10', '20'].map((v) => ({ value: v, label: v }))
  const statusLabel = (s: string | null) => (statusGroup(s) === 'on' ? t.stOn : statusGroup(s) === 'off' ? t.stOff : '')
  const colSpan = cols.length + 3

  return (
    <div id="ads-summary-campaigns" className="card scroll-mt-24">
      <div className="card-header flex-col items-stretch gap-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="card-title">{t.campTitle}</h4>
          <div className="flex items-center gap-2">
            <ColumnPicker cols={cols} onChange={changeCols} />
            <a href={exportHref} download className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
              <Icon icon="download" className="text-base" aria-hidden="true" />
              {t.exportCsv}
            </a>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="input-icon-group w-64">
            <Icon icon="search" className="input-icon" aria-hidden="true" />
            <input type="text" className="form-input" placeholder={t.campSearch} aria-label={t.campSearchAria} value={filter.q} onChange={(e) => patch({ q: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-default-800 me-1 font-semibold text-nowrap">{t.filterBy}</span>
            <FilterSelect width="w-40" label={t.fStatus} value={filter.status} options={statusOpts} onChange={(v) => patch({ status: v as CampFilter['status'] })} />
            <FilterSelect width="w-52" label={t.fObjective} value={filter.objective} options={objOpts} onChange={(v) => patch({ objective: v })} />
            <FilterSelect width="w-40" label={t.fTag} value={filter.tag} options={tagOpts} onChange={(v) => patch({ tag: v as CampFilter['tag'] })} />
            <FilterSelect width="w-20" label={t.fPageSize} value={String(pageSize)} options={sizeOpts} onChange={(v) => { setPageSize(Number(v)); setPageIndex(0) }} />
          </div>
        </div>
      </div>

      {compare.length >= 2 && (
        <div className="bg-default-50 border-default-300 border-b border-dashed px-5 py-4">
          <p className="text-default-800 mb-3 text-sm font-medium">{fmt(t.compareTitle, { n: compare.length })}</p>
          <div className="gap-base grid grid-cols-1 md:grid-cols-3">
            {compare.map((c) => (
              <div key={c.campaignId} className="card">
                <div className="card-body">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h5 className="text-default-800 truncate text-sm font-medium" title={c.name ?? c.campaignId}>
                      {c.name ?? c.campaignId}
                    </h5>
                    <TagBadge tag={c.tag} reason={c.tagReason} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {([['cSpend', 'spend'], ['cRoas', 'roas'], ['cCpa', 'cpa']] as const).map(([label, k]) => (
                      <div key={k}>
                        <p className="text-default-600 mb-0 text-xs">{dict[label]}</p>
                        <p className="text-default-900 text-md mb-0 font-semibold tabular-nums">
                          <Cell row={c} col={k} />
                        </p>
                      </div>
                    ))}
                    <div>
                      <p className="text-default-600 mb-0 text-xs">{t.tClose}</p>
                      <p className="text-default-900 text-md mb-0 font-semibold tabular-nums">{formatValue('pct1', ratePct(c.orders, c.chats))}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-default-50 text-default-700 text-2xs">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-start font-semibold">{t.cName}</th>
              <th className="px-3 py-2.5 text-start font-semibold">{t.cTag}</th>
              {cols.map((c) => {
                const def = ALL_COLS.find((x) => x.key === c)!
                return (
                  <th key={c} className="px-3 py-2.5 text-end font-semibold whitespace-nowrap" aria-sort={sort.key === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggleSort(c)} className="inline-flex min-h-11 items-center gap-1 lg:min-h-0">
                      {dict[def.label]}
                      {sort.key === c && <Icon icon={sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} className="text-xs" aria-hidden="true" />}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => {
              const open = expanded.includes(c.campaignId)
              const name = c.name ?? c.campaignId
              const checked = selected.includes(c.campaignId)
              return (
                <Fragment key={c.campaignId}>
                  <tr className={cn(ROW, i % 2 === 1 && 'bg-default-50', c.tag === 'thin' && 'opacity-70')}>
                  <td className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      aria-label={fmt(t.selectAria, { name })}
                      checked={checked}
                      disabled={!checked && selected.length >= MAX_COMPARE}
                      title={!checked && selected.length >= MAX_COMPARE ? t.selectMax : undefined}
                      onChange={() => setSelected((s) => toggleSelect(s, c.campaignId))}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button type="button" onClick={() => toggleExpand(c.campaignId)} aria-expanded={open} aria-label={fmt(open ? t.collapseAria : t.expandAria, { name })} className="flex size-11 shrink-0 items-center justify-center lg:size-8">
                        <span className="bg-primary flex size-5.5 items-center justify-center rounded-full text-white">
                          <Icon icon={open ? 'minus' : 'plus'} className="text-sm" aria-hidden="true" />
                        </span>
                      </button>
                      <div className="min-w-0">
                        <p className="text-default-900 mb-0 max-w-72 truncate font-medium" title={name}>
                          {name}
                        </p>
                        <p className="text-default-600 text-2xs mb-0">{[objectiveLabel(dict, c.objective), statusLabel(c.status)].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <TagBadge tag={c.tag} reason={c.tagReason} />
                  </td>
                  {cols.map((col) => (
                    <td key={col} className="text-default-900 px-3 py-2.5 text-end tabular-nums">
                      <Cell row={c} col={col} prevSpend={c.prevSpend} />
                    </td>
                  ))}
                  </tr>
                  {open && (
                    <ExpandedRow colSpan={colSpan}>
                      <ChildTable groups={c.adsets.map((s) => ({ set: s, ads: s.ads }))} cols={cols} onOpen={(a) => setSheetRow(toSheetRow(a))} />
                    </ExpandedRow>
                  )}
                </Fragment>
              )
            })}
            {hasUnknown && (
              <Fragment>
                <tr className={cn(ROW, 'bg-default-50')}>
                <td className="w-10 px-3 py-2.5" />
                <td className="px-3 py-2.5" colSpan={2}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand('unknown')}
                      aria-expanded={expanded.includes('unknown')}
                      aria-label={fmt(expanded.includes('unknown') ? t.collapseAria : t.expandAria, { name: t.unknownCampaign })}
                      className="flex size-11 shrink-0 items-center justify-center lg:size-8">
                      <span className="bg-primary flex size-5.5 items-center justify-center rounded-full text-white">
                        <Icon icon={expanded.includes('unknown') ? 'minus' : 'plus'} className="text-sm" aria-hidden="true" />
                      </span>
                    </button>
                    <div>
                      <p className="text-default-800 mb-0 font-medium">{t.unknownCampaign}</p>
                      <p className="text-default-600 text-2xs mb-0">{fmt(t.unknownCount, { n: unknownCampaign.ads.length })}</p>
                    </div>
                  </div>
                </td>
                {cols.map((col) => (
                  <td key={col} className="text-default-800 px-3 py-2.5 text-end tabular-nums">
                    <Cell row={unknownCampaign} col={col} />
                  </td>
                ))}
                </tr>
                {expanded.includes('unknown') && (
                  <ExpandedRow colSpan={colSpan}>
                    <ChildTable groups={[{ set: null, ads: unknownCampaign.ads }]} cols={cols} onOpen={(a) => setSheetRow(toSheetRow(a))} />
                  </ExpandedRow>
                )}
              </Fragment>
            )}
            {rows.length === 0 && !hasUnknown && (
              <tr>
                <td colSpan={colSpan} className="text-default-700 px-3 py-8 text-center">
                  {t.campEmpty}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-default-300 bg-default-100 border-t font-semibold">
              <td />
              <td className="text-default-900 px-3 py-2.5" colSpan={2}>
                {t.totalRow}
              </td>
              {cols.map((c) => (
                <td key={c} className="text-default-900 px-3 py-2.5 text-end tabular-nums">
                  {c === 'delta' ? <DeltaBadge pair={kpi.spend} tone={TONE.spend} /> : kpi[c].cur === null ? <NoValue /> : formatValue(ALL_COLS.find((x) => x.key === c)!.unit, kpi[c].cur)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={rows.length}
            start={page.start}
            end={page.end}
            itemsName={t.campTitle}
            showInfo
            previousPage={() => setPageIndex(page.index - 1)}
            canPreviousPage={page.index > 0}
            pageCount={page.pageCount}
            pageIndex={page.index}
            setPageIndex={setPageIndex}
            nextPage={() => setPageIndex(page.index + 1)}
            canNextPage={page.index < page.pageCount - 1}
          />
        </div>
      )}

      {sheetRow && <AdOrdersSheet row={sheetRow} noun={noun} rangeQuery={rangeQuery.split('&').filter((p) => !p.startsWith('adId=')).join('&')} onClose={() => setSheetRow(null)} />}
    </div>
  )
}

function ExpandedRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr className="border-default-200 border-t">
      <td />
      <td colSpan={colSpan - 1} className="px-3 pt-1 pb-4">
        {children}
      </td>
    </tr>
  )
}
