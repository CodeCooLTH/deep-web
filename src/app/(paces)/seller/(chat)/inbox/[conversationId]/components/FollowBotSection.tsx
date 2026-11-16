'use client'

/**
 * FollowBotSection — แผง "บอทติดตาม" ในแท็บข้อมูลลูกค้า ต่อจากบล็อก CRM (00095 S-8b · UX §3 · mockup §4 · 3 กรณี)
 *  1) ปกติ — รางรอบ: ส่งแล้ว HH:MM · รอบถัดไป "อีก … ราว HH:MM" (เด่น) · รอส่ง
 *  2) ร้านค้างตอบ — กล่อง warning "ลูกค้ารอคุณตอบอยู่" + ทุกรอบเป็น "รอส่ง"
 *  3) พัก/ไม่ได้ส่ง/ส่งไม่สำเร็จ — กล่องเทา (holdText จาก server) + แถว warning/danger
 * ไม่มี run = ไม่ render อะไรเลย (รวมเส้นคั่น) — P1 ไม่มีปุ่มแนบมือ แถวว่างจึงไม่ให้ข้อมูล (UX §3.1 · AC-FB-74/85)
 * ข้อมูล/หยุดบอท มาจาก FollowBotRoomProvider (ยิงครั้งเดียวต่อห้อง ใช้ร่วมกับชิปหัวห้อง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/timeline/page.tsx (รางเส้นประ after:border-dashed + จุดวงกลม — บีบให้พอดี 384px ตัดคอลัมน์เวลา)
 *       พี่น้องตำแหน่งเดียวกัน ./FollowUpPanel.tsx (หัว text-sm font-semibold + ปุ่มขวา · skeleton · แถวล้ม+ลองใหม่) · กล่อง warning/เทา จาก settings/auto-notify/components/AutoNotifyClient.tsx
 */
import Icon from '@/components/wrappers/Icon'
import { useNowMs } from '@/hooks/useNowMs'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatTimeHM } from '@/lib/format-date'
import { formatRemaining, nextStepIndex, stepRowKind, stopControl, type StepRowKind } from '@/lib/follow-bot-room'
import type { PanelStep } from '@/services/sales-follow-bot.service'
import { useFollowBotRoom } from '../../../_components/FollowBotRoomProvider'

/** ไอคอน/สีต่อชนิดแถว — เขียนเต็มคำ (Tailwind สแกน static) */
const TONE: Record<StepRowKind, string> = {
  sent: 'text-default-800',
  next: 'text-primary-ink font-medium',
  waiting: 'text-default-700',
  sending: 'text-default-800',
  skipped: 'text-warning-ink',
  failed: 'text-danger-ink',
}

