'use client'

/**
 * ChannelSection — ② "ส่งทางไหน": รวมตามเพจ/OA 1 แถวต่อเพจ (รูป 1 รูป + ชื่อครั้งเดียว) พร้อมปุ่มเลือกแพลตฟอร์ม (Messenger / Instagram / LINE OA) — redesign A
 * ช่องที่ชน (findChannelConflicts ตัวเดียวกับ server · คำนวณสดตามสถานะการขายที่เลือก): ล็อก + lock + "บอท “…” ใช้ช่องทางนี้อยู่" (AC-FB-20)
 * ช่องที่ติ๊กไว้แล้วกลับกลายเป็นชน = ข้อความแดง (ผู้ใช้เปลี่ยนสถานะภายหลัง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (form-checkbox + label)
 *   + src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx (รูปเพจ + ชื่อ + ชนิดช่องทาง)
 */
import Link from 'next/link'
import { useMemo } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { groupChannelsByPage } from '@/lib/sales-follow-bot/ui'
import type { BotOptions } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform } from './sfb-ui'

type ChannelOpt = BotOptions['channels'][number]

const PLATFORM = {
  MESSENGER: { icon: 'brand-messenger', key: 'platMessenger' },
  INSTAGRAM: { icon: 'brand-instagram', key: 'platInstagram' },
  LINE: { icon: 'brand-line', key: 'platLine' },
} as const

export default function ChannelSection({
  channels,
  selected,
  conflicts,
  onToggle,
  error,
}: {
  channels: readonly ChannelOpt[]
  selected: readonly string[]
  conflicts: ReadonlyMap<string, { botId: string; botName: string }>
  onToggle: (id: string, on: boolean) => void
  error: string | null
}) {
  const t = useT().salesFollowBot
  const groups = useMemo(() => groupChannelsByPage(channels), [channels])
  const hasLine = channels.some((c) => c.provider === 'LINE' && selected.includes(c.id))

  if (channels.length === 0)
    return (
      <p className="text-default-700 text-sm">
        {t.noChannelsInForm}{' '}
        <Link href="/settings/channels" className="text-primary-ink inline-flex min-h-11 items-center font-medium underline lg:min-h-0">
          {t.goConnect}
        </Link>
      </p>
    )

  return (
    <div id="sfb-ch">
      <ul className="divide-default-200 divide-y" aria-describedby={error ? 'sfb-ch-err' : undefined}>
        {groups.map((g) => (
          <li key={g.key} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
            <AvatarWithPlatform imageUrl={g.avatarUrl} name={g.name} provider={g.channels[0].provider} className="size-10" badge="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-default-900 truncate text-sm font-medium">{g.name}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {g.channels.map((c) => {
                  const checked = selected.includes(c.id)
                  const locked = conflicts.has(c.id) && !checked
                  const pf = PLATFORM[c.provider as keyof typeof PLATFORM]
                  return (
                    <li key={c.id} className="min-w-0">
                      <label
                        className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 text-sm lg:min-h-0 lg:py-1.5 ${checked ? 'border-primary bg-primary/10 text-primary-ink' : 'border-default-300 text-default-800'} ${locked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
                      >
                        <input type="checkbox" className="form-checkbox shrink-0" checked={checked} disabled={locked} onChange={(e) => onToggle(c.id, e.target.checked)} />
                        <Icon icon={locked ? 'lock' : (pf?.icon ?? 'message')} aria-hidden="true" />
                        <span className="truncate">{pf ? t[pf.key] : c.provider}</span>
                        {c.handle && <span className="text-default-700 truncate text-xs">{c.handle}</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
              {g.channels.map((c) => {
                const clash = conflicts.get(c.id)
                if (!clash) return null
                const checked = selected.includes(c.id)
                return (
                  <p key={c.id} className={`mt-1.5 text-xs ${checked ? 'text-danger-ink' : 'text-default-700'}`} role={checked ? 'alert' : undefined}>
                    {checked ? (
                      <>
                        {t.channelConflictErr.split('{bot}')[0]}
                        <BotLink id={clash.botId} name={clash.botName} />
                        {t.channelConflictErr.split('{bot}')[1]}
                      </>
                    ) : (
                      <>
                        {t.channelTakenBy} <BotLink id={clash.botId} name={clash.botName} /> {t.channelTakenBySuffix}
                      </>
                    )}
                  </p>
                )
              })}
              {g.channels.some((c) => c.status !== 'ACTIVE') && <span className="badge bg-warning/15 text-warning-ink mt-1.5 text-xs">{t.channelDisconnected}</span>}
            </div>
          </li>
        ))}
      </ul>
      {hasLine && (
        <p className="bg-info/15 text-info-ink mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
          <Icon icon="info-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
          {t.lineQuotaNote}
        </p>
      )}
      {error && (
        <p id="sfb-ch-err" role="alert" className="text-danger-ink mt-2 flex items-start gap-1 text-xs">
          <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

/** ลิงก์ไปบอทที่ครองช่อง — พื้นที่กด ≥44px บนมือถือด้วย min-h-11 + padding (แยกพื้นที่นิ้วกับก้อนสี · audit §17) */
function BotLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/settings/sales-follow-bot/${id}`} className="text-primary-ink -my-2 inline-flex min-h-11 items-center px-1 font-medium underline lg:my-0 lg:min-h-0">
      “{name}”
    </Link>
  )
}
