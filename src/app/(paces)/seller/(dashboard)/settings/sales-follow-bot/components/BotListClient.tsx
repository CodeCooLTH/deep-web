'use client'

/**
 * BotListClient — แท็บ "บอท": ตาราง (≥lg) / การ์ดทั้งใบกดได้ (<lg) / สถานะว่าง / ไม่มีช่องทาง (00095 S-7 · mockup ส่วน 1, 1b)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (DataTable + useReactTable — ตัดค้นหา/แบ่งหน้า/เรียงลำดับ ไม่มีใน P1)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/components/TagsClient.tsx (DataTable · TagBadge · empty state · ท่า mobileCard — ที่นี่การ์ดแยกนอก .card ตาม mockup)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (banner noChannel · empty state flex-col py-6)
 *   theme: .../ui/badges/page.tsx (badge)
 */
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

import DataTable from '@/components/table/DataTable'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import type { SalesStageKey } from '@/lib/sales-follow-bot/constants'
import { firstTextPreview, formatDuration, limitList, type DurationWords } from '@/lib/sales-follow-bot/ui'
import type { BotDto } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform, StatusBadge, useDurationWords } from './sfb-ui'

const BASE = '/settings/sales-follow-bot'
const columnHelper = createColumnHelper<BotDto>()

type Dict = ReturnType<typeof useT>['salesFollowBot']

function useBotText() {
  const t = useT().salesFollowBot
  const words = useDurationWords()
  return { t, words }
}

/** บรรทัดเงื่อนไข: **สถานะ** · แท็ก — สถานะ ≤2 ตัว + N · แท็ก ≤3 ตัว + N (แท็กที่ถูกลบไม่นับ ตามที่บอทใช้จริง) */
function ConditionLine({ bot }: { bot: BotDto }) {
  const t = useT().salesFollowBot
  const stages = limitList(bot.salesStatuses, 2)
  const tags = limitList(
    bot.tags.filter((x) => !x.missing).map((x) => x.name),
    3,
  )
  const stageText = bot.salesStatuses.length === 0 ? t.allStatuses : stages.shown.map((k) => t.stageLabel[k as SalesStageKey]).join(` ${t.orWord} `) + (stages.rest ? ` +${stages.rest}` : '')
  const tagText = tags.shown.join(` ${bot.tagMatch === 'ALL' ? t.andWord : t.orWord} `) + (tags.rest ? ` +${tags.rest}` : '')
  return (
    <p className="text-default-700 mt-1 truncate text-xs">
      <b className="text-default-900 font-semibold">{stageText}</b>
      {tagText && <> · {tagText}</>}
    </p>
  )
}

/** เพจ/OA ที่บอทใช้: รูปโปรไฟล์ซ้อน ≤2 + "+N" และรายชื่อต่อกัน (truncate) */
function ChannelsCell({ bot }: { bot: BotDto }) {
  const t = useT().salesFollowBot
  const names = bot.channels.map((c) => c.name).join(', ')
  const stack = bot.channels.slice(0, 2)
  const more = bot.channels.length - stack.length
  return (
    <div className="flex min-w-0 items-center gap-2" title={names}>
      <span className="flex shrink-0 items-center" aria-hidden="true">
        {stack.map((c, i) => (
          <span key={c.id} className={i > 0 ? '-ms-2' : ''}>
            <AvatarWithPlatform imageUrl={c.avatarUrl} name={c.name} provider={c.provider} className="ring-card size-7 ring-2" badge="sm" />
          </span>
        ))}
        {more > 0 && <span className="bg-default-300 text-default-800 text-2xs ring-card -ms-2 flex size-7 items-center justify-center rounded-full font-semibold ring-2">+{more}</span>}
      </span>
      <span className="text-default-800 min-w-0 truncate text-sm" aria-hidden="true">{names}</span>
      <span className="sr-only">{fmt(t.channelsSr, { names })}</span>
    </div>
  )
}

