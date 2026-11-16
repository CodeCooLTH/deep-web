'use client'

/**
 * FollowBotBubbleBadge — ป้ายเกยขอบ "บอทติดตาม n/N" บนฟองของบอทติดตามยอดขาย (00095 UX §4.2/§16)
 * ใช้ร่วมทั้งฟองเดี่ยวและอัลบั้มรูป (ห้าม copy — รอบที่ขึ้นด้วยรูปจะเป็นอัลบั้ม)
 * ท่าเดียวกับป้าย AUTO_NOTICE · ไม่มีเลขเมื่อไม่มี followStep/followStepCount
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (badge rounded-full border) · ท่าเกยขอบคัดจาก ThreadMessageList.tsx
 */
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'

export default function FollowBotBubbleBadge({ followStep, followStepCount }: { followStep?: number | null; followStepCount?: number | null }) {
  const t = useT().autoNotify
  // followStep มาจาก server แบบ 1-based แล้ว (chat.service · TFR-FB-24) — ห้ามบวก 1 ซ้ำ
  const step = followStep != null && followStepCount ? { n: followStep, total: followStepCount } : null
  const label = step ? fmt(t.followBotSentByStep, step) : t.followBotSentBy
  return (
    <span
      title={label}
      className="border-default-300 bg-card text-default-700 absolute top-0 end-2.5 z-20 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow"
    >
      <Icon icon="target-arrow" className="text-xs" aria-hidden="true" />
      <span aria-hidden="true">
        {t.followBotBadge}
        {step && <> <span className="font-semibold tabular-nums">{step.n}/{step.total}</span></>}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
