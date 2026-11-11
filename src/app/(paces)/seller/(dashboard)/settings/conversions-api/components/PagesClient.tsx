'use client'

/**
 * หน้ารายการเพจ Messenger + สวิตช์ส่งเหตุการณ์ (feature 00089 หน้า 1)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (card-header + DataTable + mobileCard + onRowClick — ตัดตัวกรอง/เรียง/pagination: เพจมีไม่กี่ตัว)
 *   + theme: .../form/elements/components/ChecksRadioSwitches.tsx (form-switch)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyRow.tsx (optimistic + revert + pacesToast)
 */
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import DataTable from '@/components/table/DataTable'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { capiPageStatus, purchaseTimingOf, stoppedCount } from '@/lib/meta-capi/ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { PageAvatar, ReconnectLink, StatusBadge, capiApi } from './shared'

export type PageRow = {
  channelId: string
  name: string
  avatarUrl: string | null
  enabled: boolean
  /** เคยเปิดแล้ว (มี enabledAt) — ครั้งแรกต้องถามก่อน */
  everEnabled: boolean
  purchaseAt: string
  datasets: { status: string; events: string[] }[]
  sent7d: number
}

type Meta = { toggle: (r: PageRow, next: boolean) => void; busy: ReadonlySet<string> }
const columnHelper = createColumnHelper<PageRow>()
const num = new Intl.NumberFormat('en-US')

function StatusCell({ row }: { row: PageRow }) {
  const t = useT().conversionsApi
  const status = capiPageStatus(row)
  return (
    <div>
      <StatusBadge status={status} />
      {status === 'off' && row.datasets.length === 0 && <p className="text-default-700 mt-0.5 text-xs">{t.noDatasetsYet}</p>}
      {status === 'problem' && <p className="text-warning-ink mt-0.5 text-xs">{fmt(t.datasetsStopped, { n: stoppedCount(row.datasets) })}</p>}
      {status === 'stopped' && (
        <div className="mt-1.5">
          <ReconnectLink />
        </div>
      )}
    </div>
  )
}

function PurchaseText({ row }: { row: PageRow }) {
  const t = useT().conversionsApi
  const at = purchaseTimingOf(row)
  return <span className={at ? 'text-default-800' : 'text-default-600'}>{at ? t.purchaseAt[at] : t.purchaseNone}</span>
}

function PageSwitch({ row, meta }: { row: PageRow; meta: Meta }) {
  const t = useT().conversionsApi
  const noDs = row.datasets.length === 0
  return (
    <input
      type="checkbox"
      className="form-switch shrink-0"
      checked={row.enabled}
      disabled={noDs || meta.busy.has(row.channelId)}
      title={noDs ? t.switchNeedsDataset : undefined}
      aria-label={fmt(t.switchAria, { name: row.name })}
      aria-busy={meta.busy.has(row.channelId) || undefined}
      onChange={(e) => meta.toggle(row, e.target.checked)}
    />
  )
}