/** จังหวะ: ชิปเวลารอของแต่ละรอบคั่นด้วยลูกศร · รอบที่ส่งได้เฉพาะลูกค้าโฆษณาใช้ tone warning (+ข้อความใน aria ไม่พึ่งสีอย่างเดียว) */
function RhythmCell({ bot, words, t }: { bot: BotDto; words: DurationWords; t: Dict }) {
  const list = bot.steps.map((s) => formatDuration(s.delayMin, words))
  const adRounds = bot.steps.flatMap((s, i) => (s.adOnly ? [i + 1] : []))
  const aria = fmt(t.rhythmAria, { n: bot.steps.length, list: list.join(', ') }) + (adRounds.length ? ' ' + adRounds.map((n) => fmt(t.rhythmAdNote, { n })).join(' ') : '')
  return (
    <div>
      <p className="text-sm">
        <span className="text-default-900 font-medium tabular-nums">{fmt(t.roundsCount, { n: bot.steps.length })}</span>
        <span className="text-default-600"> · {fmt(t.within, { d: formatDuration(bot.totalDelayMin, words) })}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1" role="img" aria-label={aria}>
        {bot.steps.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1" aria-hidden="true">
            {i > 0 && <Icon icon="chevron-right" className="text-default-400 text-xs" />}
            <span className={`text-2xs rounded px-1.5 py-0.5 whitespace-nowrap tabular-nums ${s.adOnly ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800'}`}>{list[i]}</span>
          </span>
        ))}
      </div>
      {/* ไม่พึ่งสีอย่างเดียว: รอบแรกเป็นรอบโฆษณา = ทั้งบอทไม่ถึงลูกค้าทั่วไปเลย (เข้าใจผิดแพงที่สุด) */}
      {adRounds.length > 0 && (
        <p className="text-warning-ink mt-1 flex items-start gap-1 text-xs" aria-hidden="true">
          <Icon icon="speakerphone" className="mt-0.5 shrink-0" />
          {adRounds[0] === 1 ? t.rhythmAdAll : fmt(t.rhythmAdSome, { list: adRounds.join(', ') })}
        </p>
      )}
    </div>
  )
}

/** จำนวนแชทที่บอทเกี่ยวข้อง: ทดสอบ = แชททดสอบที่เลือก · อย่างอื่น = แชทที่กำลังตาม (0 = ไม่แสดง) */
function FollowCount({ bot, t }: { bot: BotDto; t: Dict }) {
  const n = bot.status === 'TESTING' ? bot.testRoomIds.length : bot.activeRunCount
  // ไม่แสดง "ตามอยู่ 0 แชท" — ค่าคงที่ที่ไม่ให้ข้อมูล
  if (n <= 0) return null
  return (
    <p className="mt-1 text-xs">
      <span className="text-default-900 text-base font-semibold tabular-nums">{n.toLocaleString()}</span>{' '}
      <span className="text-default-700">{bot.status === 'TESTING' ? t.testChats : t.followingChats}</span>
    </p>
  )
}

function StatusCell({ bot, t }: { bot: BotDto; t: Dict }) {
  return (
    <div>
      <StatusBadge status={bot.status} />
      <FollowCount bot={bot} t={t} />
    </div>
  )
}

function BotNameBlock({ bot, link }: { bot: BotDto; link: boolean }) {
  const t = useT().salesFollowBot
  const preview = firstTextPreview(bot.steps, t.previewSampleName)
  const missing = bot.tags.filter((x) => x.missing).map((x) => x.name)
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        {link ? (
          <Link href={`${BASE}/${bot.id}`} className="text-default-900 min-w-0 truncate font-medium">
            {bot.name}
          </Link>
        ) : (
          <span className="text-default-900 min-w-0 truncate font-medium">{bot.name}</span>
        )}
        {missing.length > 0 && <Icon icon="alert-triangle" className="text-warning-ink shrink-0 text-sm" role="img" aria-label={t.tagGoneAria} />}
      </div>
      {preview && <p className="text-default-700 truncate text-xs">{preview}</p>}
      {missing.length > 0 && (
        <p className="text-warning-ink truncate text-xs">{fmt(bot.tagMatch === 'ALL' ? t.tagGoneAll : t.tagGoneAny, { names: missing.join(', ') })}</p>
      )}
    </div>
  )
}

