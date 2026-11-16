'use client'

/**
 * ChannelSection — ② "ส่งทางไหน": รายการช่องทางเป็น checkbox (รูปโปรไฟล์เพจ/OA + โลโก้แพลตฟอร์ม + ชื่อ + บรรทัดรอง) — mockup ส่วน 3
 * ช่องที่ชน (findChannelConflicts ตัวเดียวกับ server · คำนวณสดตามสถานะการขายที่เลือก): checkbox ล็อก + lock + "บอท “…” ใช้ช่องทางนี้อยู่" (AC-FB-20)
 * ช่องที่ติ๊กไว้แล้วกลับกลายเป็นชน = ข้อความแดง (ผู้ใช้เปลี่ยนสถานะภายหลัง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/page.tsx (form-checkbox · เลย์เอาต์ checkbox + ป้ายกำกับ)
 *   + src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx (รูปเพจ + ชื่อ + ชนิดช่องทาง)
 */
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import type { BotOptions } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform } from './sfb-ui'

type ChannelOpt = BotOptions['channels'][number]

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
  const kind = (c: ChannelOpt): string => {
    if (c.provider === 'MESSENGER') return t.kindMessenger
    const base = c.provider === 'INSTAGRAM' ? t.kindInstagram : t.kindLine
    return c.handle ? (c.provider === 'INSTAGRAM' ? `${c.handle} · ${base}` : `${base} · ${c.handle}`) : base
  }
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
        {channels.map((c) => {
          const checked = selected.includes(c.id)
          const clash = conflicts.get(c.id)
          const locked = !!clash && !checked
          return (
            <li key={c.id} className="flex min-h-11 items-center gap-3 py-2.5">
              <label className={`flex min-w-0 flex-1 items-center gap-3 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" className="form-checkbox shrink-0" checked={checked} disabled={locked} onChange={(e) => onToggle(c.id, e.target.checked)} />
                <span className={locked ? 'opacity-60' : ''}>
                  <AvatarWithPlatform imageUrl={c.avatarUrl} name={c.name} provider={c.provider} className="size-9" badge="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${locked ? 'text-default-700' : 'text-default-900'}`}>
                    {c.name}
                    {locked && <Icon icon="lock" className="ms-1 inline align-text-bottom" aria-hidden="true" />}
                  </span>
                  <span className="text-default-600 block truncate text-xs">{kind(c)}</span>
                </span>
                {c.status !== 'ACTIVE' && <span className="badge bg-warning/15 text-warning-ink shrink-0 text-xs">{t.channelDisconnected}</span>}
              </label>
              {clash && (
                <span className={`min-w-0 text-xs ${checked ? 'text-danger-ink' : 'text-default-700'}`} role={checked ? 'alert' : undefined}>
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
