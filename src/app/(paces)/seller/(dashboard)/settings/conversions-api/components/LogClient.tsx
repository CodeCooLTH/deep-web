'use client'

/**
 * บันทึกการส่ง — ตาราง + การ์ดมือถือ + ตัวกรอง 2 ตัวใน query string + โหลดเพิ่มแบบ cursor (feature 00089 หน้า 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (card-header toolbar + DataTable + mobileCard + card-footer — ตัด search/sort/checkbox)
 *   + theme: .../ui/dropdowns/page.tsx ผ่าน src/components/safepay/FilterDropdown.tsx (ตารางที่ re-render ทุกครั้งที่กรอง → Preline hs-dropdown พัง)
 *   + theme: .../ui/badges/page.tsx (badge soft -ink) · .../ui/placeholders/page.tsx ผ่าน SellerEmptyState
 *   + src/app/(paces)/seller/(dashboard)/_shared/ListBusyOverlay.tsx (แผงโหลดทับผลลัพธ์ตอนเปลี่ยนตัวกรอง)
 *
 * 🛑 ข้อมูลมาจาก cursor (ไม่มี total/เลขหน้า) จึงใช้ "โหลดเพิ่ม" แทน pagination แบบเลขหน้า · แถวอ่านอย่างเดียว ไม่มีปุ่มส่งซ้ำ (กัน Purchase ซ้ำ)
 */
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import DataTable from '@/components/table/DataTable'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatDateTime } from '@/lib/format-date'
import { CAPI_EVENTS } from '@/lib/meta-capi/events'
import { CAPI_EVENT_GROUPS, capiReasonKey } from '@/lib/meta-capi/ui'
import { cn } from '@/utils/helpers'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import ListBusyOverlay, { useListBusy } from '../../../_shared/ListBusyOverlay'
import { capiApi } from './shared'

export type LogRow = { id: string; createdAt: string; eventKey: string; datasetName: string; value: number | null; status: string; reason: string | null; attempts: number }