export default function FollowBotSection() {
  const tAll = useT()
  const t = tAll.autoNotify
  const { status, run, stopping, reload, stop } = useFollowBotRoom()
  const nowMs = useNowMs(run !== null)

  if (status === 'idle') return null
  // รอบแรกยังไม่รู้ว่ามี run ไหม — แสดง skeleton ตามสเปก · โหลดเสร็จแล้วไม่มี run = หายทั้งก้อน
  if (status === 'loading' && !run) {
    return (
      <div className="border-default-300 border-t border-dashed pt-4">
        <div className="space-y-2" role="status">
          <span className="sr-only">{tAll.common.loading}</span>
          <div className="bg-default-100 h-14 animate-pulse rounded-lg" />
          <div className="bg-default-100 h-14 animate-pulse rounded-lg" />
        </div>
      </div>
    )
  }
  if (status === 'error' && !run) {
    return (
      <div className="border-default-300 border-t border-dashed pt-4">
        <div className="space-y-2 py-2 text-center">
          <p className="text-default-700 mb-0 text-sm">{t.followBotLoadError}</p>
          <button type="button" onClick={() => void reload(false)} className="btn min-h-11 border border-default-300">
            <Icon icon="refresh" className="me-1" aria-hidden="true" /> {t.followBotRetry}
          </button>
        </div>
      </div>
    )
  }
  if (!run) return null

  const ctl = stopControl(run, stopping)
  const nextIdx = nextStepIndex(run.steps)
  const units = { day: t.followBotUnitDay, hour: t.followBotUnitHour, minute: t.followBotUnitMinute }

  const renderStep = (s: PanelStep, i: number) => {
    const kind = stepRowKind(s, i === nextIdx)
    const lead =
      kind === 'sent' ? (
        <Icon icon="circle-check-filled" className="text-success-ink relative z-10 shrink-0 bg-card text-base" aria-hidden="true" />
      ) : kind === 'next' ? (
        <span className="border-primary relative z-10 size-4 shrink-0 rounded-full border-4 bg-card" aria-hidden="true" />
      ) : kind === 'sending' ? (
        <Icon icon="loader-2" className="relative z-10 shrink-0 animate-spin bg-card text-base motion-reduce:animate-none" aria-hidden="true" />
      ) : kind === 'skipped' ? (
        <Icon icon="alert-triangle" className="relative z-10 shrink-0 bg-card text-base" aria-hidden="true" />
      ) : kind === 'failed' ? (
        <Icon icon="circle-x" className="relative z-10 shrink-0 bg-card text-base" aria-hidden="true" />
      ) : (
        <span className="border-default-400 relative z-10 size-4 shrink-0 rounded-full border bg-card" aria-hidden="true" />
      )
    const dueMs = s.dueAt ? Date.parse(s.dueAt) : NaN
    const body =
      kind === 'sent' ? (
        fmt(t.followBotStepSent, { time: formatTimeHM(s.sentAt) })
      ) : kind === 'next' && !Number.isNaN(dueMs) ? (
        <>
          {fmt(t.followBotStepIn, { in: formatRemaining(Math.max(0, dueMs - nowMs), units) })}{' '}
          <span className="text-default-700 text-xs font-normal">{fmt(t.followBotStepAbout, { at: formatTimeHM(s.dueAt) })}</span>
        </>
      ) : kind === 'sending' ? (
        t.followBotStepSending
      ) : kind === 'skipped' ? (
        [t.followBotStepSkipped, s.reasonText].filter(Boolean).join(' · ')
      ) : kind === 'failed' ? (
        t.followBotStepFailed
      ) : (
        t.followBotStepWaiting
      )
    return (
      // รางเส้นประ: pseudo ของแถว (ท่า timeline) — แถวสุดท้ายซ่อนด้วย last:after:hidden
      <li
        key={s.index}
        className={`after:border-default-300 relative flex min-h-8 items-center gap-2 text-sm after:absolute after:start-2 after:top-6 after:-bottom-2 after:w-px after:border-e after:border-dashed last:after:hidden ${TONE[kind]}`}
      >
        {lead}
        <span className="min-w-0 flex-1">{body}</span>
        <span className="text-default-700 shrink-0 text-xs">{fmt(t.followBotRound, { n: s.index })}</span>
      </li>
    )
  }

  return (
    <div className="border-default-300 border-t border-dashed pt-4">
      <div className="space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-default-900 mb-0 min-w-0 flex-1 truncate text-sm font-semibold">{t.followBotPanelTitle}</p>
          <button
            type="button"
            onClick={() => void stop()}
            disabled={ctl.disabled}
            aria-busy={stopping}
            className="btn btn-sm min-h-11 shrink-0 border border-default-300 text-default-800 lg:min-h-8"
          >
            {t.followBotStop}
          </button>
        </div>
        {ctl.showReason && <p className="text-default-700 mb-0 text-xs">{t.followBotCannotStop}</p>}
        <p className="text-default-700 mb-0 text-xs">{[run.botName, run.stageLabel].filter(Boolean).join(' · ')}</p>

        {run.awaitingShop ? (
          <div className="bg-warning/15 text-warning-ink flex items-start gap-2 rounded-lg p-3 text-xs">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <div className="min-w-0">
              <p className="mb-0 text-sm font-medium">{t.followBotOweTitle}</p>
              <p className="mb-0">{t.followBotAfterReply}</p>
            </div>
          </div>
        ) : run.holdText ? (
          <div className="bg-default-100 text-default-800 flex items-start gap-2 rounded-lg p-3 text-xs">
            <Icon icon="player-pause" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <p className="mb-0 text-sm">{run.holdText}</p>
          </div>
        ) : null}

        <ol className="m-0 list-none space-y-2 p-0">{run.steps.map(renderStep)}</ol>
      </div>
    </div>
  )
}
