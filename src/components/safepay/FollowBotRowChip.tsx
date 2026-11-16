'use client'

/**
 * FollowBotRowChip — ชิปสถานะบอทติดตามในบรรทัดป้ายของแถวกล่องแชท (00095 แบบ 2 · user อนุมัติ 2026-11-16)
 * "บอทติดตาม n/N" (primary) · ร้านค้างตอบ = ชิป warning "รอคุณตอบ" · aria คงประโยคเต็มเดิม
 * ไม่มี run (totalRounds 0) = ไม่ render · แคปซูลเดิมไม่ถูกใช้ในแถวแล้ว (FollowBotCapsule คงไฟล์ไว้รอ user ตัดสิน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (.badge + bg-*\/15 text-*-ink ท่าเดียวกับชิป DeepBot ในแถว)
 */
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { capsuleSegments } from '@/lib/follow-bot-ui'
import type { FollowBotCapsuleProps } from './FollowBotCapsule'

type Copy = ReturnType<typeof useT>['autoNotify']

function view(t: Copy, { sentRounds, totalRounds, awaitingShop }: FollowBotCapsuleProps) {
  const segs = capsuleSegments(sentRounds, totalRounds)
  if (segs.length === 0) return null
  const n = segs.filter((s) => s === 'sent').length
  const text = awaitingShop ? t.followBotAwaiting : fmt(t.followBotChip, { n, total: segs.length })
  const aria = fmt(t.followBotCapsuleAria, { n, total: segs.length }) + (awaitingShop ? ` ${t.followBotCapsuleAwaitingAria}` : '')
  return { text, aria }
}

/** ชื่อชิปสำหรับนับ "+N" ใน rowChipOverflow — null = ไม่มีชิป */
export const followBotRowChipName = (t: Copy, p: FollowBotCapsuleProps): string | null => view(t, p)?.text ?? null

export default function FollowBotRowChip(p: FollowBotCapsuleProps) {
  const t = useT().autoNotify
  const v = view(t, p)
  if (!v) return null
  return (
    <span
      role="img"
      aria-label={v.aria}
      title={v.aria}
      className={`badge text-2xs inline-flex shrink-0 items-center gap-1 ${p.awaitingShop ? 'bg-warning/15 text-warning-ink' : 'bg-primary/15 text-primary-ink'}`}
    >
      <Icon icon="target-arrow" width={12} height={12} className="shrink-0" aria-hidden="true" />
      {v.text}
    </span>
  )
}
