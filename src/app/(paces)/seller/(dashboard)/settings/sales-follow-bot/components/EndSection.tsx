'use client'

/**
 * EndSection — ④ "เงื่อนไขการหยุดติดตาม": 2 ประโยคเติมคำ (ลูกค้าตอบกลับ → ส่งต่อให้ใคร · ติดตามครบแล้วไม่ตอบ → รอเท่าไรแล้วทำอะไร) + บรรทัด "หยุดเองเมื่อห้องไม่ตรงเงื่อนไข" + พับ "เหตุหยุดอื่น" — redesign A
 * ย้ายมาจากท้ายรางรอบ (finalAction/finalDelayMin) และกล่องเทา "บอทจะหยุดทักเองเมื่อ" (replyHandoff) — ตรรกะ/ฟิลด์เดิมทุกอย่าง
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx (SfbSelect — จำนวน + หน่วย + การกระทำ)
 *   + theme: theme/paces/Admin/TS/src/app/(admin)/ui/accordions/page.tsx (พับด้วย details/summary)
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { FINAL_ACTIONS, REPLY_HANDOFFS, type FinalAction, type ReplyHandoff } from '@/lib/sales-follow-bot/constants'
import type { BotIssue } from '@/lib/sales-follow-bot/schemas'
import { DELAY_UNITS, FINAL_KEY, REPLY_HANDOFF_KEY, type DelayUnit, type Draft } from '@/lib/sales-follow-bot/ui'
import { issueText } from './issue-text'
import SfbSelect from './SfbSelect'

const UNIT_KEY = { MIN: 'unitMinute', HOUR: 'unitHour', DAY: 'unitDay' } as const

export default function EndSection({ draft, onChange, issues }: { draft: Draft; onChange: (fn: (d: Draft) => Draft) => void; issues: readonly BotIssue[] }) {
  const t = useT().salesFollowBot
  const finalIssues = issues.filter((i) => i.code === 'FINAL_DELAY_INVALID')
  const row = 'border-default-200 border-b py-3 first:pt-0 last:border-b-0 last:pb-0'
  const sentence = 'text-default-800 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm'

  return (
    <div role="group" aria-label={t.endSectionAria}>
      {/* FR-FA-7: ลูกค้าตอบแล้วบอทหยุด ห้องไปไหนต่อ — ค่าเดิม = แอดมิน · Meta AI ใช้ได้เฉพาะ Messenger/IG (LINE เป็นแอดมินเสมอ) */}
      <div className={row}>
        <div className={sentence}>
          <span className="bg-success/15 text-success-ink flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Icon icon="message-reply" aria-hidden="true" />
          </span>
          <label htmlFor="sfb-reply-handoff">{t.replyHandoffLabel}</label>
          <div className="min-w-36">
            <SfbSelect
              inputId="sfb-reply-handoff"
              isSearchable={false}
              options={REPLY_HANDOFFS.map((h) => ({ value: h, label: t[REPLY_HANDOFF_KEY[h]] }))}
              value={{ value: draft.replyHandoff, label: t[REPLY_HANDOFF_KEY[draft.replyHandoff]] }}
              onChange={(o: unknown) => onChange((d) => ({ ...d, replyHandoff: (o as { value: ReplyHandoff } | null)?.value ?? d.replyHandoff }))}
            />
          </div>
        </div>
        <p className="text-default-700 mt-1.5 text-xs md:ps-10">{t.replyHandoffHint}</p>
      </div>

      {/* ติดตามครบทุกรอบแล้วลูกค้ายังไม่ตอบ — ไม่ทำอะไร = พฤติกรรมเดิม */}
      <div id="sfb-final" className={row}>
        <div className={sentence}>
          <span className="bg-default-100 text-default-800 flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Icon icon="flag" aria-hidden="true" />
          </span>
          <label htmlFor="sfb-final-wait">{t.finalPrefix}</label>
          <div className="w-16">
            <input
              id="sfb-final-wait"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.finalValue}
              aria-label={`${t.finalWaitAria} · ${t.amountAria}`}
              aria-invalid={finalIssues.length > 0 || undefined}
              aria-describedby={finalIssues.length > 0 ? 'sfb-final-err' : undefined}
              onChange={(e) => onChange((d) => ({ ...d, finalValue: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
              className="form-input text-center tabular-nums"
            />
          </div>
          <div className="min-w-28">
            <SfbSelect
              inputId="sfb-final-unit"
              aria-label={`${t.finalWaitAria} · ${t.unitAria}`}
              isSearchable={false}
              options={DELAY_UNITS.map((u) => ({ value: u, label: t[UNIT_KEY[u]] }))}
              value={{ value: draft.finalUnit, label: t[UNIT_KEY[draft.finalUnit]] }}
              onChange={(o: unknown) => onChange((d) => ({ ...d, finalUnit: (o as { value: DelayUnit } | null)?.value ?? d.finalUnit }))}
            />
          </div>
          <span>{t.finalThen}</span>
          <div className="min-w-36">
            <SfbSelect
              inputId="sfb-final-action"
              aria-label={t.finalActionAria}
              isSearchable={false}
              options={FINAL_ACTIONS.map((a) => ({ value: a, label: t[FINAL_KEY[a]] }))}
              value={{ value: draft.finalAction, label: t[FINAL_KEY[draft.finalAction]] }}
              onChange={(o: unknown) => onChange((d) => ({ ...d, finalAction: (o as { value: FinalAction } | null)?.value ?? d.finalAction }))}
            />
          </div>
        </div>
        {finalIssues.length > 0 ? (
          <ul id="sfb-final-err" role="alert" className="text-danger-ink mt-1.5 space-y-1 text-xs md:ps-10">
            {finalIssues.map((e, k) => (
              <li key={k}>{issueText(e, t)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-default-700 mt-1.5 text-xs md:ps-10">{t.finalHint}</p>
        )}
      </div>

      {/* สถานะเปลี่ยน/ติดแท็กที่ตั้งว่า "ไม่มี" = ห้องไม่ตรงเงื่อนไขการเริ่มติดตามแล้ว (FR-FA-8) — บรรทัดเดียวแทนรายการซ้ำ */}
      <div className={row}>
        <p className="text-default-800 flex items-start gap-2 text-sm">
          <span className="bg-default-100 text-default-800 flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Icon icon="filter-off" aria-hidden="true" />
          </span>
          <span className="pt-1">{t.stopUnmatched}</span>
        </p>
      </div>

      <details className={`group ${row}`}>
        <summary className="text-default-800 flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium lg:min-h-0">
          <Icon icon="info-circle" aria-hidden="true" />
          {t.stopTitle}
          <Icon icon="chevron-down" className="ms-auto transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {(
            [
              ['clock-off', t.stopWindow],
              ['edit', t.stopEdited],
              ['power', t.stopClosed],
              ['hand-stop', t.stopAdmin],
            ] as const
          ).map(([icon, text]) => (
            <li key={icon} className="text-default-700 flex items-start gap-2 text-sm">
              <Icon icon={icon} className="mt-1 shrink-0" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
