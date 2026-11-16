'use client'

/**
 * การ์ด "Event ที่ส่งให้ Meta" ใต้ "ประวัติออเดอร์" (feature 00097 · UX-Design-Spec §2) — อ่านอย่างเดียว ไม่มีปุ่มส่งซ้ำ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx ผ่านพี่น้อง ShippingActivity.tsx
 *   (โครง .card > .card-header > .card-body · คอลัมน์เวลา · วงกลม+เส้นประ element จริง) ตัดรูป/ชื่อผู้กระทำ ("โดย ระบบ")
 *   empty = theme .../ui/placeholders/page.tsx ผ่านโครง empty ของ ShippingActivity
 *
 * client เพราะปุ่ม "ลองใหม่" ต้อง router.refresh() (หน้านี้อยู่ (dashboard) — ห้ามเฉพาะ (chat)/**)
 * ข้อมูลคำนวณใน RSC (listOrderCapiEvents) แล้วส่งมาเป็น props ที่ serialize ได้
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { CAPI_STATUS_BADGE, CAPI_STATUS_ICON, CAPI_STATUS_TEXT } from '@/components/safepay/capi-status-view'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatDateTH, formatDayMonthShortYearTH, formatDayMonthTimeTH, formatTimeHM } from '@/lib/format-date'
import { CAPI_EVENTS } from '@/lib/meta-capi/events'
import { capiGroupResult, type CapiDatasetResult, type CapiLineGroup } from '@/lib/meta-capi/chat-lines'
import { cn } from '@/utils/helpers'

import { formatBaht } from '@/lib/format-money'
const META = new Map(CAPI_EVENTS.map((e) => [e.key as string, e.metaName]))
const money = (n: number) => `${formatBaht(n)}`

export type OrderCapiCardData =
  | { kind: 'error' }
  | { kind: 'ok'; groups: CapiLineGroup[]; channelId: string | null; pageState: 'rows' | 'empty' | 'off'; pageName: string | null }

export default function OrderCapiCard({ orderToken, data }: { orderToken: string; data: OrderCapiCardData }) {
  const t = useT().conversionsApi
  const router = useRouter()
  const eventLabel = (k: string) => `${t.events[k as keyof typeof t.events]?.label ?? k} (${META.get(k) ?? k})`
  const dsName = (d: CapiDatasetResult) => d.label?.trim() || `Dataset ${d.datasetId}`
  const reasonOf = (d: CapiDatasetResult) => (d.reasonKey === 'none' ? '' : fmt(t.logReason[d.reasonKey], { n: Math.min(Math.max(d.attempts, 1), 3) }))
  const channelId = data.kind === 'ok' ? data.channelId : null

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{t.orderCardTitle}</h4>
        {channelId && data.kind === 'ok' && data.pageState === 'rows' && (
          <Link
            href={`/settings/capis/${channelId}/log?order=${encodeURIComponent(orderToken)}`}
            className="btn btn-sm border-default-300 text-default-800 min-h-11 border lg:min-h-0"
          >
            {t.openLog}
          </Link>
        )}
      </div>
      <div className="card-body p-5 md:p-7.5">
        {data.kind === 'error' ? (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-danger-ink text-sm font-medium">{t.orderCardError}</p>
            <button type="button" onClick={() => router.refresh()} className="btn btn-sm border-default-300 text-default-800 mt-2 min-h-11 border lg:min-h-0">
              {t.orderCardRetry}
            </button>
          </div>
        ) : data.pageState === 'off' ? (
          <div className="bg-default-100 text-default-800 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">{fmt(t.orderCardPageOff, { name: data.pageName ?? '' })}</span>
            {data.channelId && (
              <Link href={`/settings/capis/${data.channelId}`} className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 lg:min-h-0">
                {t.goSettings}
              </Link>
            )}
          </div>
        ) : data.groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="send" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
            <p className="text-default-800 text-sm font-medium">{t.orderCardEmpty}</p>
          </div>
        ) : (
          <div>
            {data.groups.map((g, idx) => {
              const r = capiGroupResult(g)
              const isLast = idx === data.groups.length - 1
              const first = g.datasets[0]
              return (
                <div className="flex gap-x-3 md:gap-x-base" key={g.id}>
                  <div className="w-18 shrink-0 md:w-25">
                    <span className="flex min-h-9 flex-col items-end justify-center">
                      <span className="text-default-800 text-xs md:hidden">{formatDayMonthShortYearTH(g.at)}</span>
                      <span className="text-default-800 hidden text-xs md:inline">{formatDateTH(g.at)}</span>
                      <span className="text-default-700 text-xs">{formatTimeHM(g.at)}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-center">
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', CAPI_STATUS_BADGE[r.worst])}>
                      <Icon icon={CAPI_STATUS_ICON[r.worst]} className="text-base" aria-hidden="true" />
                    </span>
                    {!isLast && <span className="border-default-300 w-px flex-1 border-e border-dashed" />}
                  </div>
                  <div className={cn('min-w-0 flex-1', isLast ? '' : 'pb-9')}>
                    <h5 className="text-default-800 flex min-h-9 items-center justify-between gap-2 text-sm font-medium">
                      <span className="min-w-0 break-words">{eventLabel(g.eventKey)}</span>
                      {g.value != null && <span className="text-default-900 shrink-0 tabular-nums">{money(g.value)}</span>}
                    </h5>
                    {r.kind === 'mixed' ? (
                      <>
                        <p className="mb-0 flex items-center gap-1 text-xs">
                          <Icon icon={CAPI_STATUS_ICON[r.worst]} className={cn('size-3.5', CAPI_STATUS_TEXT[r.worst])} aria-hidden="true" />
                          <span className={CAPI_STATUS_TEXT[r.worst]}>{fmt(t.orderCardPartial, { ok: r.okCount, n: r.total })}</span>
                        </p>
                        <ul className="text-default-700 mt-1 mb-0 list-none space-y-0.5 p-0 text-xs">
                          {g.datasets.map((d) => (
                            <li key={d.datasetId} className="flex items-start gap-1">
                              <Icon icon={CAPI_STATUS_ICON[d.status]} className={cn('mt-0.5 size-3.5 shrink-0', CAPI_STATUS_TEXT[d.status])} aria-hidden="true" />
                              <span className="min-w-0 break-words">
                                {dsName(d)} · {t.logStatus[d.status]}
                                {d.status === 'SENT' && d.sentAt ? ` · ${fmt(t.logSentAt, { date: formatDayMonthTimeTH(d.sentAt) })}` : reasonOf(d) ? ` · ${reasonOf(d)}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="mb-0 flex flex-wrap items-center gap-x-1 text-xs">
                        <Icon icon={CAPI_STATUS_ICON[r.worst]} className={cn('size-3.5', CAPI_STATUS_TEXT[r.worst])} aria-hidden="true" />
                        <span className={CAPI_STATUS_TEXT[r.worst]}>{t.logStatus[r.worst]}</span>
                        {r.worst === 'SENT' && r.sentAt ? (
                          <span className="text-default-700">· {fmt(t.logSentAt, { date: formatDayMonthTimeTH(r.sentAt) })}</span>
                        ) : (
                          reasonOf(first) && <span className={r.worst === 'FAILED' ? 'text-danger-ink' : 'text-default-700'}>· {reasonOf(first)}</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
