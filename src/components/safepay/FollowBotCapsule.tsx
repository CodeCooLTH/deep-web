'use client'

/**
 * FollowBotCapsule — แคปซูลสถานะบอทติดตามใต้พรีวิวในแถวกล่องแชท (00095 UX §21 แบบ 3A)
 * ไม่มีตัวเลข/เวลาบนจอ (ผู้ใช้ตัดสิน) — ตัวเลขอยู่ใน aria-label ให้ตัวอ่านหน้าจอเท่านั้น
 * ร้านค้างตอบ = โทน warning ทั้งก้อน + คำ "รอคุณตอบ"
 * ไม่มี run = ผู้เรียกไม่ render (InboxRow ส่ง followBot null/undefined)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx (role=progressbar + aria-valuenow/min/max, ช่องสูง h-0.75/h-1.25 ท่า bg-default-100)
 *       + ui/badges/page.tsx (badge rounded-full border) — ตัดเป็นช่องแยกตามจำนวนรอบตาม mockup 3A ที่ผู้ใช้อนุมัติ
 */
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { capsuleSegments, type CapsuleSegment } from '@/lib/follow-bot-ui'

export type FollowBotCapsuleProps = { sentRounds: number; totalRounds: number; awaitingShop: boolean }

const SEG_CLS: Record<CapsuleSegment, { normal: string; warn: string }> = {
  sent: { normal: 'bg-primary', warn: 'bg-warning' },
  next: { normal: 'bg-primary/30', warn: 'bg-warning/15' },
  rest: { normal: 'bg-default-200', warn: 'bg-default-200' },
}

export default function FollowBotCapsule({ sentRounds, totalRounds, awaitingShop }: FollowBotCapsuleProps) {
  const t = useT().autoNotify
  const segs = capsuleSegments(sentRounds, totalRounds)
  if (segs.length === 0) return null
  const sent = segs.filter((s) => s === 'sent').length
  const label =
    fmt(t.followBotCapsuleAria, { n: sent, total: segs.length }) + (awaitingShop ? ` ${t.followBotCapsuleAwaitingAria}` : '')
  return (
    <span
      className={`mt-1.5 flex w-fit max-w-full items-center gap-1.5 rounded-full border py-0.5 pe-2 ps-1.5 ${
        awaitingShop ? 'border-warning/45 bg-warning/18 text-warning-ink' : 'border-primary/25 bg-primary/10 text-primary-ink'
      }`}
    >
      <Icon icon="target-arrow" width={14} height={14} className="shrink-0" aria-hidden="true" />
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={segs.length}
        aria-valuenow={sent}
        aria-label={label}
        className="flex items-center gap-0.75"
      >
        {segs.map((s, i) => (
          <i key={i} className={`block h-1.5 w-4.5 rounded-full ${SEG_CLS[s][awaitingShop ? 'warn' : 'normal']}`} />
        ))}
      </span>
      {awaitingShop && <span className="text-2xs whitespace-nowrap font-semibold">{t.followBotAwaiting}</span>}
    </span>
  )
}
