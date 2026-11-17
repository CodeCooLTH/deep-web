'use client'

/**
 * BotListClient — แท็บ "บอท": ตาราง 5 คอลัมน์ (≥lg) / การ์ด (<lg) / สถานะว่าง / ไม่มีช่องทาง (00095 redesign แนวทาง A)
 * คอลัมน์: บอท (ชื่อ + เงื่อนไข) · ช่องทาง (รวมตามเพจ) · รอบ (รางเวลา) · ผล 7 วัน · สถานะ (สวิตช์เปิด/ปิดในแถว)
 * การ์ด <lg ไม่เป็นลิงก์ทั้งใบ — มีสวิตช์อยู่ข้างใน (ห้ามซ้อน interactive) ชื่อบอทกับปุ่ม > เป็นลิงก์
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (DataTable + useReactTable — ตัดค้นหา/แบ่งหน้า/เรียงลำดับ ไม่มีใน P1)
 *   + theme: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (form-switch)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/components/TagsClient.tsx (DataTable · TagBadge · empty state)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (banner noChannel · empty state flex-col py-6)
 *   theme: .../ui/badges/page.tsx (badge)
 */
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import DataTable from '@/components/table/DataTable'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { repliedPct, type BotStats } from '@/lib/sales-follow-bot/stats'
import { FINAL_KEY, REPLY_HANDOFF_KEY, formatDuration, groupChannelsByPage, neverMatches, ruleSentence, type DurationWords } from '@/lib/sales-follow-bot/ui'
import type { BotDto } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform, useDurationWords } from './sfb-ui'

const BASE = '/settings/sales-follow-bot'
const API = '/api/shops/current/sales-follow-bot'
const columnHelper = createColumnHelper<BotDto>()

type Dict = ReturnType<typeof useT>['salesFollowBot']
type StatsMap = Record<string, BotStats> | null

const PLATFORM_KEY = { MESSENGER: 'platMessenger', INSTAGRAM: 'platInstagram', LINE: 'platLine' } as const
const platformText = (providers: readonly string[], t: Dict): string =>
  [...new Set(providers)].map((p) => t[PLATFORM_KEY[p as keyof typeof PLATFORM_KEY]] ?? p).join(' · ')

/**
 * สถานะที่แถวแก้ได้เอง (สวิตช์) — เก็บทับ props จนกว่า router.refresh() ส่ง props ชุดใหม่มา
 * updatedAt ต้องตามผลล่าสุดจาก server ไม่งั้นสลับสองครั้งติดจะชน BOT_STALE ของตัวเอง
 */
