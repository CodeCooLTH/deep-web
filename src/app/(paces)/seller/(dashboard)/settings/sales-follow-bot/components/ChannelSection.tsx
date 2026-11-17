'use client'

/**
 * ChannelSection — ② "ช่องทางที่ติดตาม": จัดกลุ่มตามเพจ/OA — หัวกลุ่ม 1 ครั้ง (รูปเพจจริง + ชื่อ) แล้วแถวละแพลตฟอร์มพร้อมสวิตช์ (redesign C · ผู้ใช้เลือก 2026-11-17)
 * ช่องที่ชน (findChannelConflicts ตัวเดียวกับ server · คำนวณสดตามสถานะการขายที่เลือก): ล็อก + lock + "บอท “…” ใช้ช่องทางนี้อยู่" (AC-FB-20)
 * ช่องที่เปิดไว้แล้วกลับกลายเป็นชน = ข้อความแดง (ผู้ใช้เปลี่ยนสถานะภายหลัง) · ช่องที่หลุดเลือกได้เหมือนเดิม แต่มีป้าย + ลิงก์เชื่อมใหม่
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (form-switch + label)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (กลุ่ม + แถว)
 *   + src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx (รูปเพจ + ชื่อ + ชนิดช่องทาง)
 */
import Link from 'next/link'

import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { channelRowState, groupChannelsByPage } from '@/lib/sales-follow-bot/ui'
import type { BotOptions } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform } from './sfb-ui'

type ChannelOpt = BotOptions['channels'][number]

const PLATFORM = {
  MESSENGER: { key: 'platMessenger' },
  INSTAGRAM: { key: 'platInstagram' },
  LINE: { key: 'platLine' },
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

  const groups = groupChannelsByPage(channels)

  return (
    <div id="sfb-ch">
      <ul className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => {
          const on = g.channels.filter((c) => selected.includes(c.id)).length
          return (
            <li key={g.key} className="border-default-200 min-w-0 overflow-hidden rounded-lg border">
              <div className="border-default-200 flex items-center gap-3 border-b px-3 py-2.5">
                <AvatarWithPlatform imageUrl={g.avatarUrl} name={g.name} provider={g.channels[0].provider} className="size-10" badge="none" />
                <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span>
                {on > 0 && <span className="badge bg-primary/15 text-primary-ink shrink-0 text-xs">{t.channelGroupOn.replace('{n}', String(on))}</span>}
              </div>
              <ul>
                {g.channels.map((c) => {
                  const checked = selected.includes(c.id)
                  const clash = conflicts.get(c.id)
                  const state = channelRowState({ checked, clashed: !!clash })
                  const pf = PLATFORM[c.provider as keyof typeof PLATFORM]
                  const logo = getChannelDisplay(c.provider).logoSrc
                  const dead = c.status !== 'ACTIVE'
                  const inner = (
                    <>
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className={`size-8 shrink-0 rounded-lg ${dead ? 'grayscale' : ''}`} />
                      ) : (
                        <Icon icon="message" className="size-8 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="text-default-900 block truncate text-sm font-medium">
                          {pf ? t[pf.key] : c.provider}
                          {c.handle && <span className="text-default-700 font-normal"> · {c.handle}</span>}
                        </span>
                        {dead && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span className="badge bg-warning/15 text-warning-ink text-xs">{t.channelDisconnected}</span>
                            <Link href="/settings/channels" className="text-primary-ink -my-2 inline-flex min-h-11 items-center text-xs font-medium underline lg:my-0 lg:min-h-0">
                              {t.channelReconnect}
                            </Link>
                          </span>
                        )}
                        {clash && (
                          <span id={`sfb-ch-clash-${c.id}`} className={`mt-0.5 block text-xs ${checked ? 'text-danger-ink' : 'text-default-700'}`} role={checked ? 'alert' : undefined}>
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
                          </span>
                        )}
                      </span>
                    </>
                  )
                  return (
                    <li key={c.id} className="border-default-200 border-b last:border-b-0">
                      {state === 'locked' ? (
                        <div className="flex min-h-11 items-center gap-3 px-3 py-2">
                          {inner}
                          <Icon icon="lock" className="text-default-700 size-5 shrink-0" aria-hidden="true" />
                        </div>
                      ) : (
                        <label className="has-focus-visible:ring-primary hover:bg-default-100 flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 has-focus-visible:ring-2 has-focus-visible:ring-inset">
                          {inner}
                          <input
                            type="checkbox"
                            role="switch"
                            className="form-switch shrink-0"
                            aria-describedby={[error ? 'sfb-ch-err' : '', clash ? `sfb-ch-clash-${c.id}` : ''].filter(Boolean).join(' ') || undefined}
                            checked={checked}
                            onChange={(e) => onToggle(c.id, e.target.checked)}
                          />
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
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
