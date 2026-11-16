'use client'

/**
 * FollowBotChipDetail — กล่องที่กางจากชิป "บอทกำลังตาม" / "รอคุณตอบก่อน" ที่หัวห้อง (00095 S-8b · UX §4.1 · mockup §5)
 * ไอคอน · ชื่อบอท · แถบแบ่งช่อง (ตัวเดียวกับแคปซูลในแถวกล่องแชท) · "รอบที่ n จาก N จะส่งในอีก … (ประมาณ HH:MM)"
 * + ปุ่ม "ดูทุกขั้นตอน" (เปิดแผงข้อมูลลูกค้า — ส่ง onViewAll มาเฉพาะจอที่แผงไม่ได้ตั้งอยู่ข้าง ๆ) และ "หยุดบอท" (ตัวเดียวกับแผง)
 * ไม่มี run = คืน null · ข้อมูลมาจาก FollowBotRoomProvider (ยิงครั้งเดียวร่วมกับแผง)
 *
 * Base: กล่องการ์ดในตัวกางของ ./ThreadChipStrip.tsx (bg-{tone}/15 + -ink, rounded-lg, ไอคอนนำ) เหมือนแถบ chatbot-test ใน ./ChatThread.tsx
 *       ปุ่มจาก settings/auto-notify/components/AutoNotifyClient.tsx (btn + border-default-300)
 */
import Icon from '@/components/wrappers/Icon'
import FollowBotSegBar from '@/components/safepay/FollowBotSegBar'
import { useNowMs } from '@/hooks/useNowMs'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatTimeHM } from '@/lib/format-date'
import { chipTone, formatRemaining, nextRoundSummary, sentRounds, stopControl } from '@/lib/follow-bot-room'
import { useFollowBotRoom } from '../../../_components/FollowBotRoomProvider'

export default function FollowBotChipDetail({ onViewAll }: { onViewAll?: () => void }) {
  const t = useT().autoNotify
  const { run, stopping, stop } = useFollowBotRoom()
  const nowMs = useNowMs(run !== null)
  if (!run) return null

  const tone = chipTone(run)
  const ctl = stopControl(run, stopping)
  const summary = nextRoundSummary(run, nowMs)
  const units = { day: t.followBotUnitDay, hour: t.followBotUnitHour, minute: t.followBotUnitMinute }
  const text =
    summary?.kind === 'afterReply'
      ? t.followBotAfterReply
      : summary?.kind === 'hold'
        ? summary.text
        : summary?.kind === 'due'
          ? fmt(t.followBotNextRound, {
              n: summary.n,
              total: summary.total,
              in: formatRemaining(summary.remainingMs, units),
              at: formatTimeHM(summary.dueAt),
            })
          : null

  return (
    <div
      className={`${tone === 'warning' ? 'bg-warning/15 text-warning-ink' : 'bg-info/15 text-info-ink'} @container flex flex-wrap items-start gap-2 rounded-lg px-3 py-2 text-sm`}
    >
      <Icon icon="target-arrow" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="mb-0 font-semibold">
          {fmt(tone === 'warning' ? t.followBotBoxTitleAwaiting : t.followBotBoxTitle, { name: run.botName })}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {!run.awaitingShop && (
            <FollowBotSegBar sentRounds={sentRounds(run.steps)} totalRounds={run.steps.length} awaitingShop={false} />
          )}
          {text && <span className="min-w-0">{text}</span>}
        </div>
        {ctl.showReason && <p className="mt-1 mb-0 text-xs">{t.followBotCannotStop}</p>}
      </div>
      <div className="flex basis-full gap-2 @3xl:basis-auto @3xl:self-center">
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="btn min-h-11 flex-1 font-semibold @3xl:min-h-8 @3xl:flex-none">
            {t.followBotViewAll}
          </button>
        )}
        <button
          type="button"
          onClick={() => void stop()}
          disabled={ctl.disabled}
          aria-busy={stopping}
          className="btn bg-card border-default-300 text-default-800 min-h-11 flex-1 border @3xl:min-h-8 @3xl:flex-none"
        >
          {t.followBotStop}
        </button>
      </div>
    </div>
  )
}