function useRowStatus(bots: BotDto[]) {
  const t = useT().salesFollowBot
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, { status: BotDto['status']; updatedAt: string }>>({})
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [prevBots, setPrevBots] = useState(bots)
  if (bots !== prevBots) {
    setPrevBots(bots)
    setLocal({})
  }
  const view = (b: BotDto): BotDto => (local[b.id] ? { ...b, ...local[b.id] } : b)

  const change = async (bot: BotDto, next: 'ACTIVE' | 'CLOSED') => {
    if (pending.has(bot.id)) return
    // เปิดใช้จริง = ทักลูกค้าจริง — ถามยืนยันด้วยกล่องเดิมของฟอร์ม
    if (next === 'ACTIVE') {
      const ok = await pacesConfirm({ icon: 'warning', confirmSemantic: 'primary', focusCancel: true, title: t.activateTitle, text: t.activateBody, confirmButtonText: t.activateOk, cancelButtonText: t.activateCancel })
      if (!ok) return
    }
    const prev = { status: bot.status, updatedAt: bot.updatedAt }
    setPending((s) => new Set(s).add(bot.id))
    setLocal((m) => ({ ...m, [bot.id]: { status: next, updatedAt: bot.updatedAt } })) // optimistic
    try {
      const r = await fetch(`${API}/bots/${bot.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next, expectedUpdatedAt: bot.updatedAt }), cache: 'no-store' })
      const body = (await r.json().catch(() => null)) as (Partial<BotDto> & { error?: string }) | null
      if (r.status === 200 && body?.updatedAt && body.status) {
        setLocal((m) => ({ ...m, [bot.id]: { status: body.status as BotDto['status'], updatedAt: body.updatedAt as string } }))
        pacesToast.success(fmt(t.toastStatus, { status: next === 'ACTIVE' ? t.statusActive : t.statusClosed }))
        return
      }
      setLocal((m) => ({ ...m, [bot.id]: prev }))
      if (r.status === 409 && body?.error === 'BOT_STALE') {
        pacesToast.error(t.staleTitle)
        router.refresh()
      } else if (r.status === 403) {
        pacesToast.error(t.toastNoPermission)
        router.refresh()
      } else pacesToast.error(t.toggleFailed)
    } catch {
      setLocal((m) => ({ ...m, [bot.id]: prev }))
      pacesToast.error(t.toggleFailed)
    } finally {
      setPending((s) => {
        const n = new Set(s)
        n.delete(bot.id)
        return n
      })
    }
  }
  return { view, change, pending }
}

/** เงื่อนไขการเริ่มติดตามเป็นประโยคบรรทัดเดียว + ชิป warning แท็กที่ถูกลบ (ลิงก์ไปการ์ดเงื่อนไขของฟอร์ม) */
function ConditionChips({ bot }: { bot: BotDto }) {
  const t = useT().salesFollowBot
  const sentence = ruleSentence(bot.rules, bot.conditionMatch, { and: t.andWord, or: t.orWord, not: t.sentNot, hasTag: t.sentHasTag, noTag: t.sentNoTag }, (k) => t.stageLabel[k])
  const gone = bot.rules.flatMap((r) => (r.field === 'tag' ? r.values.filter((x) => x.missing) : []))
  const dead = neverMatches(bot.rules, bot.conditionMatch)
  return (
    <div className="mt-1.5 min-w-0">
      <p className="text-default-800 min-w-0 truncate text-xs" title={sentence}>
        {sentence || t.allStatuses}
      </p>
      {gone.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {gone.map((g) => {
            const sentenceGone = fmt(dead ? t.tagGoneAll : t.tagGoneAny, { names: g.name })
            return (
              <Link key={g.key} href={`${BASE}/${bot.id}#sfb-who`} aria-label={sentenceGone} title={sentenceGone} className="badge bg-warning/15 text-warning-ink inline-flex min-h-11 items-center gap-1 text-xs lg:min-h-0">
                <Icon icon="alert-triangle" aria-hidden="true" />
                {fmt(t.tagGoneChip, { name: g.name })}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** เพจ/OA ที่บอทใช้: รวมตามเพจ (Messenger + IG ชื่อเดียวกัน = 1 รูป) · รูปซ้อน ≤2 + "+N" · ชื่อเพจแรก + ชื่อแพลตฟอร์ม */
function ChannelsCell({ bot }: { bot: BotDto }) {
  const t = useT().salesFollowBot
  const groups = useMemo(() => groupChannelsByPage(bot.channels), [bot.channels])
  if (groups.length === 0) return null
  const stack = groups.slice(0, 2)
  // ชื่อโชว์เพจแรกเพจเดียว — เพจที่เหลือบอกเป็นจำนวน (รูปซ้อนได้ไม่เกิน 2)
  const more = groups.length - 1
  const first = groups[0]
  const platforms = platformText(first.channels.map((c) => c.provider), t)
  const names = groups.map((g) => g.name).join(', ')
  return (
    <div className="flex min-w-0 items-center gap-2" title={names}>
      <span className="flex shrink-0 items-center" aria-hidden="true">
        {stack.map((g, i) => (
          <span key={g.key} className={i > 0 ? '-ms-2' : ''}>
            <AvatarWithPlatform imageUrl={g.avatarUrl} name={g.name} provider={g.channels[0].provider} className="ring-card size-8 ring-2" badge="sm" />
          </span>
        ))}
      </span>
      <span className="min-w-0" aria-hidden="true">
        <span className="text-default-900 block truncate text-sm">{first.name}</span>
        <span className="text-default-700 block truncate text-xs">
          {platforms}
          {more > 0 && <> · {fmt(t.channelsMore, { n: more })}</>}
        </span>
      </span>
      <span className="sr-only">{fmt(t.channelsSr, { names })}</span>
    </div>
  )
}

/** รางเวลา: ชิปเวลารอของแต่ละรอบคั่นด้วยเส้น · รอบเฉพาะลูกค้าโฆษณา = ชิป warning + ไอคอน (ไม่พึ่งสีอย่างเดียว) · ปลายราง = จบแล้วทำอะไร */
function RhythmCell({ bot, words, t }: { bot: BotDto; words: DurationWords; t: Dict }) {
  const list = bot.steps.map((s) => formatDuration(s.delayMin, words))
  const adRounds = bot.steps.flatMap((s, i) => (s.adOnly ? [i + 1] : []))
  const adNote = adRounds[0] === 1 ? t.rhythmAdAll : adRounds.length ? fmt(t.rhythmAdSome, { list: adRounds.join(', ') }) : ''
  const aria = fmt(t.rhythmAria, { n: bot.steps.length, list: list.join(', ') }) + (adRounds.length ? ' ' + adRounds.map((n) => fmt(t.rhythmAdNote, { n })).join(' ') + ' ' + adNote : '')
  return (
    <div>
      <p className="text-sm">
        <span className="text-default-900 font-medium tabular-nums">{fmt(t.roundsCount, { n: bot.steps.length })}</span>
        <span className="text-default-700"> · {formatDuration(bot.totalDelayMin, words)}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1" role="img" aria-label={aria}>
        {bot.steps.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1" aria-hidden="true">
            {i > 0 && <Icon icon="chevron-right" className="text-default-700 text-xs" />}
            <span title={s.adOnly ? t.rhythmAdChipTitle : undefined} className={`text-2xs inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 whitespace-nowrap tabular-nums ${s.adOnly ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800'}`}>
              {s.adOnly && <Icon icon="speakerphone" />}
              {list[i]}
            </span>
          </span>
        ))}
        {bot.finalAction !== 'NONE' && (
          <span className="text-default-800 text-2xs inline-flex items-center gap-1 whitespace-nowrap" aria-hidden="true">
            <Icon icon="flag" />
            {fmt(t.condEndShort, { d: formatDuration(bot.finalDelayMin, words), a: t[FINAL_KEY[bot.finalAction]] })}
          </span>
        )}
      </div>
      {bot.finalAction !== 'NONE' && <span className="sr-only">{fmt(t.finalSummary, { d: formatDuration(bot.finalDelayMin, words), a: t[FINAL_KEY[bot.finalAction]] })}</span>}
    </div>
  )
}

/** ผล 7 วัน: กำลังตาม · ส่งแล้ว · ตอบกลับ% (+แถบ) — ไม่มีสถิติ (เช่นโหลดไม่ได้) = "–" ไม่ใช่ 0 */
function ResultCell({ bot, stats, t, compact }: { bot: BotDto; stats: StatsMap; t: Dict; compact?: boolean }) {
  const s = stats ? (stats[bot.id] ?? { sent: 0, failed: 0, reached: 0, replied: 0 }) : null
  if (bot.status === 'TESTING')
    return (
      <div>
        <p className="text-default-700 text-xs">{t.testMode}</p>
        <p className="text-default-900 text-sm tabular-nums">{fmt(t.testingSummary, { n: bot.testRoomIds.length, s: s ? s.sent : '–' })}</p>
      </div>
    )
  if (bot.status === 'CLOSED' && s && s.sent === 0 && s.failed === 0 && bot.activeRunCount === 0) return compact ? null : <p className="text-default-700 text-xs">{t.closedOff}</p>
  const pct = s ? repliedPct(s) : null
  const cell = (v: string, l: string, bar?: boolean) => (
    <div className="min-w-0">
      <div className="text-default-900 text-base font-semibold tabular-nums">{v}</div>
      <div className="text-default-700 text-xs">{l}</div>
      {bar && pct !== null && (
        <div className="bg-default-200 mt-1 h-1 w-full max-w-16 rounded-full" aria-hidden="true">
          <div className="bg-success h-1 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-3' : 'grid-cols-3 gap-4'}`}>
      {cell(String(bot.activeRunCount), t.statFollowing)}
      {cell(s ? s.sent.toLocaleString() : '–', t.statSent)}
      {cell(pct === null ? '–' : `${pct}%`, t.statReplied, true)}
    </div>
  )
}

/** สวิตช์เปิด/ปิดในแถว · บอททดสอบไม่มีสวิตช์ (ต้องเลือกแชททดสอบในฟอร์ม) = ป้ายทดสอบ + ลิงก์ "เปิดใช้จริง…" */
function StatusControl({ bot, t, busy, onChange }: { bot: BotDto; t: Dict; busy: boolean; onChange: (next: 'ACTIVE' | 'CLOSED') => void }) {
  if (bot.status === 'TESTING')
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="badge bg-info/15 text-info-ink text-xs">
          <Icon icon="flask" aria-hidden="true" />
          {t.statusTesting}
        </span>
        <button type="button" onClick={() => onChange('ACTIVE')} disabled={busy} className="text-primary-ink inline-flex min-h-11 items-center text-xs font-medium underline disabled:opacity-50 lg:min-h-0">
          {t.goLive}
        </button>
      </div>
    )
  const on = bot.status === 'ACTIVE'
  const allGone = neverMatches(bot.rules, bot.conditionMatch)
  return (
    <div className="flex flex-col items-start gap-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 lg:min-h-0">
        <input type="checkbox" role="switch" className="form-switch checked:bg-success!" checked={on} disabled={busy} aria-label={fmt(t.toggleAria, { name: bot.name })} onChange={(e) => onChange(e.target.checked ? 'ACTIVE' : 'CLOSED')} />
        <span className="text-default-800 text-sm">{on ? t.statusActive : t.statusClosed}</span>
      </label>
      {allGone && <span className="badge bg-warning/15 text-warning-ink text-xs">{t.tagGoneNoNew}</span>}
    </div>
  )
}

function ReplyLine({ bot, t }: { bot: BotDto; t: Dict }) {
  return <p className="text-default-700 mt-1 text-xs">{fmt(t.condEndReply, { a: t[REPLY_HANDOFF_KEY[bot.replyHandoff]] })}</p>
}

export default function BotListClient({ bots, hasChannel, stats = null }: { bots: BotDto[]; hasChannel: boolean; stats?: StatsMap }) {
  const t = useT().salesFollowBot
  const words = useDurationWords()
  const router = useRouter()
  const { view, change, pending } = useRowStatus(bots)
  const rows = bots.map(view)

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'bot',
        header: t.colBot,
        meta: { cellClassName: 'w-1/3 max-w-0 align-top' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`${BASE}/${row.original.id}`} className="text-default-900 block min-w-0 truncate font-medium">
              {row.original.name}
            </Link>
            <ConditionChips bot={row.original} />
            <ReplyLine bot={row.original} t={t} />
          </div>
        ),
      }),
      columnHelper.display({ id: 'channels', header: t.colChannels, meta: { cellClassName: 'align-top max-w-0 w-1/5' }, cell: ({ row }) => <ChannelsCell bot={row.original} /> }),
      columnHelper.display({ id: 'rounds', header: t.colRounds, meta: { cellClassName: 'align-top' }, cell: ({ row }) => <RhythmCell bot={row.original} words={words} t={t} /> }),
      columnHelper.display({ id: 'result', header: t.colResult, meta: { cellClassName: 'align-top' }, cell: ({ row }) => <ResultCell bot={row.original} stats={stats} t={t} /> }),
      columnHelper.display({
        id: 'status',
        header: t.colStatus,
        meta: { cellClassName: 'align-top' },
        cell: ({ row }) => <StatusControl bot={row.original} t={t} busy={pending.has(row.original.id)} onChange={(n) => void change(row.original, n)} />,
      }),
      columnHelper.display({
        id: 'go',
        header: () => <span className="sr-only">{t.colOpen}</span>,
        meta: { cellClassName: 'w-px align-middle' },
        cell: () => <Icon icon="chevron-right" className="text-default-700 text-lg" aria-hidden="true" />,
      }),
    ],
    [t, words, stats, pending, change],
  )
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable ตามท่าเดียวกับ TagsClient
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

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
              <Icon icon="target-arrow" className="text-default-700 size-8" aria-hidden="true" />
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

          {/* แท็บเล็ต/มือถือ <lg: การ์ด (ไม่ใช่ลิงก์ทั้งใบ — มีสวิตช์ข้างใน) · ≥md 2 คอลัมน์ */}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
            {rows.map((bot) => (
              <li key={bot.id} className="card min-w-0 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`${BASE}/${bot.id}`} className="text-default-900 inline-flex min-h-11 max-w-full items-center font-medium lg:min-h-0">
                      <span className="truncate">{bot.name}</span>
                    </Link>
                    <ConditionChips bot={bot} />
                    <ReplyLine bot={bot} t={t} />
                  </div>
                  <div className="shrink-0">
                    <StatusControl bot={bot} t={t} busy={pending.has(bot.id)} onChange={(n) => void change(bot, n)} />
                  </div>
                </div>
                <div className="mt-3">
                  <ChannelsCell bot={bot} />
                </div>
                <div className="border-default-300 mt-3 border-t border-dashed pt-3">
                  <ResultCell bot={bot} stats={stats} t={t} compact />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <RhythmCell bot={bot} words={words} t={t} />
                  </div>
                  <Link href={`${BASE}/${bot.id}`} aria-label={fmt(t.openBotAria, { name: bot.name })} className="btn text-default-700 size-11 shrink-0 p-0">
                    <Icon icon="chevron-right" className="text-lg" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