const ALL = ''
const META = new Map(CAPI_EVENTS.map((e) => [e.key as string, e.metaName]))
const columnHelper = createColumnHelper<LogRow>()
const money = (n: number) => `฿${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** สีเดียวกับป้ายสถานะหน้าอื่น: เขียวเฉพาะ "สำเร็จ" (Meta ตอบรับจริง) · ข้ามเป็นเทา (พฤติกรรมปกติ ไม่ใช่ความผิด) */
const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-warning/15 text-warning-ink',
  SENT: 'bg-success/15 text-success-ink',
  FAILED: 'bg-danger/15 text-danger-ink',
  SKIPPED: 'bg-default-100 text-default-800',
}

type Props = { channelId: string; initialRows: LogRow[]; initialCursor: string | null; status: string; event: string }

export default function LogClient({ channelId, initialRows, initialCursor, status, event }: Props) {
  const t = useT().conversionsApi
  const router = useRouter()
  const busy = useListBusy()
  const [rows, setRows] = useState(initialRows)
  const [cursor, setCursor] = useState(initialCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)

  const eventLabel = (k: string) => `${t.events[k as keyof typeof t.events]?.label ?? k} (${META.get(k) ?? k})`
  const reasonText = (r: LogRow) => {
    const k = capiReasonKey(r)
    return fmt(t.logReason[k], { n: Math.min(Math.max(r.attempts, 1), 3) })
  }

  const go = (next: { status?: string; event?: string }) => {
    const p = new URLSearchParams()
    const s = next.status ?? status
    const e = next.event ?? event
    if (s) p.set('status', s)
    if (e) p.set('event', e)
    busy.run(() => router.replace(`/settings/conversions-api/${channelId}/log${p.size ? `?${p}` : ''}`))
  }

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setMoreFailed(false)
    const p = new URLSearchParams({ cursor, take: '20' })
    if (status) p.set('status', status)
    if (event) p.set('eventKey', event)
    const r = await capiApi<{ rows: (Omit<LogRow, 'createdAt' | 'datasetName'> & { createdAt: string; datasetLabel: string | null; datasetId: string })[]; nextCursor: string | null }>(`/${channelId}/log?${p}`, 'GET')
    setLoadingMore(false)
    if (!r.ok) return setMoreFailed(true)
    setRows((prev) => [...prev, ...r.data.rows.map((x) => ({ id: x.id, createdAt: x.createdAt, eventKey: x.eventKey, datasetName: x.datasetLabel?.trim() || `Dataset ${x.datasetId}`, value: x.value, status: x.status, reason: x.reason, attempts: x.attempts }))])
    setCursor(r.data.nextCursor)
  }

  const statusBadge = (s: string) => <span className={cn('badge', STATUS_TONE[s] ?? STATUS_TONE.SKIPPED)}>{t.logStatus[s as keyof typeof t.logStatus] ?? s}</span>

  const columns = useMemo(
    () => [
      columnHelper.accessor('createdAt', { header: t.logColTime, cell: ({ getValue }) => <span className="text-default-800 whitespace-nowrap tabular-nums">{formatDateTime(getValue())}</span> }),
      columnHelper.accessor('eventKey', { header: t.logColEvent, cell: ({ getValue }) => <span className="text-default-900">{eventLabel(getValue())}</span> }),
      columnHelper.accessor('datasetName', { header: t.logColDataset, cell: ({ getValue }) => <span className="text-default-800">{getValue()}</span> }),
      columnHelper.accessor('value', {
        header: () => <span className="block w-full text-end">{t.logColValue}</span>,
        cell: ({ getValue }) => <span className="text-default-900 block text-end whitespace-nowrap tabular-nums">{getValue() === null ? '–' : money(getValue() as number)}</span>,
      }),
      columnHelper.accessor('status', { header: t.logColStatus, cell: ({ getValue }) => statusBadge(getValue()) }),
      columnHelper.accessor('reason', {
        header: t.logColReason,
        cell: ({ row }) => <span className={row.original.status === 'FAILED' ? 'text-danger-ink' : 'text-default-700'}>{reasonText(row.original)}</span>,
      }),
    ],
    // eventLabel/reasonText/statusBadge ผูกกับ t เท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  const filtered = !!(status || event)
  const statusOptions = [{ value: ALL, label: t.logAll }, ...(['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const).map((s) => ({ value: s, label: t.logStatus[s] }))]
  const eventOptions = [{ value: ALL, label: t.logAll }, ...CAPI_EVENT_GROUPS.flatMap((g) => g.keys).map((k) => ({ value: k as string, label: eventLabel(k) }))]

  const header = (
    <div className="card-header">
      <div>
        <h4 className="card-title">{t.logTitle}</h4>
        <p className="text-default-700 text-xs">{t.logRetention}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
        <FilterDropdown value={status} options={statusOptions} onChange={(v) => go({ status: v })} resetValue={ALL} defaultLabel={t.logFilterStatus} align="right" className="min-h-11 w-full justify-between sm:w-auto lg:min-h-0" />
        <FilterDropdown value={event} options={eventOptions} onChange={(v) => go({ event: v })} resetValue={ALL} defaultLabel={t.logFilterEvent} align="right" className="min-h-11 w-full justify-between sm:w-auto lg:min-h-0" />
      </div>
    </div>
  )

  if (rows.length === 0) {
    return (
      <div className="card">
        {header}
        <SellerEmptyState
          compact
          icon={filtered ? 'filter-off' : 'history'}
          title={filtered ? t.logNoMatch : t.logEmptyTitle}
          description={filtered ? undefined : t.logEmptyBody}
          {...(filtered ? { actionButton: { label: t.logClear, onClick: () => go({ status: '', event: '' }) } } : { action: { label: t.logEmptyBack, href: `/settings/conversions-api/${channelId}` } })}
        />
      </div>
    )
  }

  return (
    <div className="card">
      {header}
      <div className="relative" aria-busy={busy.busy}>
        <DataTable<LogRow>
          table={table}
          mobileCard={(row) => {
            const r = row.original
            return (
              <div className="px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-default-900 min-w-0 text-sm font-medium">{eventLabel(r.eventKey)}</p>
                  {statusBadge(r.status)}
                </div>
                <p className="text-default-700 mt-0.5 text-xs">
                  <span className="tabular-nums">{formatDateTime(r.createdAt)}</span>
                  <span className="max-sm:hidden"> · </span>
                  <br className="sm:hidden" />
                  {r.datasetName}
                  {r.value !== null && (
                    <>
                      {' · '}
                      <span className="text-default-900 tabular-nums">{money(r.value)}</span>
                    </>
                  )}
                </p>
                {capiReasonKey(r) !== 'none' && <p className={cn('mt-1 text-xs', r.status === 'FAILED' ? 'text-danger-ink' : 'text-default-800')}>{reasonText(r)}</p>}
              </div>
            )
          }}
        />
        <ListBusyOverlay busy={busy.busy} label={t.logLoadingMore} />
      </div>
      <div className="card-footer flex flex-wrap items-center justify-between gap-2">
        <span className="text-default-700 text-xs tabular-nums">{fmt(t.logShown, { n: rows.length })}</span>
        {moreFailed && (
          <span role="alert" className="text-danger-ink text-xs">
            {t.logError}
          </span>
        )}
        {cursor && (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="btn border-default-300 text-default-800 min-h-11 w-full border disabled:opacity-50 sm:w-auto lg:min-h-0">
            {loadingMore ? <span className="border-default-500 size-4 animate-spin rounded-full border-2 border-t-transparent" aria-hidden="true" /> : <Icon icon="chevron-down" className="size-4" aria-hidden="true" />}
            {loadingMore ? t.logLoadingMore : t.logLoadMore}
          </button>
        )}
      </div>
    </div>
  )
}
