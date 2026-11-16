'use client'

/**
 * SendHistoryClient — แท็บ "ประวัติการส่ง": ตาราง (≥lg) / การ์ดทั้งใบกดได้ (<lg) + โหลดเพิ่มแบบ keyset (00095 S-7 · mockup ส่วน 2)
 * ลูกค้า = รูปโปรไฟล์ + โลโก้แพลตฟอร์มเกยมุม + ชื่อ + "ชื่อเพจ · แพลตฟอร์ม" แบบแถวกล่องแชท (UX §18) · ไม่มีตัวกรอง (BR-FB-71)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx (DataTable — ตัดค้นหา/แบ่งหน้า)
 *   + src/app/(paces)/seller/(dashboard)/settings/chatbot/logs/ChatLogsList.tsx (รายการประวัติ + โหลดเพิ่ม)
 *   + settings/tags/components/TagsClient.tsx (DataTable · badge)
 *   theme: .../ui/badges/page.tsx
 */
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import DataTable from '@/components/table/DataTable'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { sendOutcome, type ResultTone } from '@/lib/sales-follow-bot/ui'
import type { SendReason } from '@/lib/sales-follow-bot/constants'
import type { SendHistoryItem } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform } from './sfb-ui'

const columnHelper = createColumnHelper<SendHistoryItem>()
type Dict = ReturnType<typeof useT>['salesFollowBot']

const TONE: Record<ResultTone, string> = {
  ok: 'bg-success/15 text-success-ink', // เขียวใช้ที่นี่ที่เดียว — "สำเร็จ" จริง (ตั้งหลังตัวส่งรับสำเร็จ)
  warn: 'bg-warning/15 text-warning-ink',
  err: 'bg-danger/15 text-danger-ink',
  idle: 'bg-default-200 text-default-800',
}
const RESULT_LABEL = { sent: 'resultSent', skipped: 'resultSkipped', failed: 'resultFailed', sending: 'resultSending', uncertain: 'resultUncertain' } as const

function ResultBadge({ item, t }: { item: SendHistoryItem; t: Dict }) {
  const o = sendOutcome(item.status, item.reason)
  return <span className={`badge text-xs ${TONE[o.tone]}`}>{t[RESULT_LABEL[o.key]]}</span>
}

const reasonOf = (item: SendHistoryItem, t: Dict): string | null =>
  item.reason ? (t.sendReason[item.reason as SendReason] ?? item.reasonText) : item.controlReclaimed ? t.reclaimedNote : null

function CustomerBlock({ item }: { item: SendHistoryItem }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <AvatarWithPlatform imageUrl={item.contactAvatarUrl} name={item.contactName} provider={item.channel} className="size-10" />
      <span className="min-w-0 flex-1">
        <span className="text-default-900 block truncate text-sm font-medium">{item.contactName}</span>
        <span className="text-default-600 block truncate text-xs">{[item.channelName, getChannelDisplay(item.channel).label].filter(Boolean).join(' · ')}</span>
      </span>
    </span>
  )
}

function BotRound({ item, t }: { item: SendHistoryItem; t: Dict }) {
  return (
    <>
      {item.botDeleted ? <span className="text-default-600 italic">{t.botDeleted}</span> : item.botName} · {fmt(t.roundOf, { n: item.step, total: item.stepCount })}
    </>
  )
}

export default function SendHistoryClient({ initial, initialCursor }: { initial: SendHistoryItem[]; initialCursor: string | null }) {
  const t = useT().salesFollowBot
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)

  // router.refresh() ส่ง props ชุดใหม่มา — รับเข้า state (ท่า prevInitial ของ TagsClient/AutoNotifyClient)
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setItems(initial)
    setCursor(initialCursor)
  }

  const loadMore = async () => {
    if (!cursor || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/shops/current/sales-follow-bot/sends?cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { items: SendHistoryItem[]; nextCursor: string | null }
      setItems((cur) => [...cur, ...data.items])
      setCursor(data.nextCursor)
    } catch {
      pacesToast.error(t.loadMoreFailed)
    } finally {
      setLoading(false)
    }
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'customer',
        header: t.logColCustomer,
        meta: { cellClassName: 'w-1/3 max-w-0' },
        cell: ({ row }) => (
          <Link href={`/inbox/${row.original.conversationId}`} aria-label={fmt(t.openChatAria, { name: row.original.contactName })} className="block">
            <CustomerBlock item={row.original} />
          </Link>
        ),
      }),
      columnHelper.display({ id: 'bot', header: t.logColBot, cell: ({ row }) => <BotRound item={row.original} t={t} /> }),
      columnHelper.display({
        id: 'result',
        header: t.logColResult,
        cell: ({ row }) => (
          <div>
            <ResultBadge item={row.original} t={t} />
            {reasonOf(row.original, t) && <p className="text-default-700 mt-1 text-xs">{reasonOf(row.original, t)}</p>}
          </div>
        ),
      }),
      columnHelper.display({ id: 'time', header: t.logColTime, cell: ({ row }) => <span className="text-default-800 tabular-nums">{formatDateTime(row.original.at)}</span> }),
    ],
    [t],
  )
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Icon icon="target-arrow" className="text-default-500 size-8" aria-hidden="true" />
            <h4 className="text-default-900 text-sm font-medium">{t.logEmptyTitle}</h4>
            <p className="text-default-700 max-w-md text-sm">{t.logEmptyBody}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card hidden lg:block">
        <DataTable<SendHistoryItem> table={table} onRowClick={(row) => router.push(`/inbox/${row.original.conversationId}`)} />
      </div>

      {/* <lg: การ์ดทั้งใบกดได้ (เป้าแตะ ≥44px — ไม่ใช่แค่ลิงก์ชื่อ · audit §17) */}
      <ul className="space-y-2 lg:hidden">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/inbox/${it.conversationId}`} aria-label={fmt(t.openChatAria, { name: it.contactName })} className="card block min-h-11 px-4 py-3">
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <CustomerBlock item={it} />
                </span>
                <span className="text-default-600 shrink-0 text-xs tabular-nums">{formatDateTime(it.at)}</span>
              </span>
              <span className="text-default-700 mt-2 block ps-13 text-xs">
                <BotRound item={it} t={t} />
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 ps-13">
                <ResultBadge item={it} t={t} />
                {reasonOf(it, t) && <span className="text-default-700 text-xs">{reasonOf(it, t)}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {cursor && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loading} className="btn border-default-300 text-default-800 min-h-11 border disabled:opacity-50 lg:min-h-0">
            {loading && <Icon icon="loader-2" className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {loading ? t.loadingMore : t.loadMore}
          </button>
        </div>
      )}
    </>
  )
}