export default function BotListClient({ bots, hasChannel }: { bots: BotDto[]; hasChannel: boolean }) {
  const { t, words } = useBotText()
  const router = useRouter()

  const columns = useMemo(
    () => [
      columnHelper.display({ id: 'bot', header: t.colBot, meta: { cellClassName: 'w-1/3 max-w-0 align-top' }, cell: ({ row }) => <BotNameBlock bot={row.original} link /> }),
      columnHelper.display({
        id: 'condition',
        header: t.colCondition,
        meta: { cellClassName: 'w-1/3 max-w-0 align-top' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <ChannelsCell bot={row.original} />
            <ConditionLine bot={row.original} />
          </div>
        ),
      }),
      columnHelper.display({ id: 'rounds', header: t.colRounds, meta: { cellClassName: 'align-top' }, cell: ({ row }) => <RhythmCell bot={row.original} words={words} t={t} /> }),
      columnHelper.display({ id: 'status', header: t.colStatus, meta: { cellClassName: 'align-top' }, cell: ({ row }) => <StatusCell bot={row.original} t={t} /> }),
      columnHelper.display({
        id: 'go',
        header: () => <span className="sr-only">{t.colOpen}</span>,
        meta: { cellClassName: 'w-px align-middle' },
        cell: () => <Icon icon="chevron-right" className="text-default-500 text-lg" aria-hidden="true" />,
      }),
    ],
    [t, words],
  )
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable ตามท่าเดียวกับ TagsClient
  const table = useReactTable({ data: bots, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <>
      {!hasChannel && (
        <div id="sfb-no-channel" className="bg-warning/15 text-warning-ink mb-base flex items-start gap-3 rounded-lg p-3 text-xs">
          <Icon icon="alert-triangle" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p>{t.noChannelBanner}</p>
            <Link href="/settings/channels" className="text-warning-ink inline-flex min-h-11 items-center font-medium underline lg:min-h-0">
              {t.noChannelCta}
            </Link>
          </div>
        </div>
      )}

      {bots.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Icon icon="target-arrow" className="text-default-500 size-8" aria-hidden="true" />
              <h4 className="text-default-900 text-sm font-medium">{t.emptyTitle}</h4>
              <p className="text-default-700 max-w-md text-sm">{t.emptyBody}</p>
              {hasChannel ? (
                <Link href={`${BASE}/new`} className="btn bg-primary hover:bg-primary-hover mt-2 min-h-11 text-white lg:min-h-0">
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                  {t.createBot}
                </Link>
              ) : (
                <button type="button" disabled aria-describedby="sfb-no-channel" className="btn bg-primary mt-2 min-h-11 text-white disabled:opacity-50 lg:min-h-0">
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                  {t.createBot}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* เดสก์ท็อป ≥lg: ตาราง · แถวกดได้ทั้งแถว (ชื่อบอทเป็นลิงก์ให้คีย์บอร์ด) */}
          <div className="card hidden lg:block">
            <DataTable<BotDto> table={table} onRowClick={(row) => router.push(`${BASE}/${row.original.id}`)} />
          </div>

          {/* แท็บเล็ต/มือถือ <lg: การ์ดทั้งใบกดได้ · ≥md แบ่ง 2 ซีก */}
          <ul className="space-y-3 lg:hidden">
            {bots.map((bot) => (
              <li key={bot.id}>
                <Link href={`${BASE}/${bot.id}`} aria-label={fmt(t.openBotAria, { name: bot.name })} className="card block p-4">
                  <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <BotNameBlock bot={bot} link={false} />
                      </div>
                      <span className="shrink-0">
                        <StatusBadge status={bot.status} />
                      </span>
                    </div>
                    <div className="border-default-300 min-w-0 space-y-2 md:border-s md:border-dashed md:ps-4">
                      <div>
                        <ChannelsCell bot={bot} />
                        <ConditionLine bot={bot} />
                      </div>
                      <RhythmCell bot={bot} words={words} t={t} />
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <FollowCount bot={bot} t={t} />
                        </div>
                        <Icon icon="chevron-right" className="text-default-500 text-lg" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