export default function PagesClient({ initial }: { initial: PageRow[] }) {
  const t = useT().conversionsApi
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())

  const patch = (id: string, p: Partial<PageRow>) => setRows((rs) => rs.map((r) => (r.channelId === id ? { ...r, ...p } : r)))
  const setBusyOf = (id: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  // optimistic + revert + pacesToast (ท่า AutoNotifyRow) — เปิดครั้งแรกถามก่อนเพราะ "ไม่ส่งย้อนหลัง" แก้คืนไม่ได้
  const toggle = async (row: PageRow, next: boolean) => {
    if (busy.has(row.channelId)) return
    if (next && !row.everEnabled) {
      const ok = await pacesConfirm.question(fmt(t.swalFirstTitle, { name: row.name }), t.swalFirstText, {
        confirmButtonText: t.swalFirstOk,
        cancelButtonText: t.swalFirstCancel,
        confirmSemantic: 'primary',
      })
      if (!ok) return
    }
    const prev = row.enabled
    patch(row.channelId, { enabled: next })
    setBusyOf(row.channelId, true)
    const r = await capiApi(`/${row.channelId}`, 'PUT', { enabled: next })
    setBusyOf(row.channelId, false)
    if (!r.ok) {
      patch(row.channelId, { enabled: prev })
      pacesToast.error(t.toastSwitchFailed)
      if (r.status === 404) router.refresh()
      return
    }
    patch(row.channelId, { enabled: next, everEnabled: row.everEnabled || next })
    pacesToast.success(fmt(next ? t.toastOn : t.toastOff, { name: row.name }))
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'page',
        header: t.colPage,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <PageAvatar src={row.original.avatarUrl} name={row.original.name} />
            <div className="min-w-0">
              <p className="text-default-900 max-w-60 truncate font-medium" title={row.original.name}>
                {row.original.name}
              </p>
              <p className="text-default-700 text-xs">{t.messenger}</p>
            </div>
          </div>
        ),
      }),
      columnHelper.display({ id: 'status', header: t.colStatus, cell: ({ row }) => <StatusCell row={row.original} /> }),
      columnHelper.display({
        id: 'sent',
        header: () => <span className="block w-full text-end">{t.colSent7d}</span>,
        cell: ({ row }) => <span className="text-default-900 block text-end whitespace-nowrap tabular-nums">{row.original.datasets.length === 0 ? '–' : num.format(row.original.sent7d)}</span>,
      }),
      columnHelper.display({ id: 'purchase', header: t.colPurchaseAt, cell: ({ row }) => <PurchaseText row={row.original} /> }),
      columnHelper.display({
        id: 'switch',
        header: t.colSwitch,
        cell: ({ row, table }) => <PageSwitch row={row.original} meta={table.options.meta as Meta} />,
      }),
      columnHelper.display({
        id: 'open',
        header: () => <span className="sr-only">{t.colOpen}</span>,
        cell: ({ row }) => (
          <Link href={`/settings/conversions-api/${row.original.channelId}`} aria-label={fmt(t.openRowAria, { name: row.original.name })} className="text-default-600 flex size-9 items-center justify-center">
            <Icon icon="chevron-right" className="size-4.5" aria-hidden="true" />
          </Link>
        ),
      }),
    ],
    [t],
  )

  const table = useReactTable({ data: rows, columns, meta: { toggle, busy } satisfies Meta, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{fmt(t.listCardTitle, { n: rows.length })}</h4>
        <Link href="/settings/channels" className="btn border-default-300 text-default-800 min-h-11 w-full border sm:w-auto lg:min-h-0">
          <Icon icon="plus" className="size-4" aria-hidden="true" />
          {t.connectMore}
        </Link>
      </div>
      <DataTable<PageRow>
        table={table}
        onRowClick={(row) => router.push(`/settings/conversions-api/${row.original.channelId}`)}
        mobileCard={(row) => {
          const r = row.original
          const status = capiPageStatus(r)
          const at = purchaseTimingOf(r)
          return (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <Link href={`/settings/conversions-api/${r.channelId}`} className="flex min-w-0 flex-1 items-start gap-3" aria-label={fmt(t.openRowAria, { name: r.name })}>
                <PageAvatar src={r.avatarUrl} name={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-default-900 truncate font-medium" title={r.name}>
                    {r.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2">
                    <StatusBadge status={status} />
                    {status === 'off' && r.datasets.length === 0 && <span className="text-default-700 text-xs">{t.noDatasetsYet}</span>}
                  </div>
                  {status === 'problem' && <p className="text-warning-ink mt-0.5 text-xs">{fmt(t.datasetsStopped, { n: stoppedCount(r.datasets) })}</p>}
                  {r.datasets.length > 0 && status !== 'stopped' && (
                    <>
                      <p className="text-default-700 mt-1 text-xs">
                        {t.sent7dLabel} <span className="text-default-900 tabular-nums">{num.format(r.sent7d)}</span>
                      </p>
                      <p className="text-default-700 text-xs">{at ? fmt(t.purchaseWhen, { when: t.purchaseAt[at] }) : t.purchaseNone}</p>
                    </>
                  )}
                </div>
                <Icon icon="chevron-right" className="text-default-500 mt-1 size-4.5 shrink-0 self-center" aria-hidden="true" />
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <PageSwitch row={r} meta={table.options.meta as Meta} />
                {status === 'stopped' && <ReconnectLink />}
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}
