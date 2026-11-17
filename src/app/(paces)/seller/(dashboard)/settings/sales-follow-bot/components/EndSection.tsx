'use client'

/**
 * EndSection — ④ "เงื่อนไขการหยุดติดตาม": "หยุดติดตามเมื่อ" (ลูกค้าตอบกลับ → ส่งต่อให้ใครเป็นไทล์ · ห้องมีแท็ก · สถานะไม่ตรงแล้ว)
 * + "เมื่อติดตามครบทุกรอบแล้วลูกค้ายังไม่ตอบ" (ไทล์ 4 แบบ + เวลารอ) + กล่องเทา "หยุดเองอัตโนมัติ" (อ่านอย่างเดียว) — ผู้ใช้เลือกแบบไทล์ 2026-11-17
 * แท็กที่ทำให้หยุด = แถว "แท็ก ไม่มี" เดียวกับเงื่อนไขการเริ่ม (toSimpleConditions) — โหมดขั้นสูงกำหนดที่การ์ด 1 แทน · ฟิลด์/ค่าเดิมทั้งหมดไม่เปลี่ยน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (form-radio — ไทล์เป็น radio จริงซ่อนด้วย sr-only)
 *   + theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx (SfbSelect — แท็ก · หน่วยเวลา)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (ไทล์การ์ด)
 */
import type { ReactNode } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { FINAL_ACTIONS, REPLY_HANDOFFS } from '@/lib/sales-follow-bot/constants'
import type { BotIssue } from '@/lib/sales-follow-bot/schemas'
import {
  DELAY_UNITS,
  FINAL_KEY,
  REPLY_HANDOFF_KEY,
  finalWaitDisabled,
  fromSimpleConditions,
  metaAiLineNote,
  toSimpleConditions,
  type DelayUnit,
  type Draft,
  type DraftTag,
} from '@/lib/sales-follow-bot/ui'
import { issueText } from './issue-text'
import SfbSelect from './SfbSelect'

const UNIT_KEY = { MIN: 'unitMinute', HOUR: 'unitHour', DAY: 'unitDay' } as const
const FINAL_ICON = { NONE: 'circle-dashed', RESOLVE: 'circle-check', HIDE: 'eye-off', SPAM: 'ban' } as const
const HANDOFF_ICON = { ADMIN: 'headset', META_AI: 'brand-meta' } as const

/** ไทล์เลือก 1 ตัว = radio จริง (ลูกศรเลื่อนได้) ซ่อนด้วย sr-only · ขอบ/พื้นตามสถานะเลือกด้วย has-checked · วงโฟกัสด้วย has-focus-visible */
function Tile({ name, value, checked, onSelect, icon, title, desc, extra }: { name: string; value: string; checked: boolean; onSelect: () => void; icon: string; title: string; desc: string; extra?: ReactNode }) {
  return (
    <label
      className={`has-focus-visible:ring-primary relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-3 has-focus-visible:ring-2 ${checked ? 'border-primary bg-primary/10' : 'border-default-300 hover:bg-default-100'}`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span className="flex items-center gap-2">
        <Icon icon={icon} className={`size-5 shrink-0 ${checked ? 'text-primary-ink' : 'text-default-700'}`} aria-hidden="true" />
        <span className="text-default-900 text-sm font-medium">{title}</span>
        {checked && <Icon icon="check" className="text-primary-ink ms-auto size-5 shrink-0" aria-hidden="true" />}
      </span>
      <span className="text-default-700 text-xs">{desc}</span>
      {extra}
    </label>
  )
}

export default function EndSection({
  draft,
  onChange,
  issues,
  tags,
  advanced,
  hasLine,
}: {
  draft: Draft
  onChange: (fn: (d: Draft) => Draft) => void
  issues: readonly BotIssue[]
  tags: readonly { key: string; name: string }[]
  /** โหมดขั้นสูงของเงื่อนไขการเริ่ม — แท็กที่ทำให้หยุดกำหนดที่การ์ด 1 */
  advanced: boolean
  /** บอทนี้เลือกช่อง LINE อยู่ (Meta AI ใช้กับ LINE ไม่ได้) */
  hasLine: boolean
}) {
  const t = useT().salesFollowBot
  const finalIssues = issues.filter((i) => i.code === 'FINAL_DELAY_INVALID')
  const simple = toSimpleConditions(draft.conditionMatch, draft.rules)
  const waitOff = finalWaitDisabled(draft.finalAction)
  const head = 'text-default-900 mb-2 text-sm font-semibold'
  const rowCls = 'border-default-200 border-b py-3 first:pt-0 last:border-b-0 last:pb-0'

  const setStopTags = (stopTags: DraftTag[]) =>
    onChange((d) => {
      const cur = toSimpleConditions(d.conditionMatch, d.rules)
      if (!cur) return d
      const r = fromSimpleConditions({ ...cur, stopTags })
      return { ...d, conditionMatch: r.match, rules: r.rules }
    })

  return (
    <div role="group" aria-label={t.endSectionAria}>
      <div className={rowCls}>
        <p className={head}>{t.stopWhenHead}</p>
        <ul className="space-y-3">
          {/* FR-FA-7: ลูกค้าตอบแล้วบอทหยุดเสมอ (เลือกปิดไม่ได้) — เลือกได้แค่ส่งห้องต่อให้ใคร · ค่าเดิม = แอดมิน */}
          <li>
            <p className="text-default-800 flex items-center gap-2 text-sm">
              <Icon icon="circle-check" className="text-success-ink size-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">{t.stopReplyTitle}</span>
              <span className="badge bg-default-200 text-default-800 text-xs">{t.stopAlwaysOn}</span>
            </p>
            <p id="sfb-reply-handoff-label" className="text-default-700 mt-2 text-xs">
              {t.handoffThen}
            </p>
            <div id="sfb-reply-handoff" role="radiogroup" aria-labelledby="sfb-reply-handoff-label" className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {REPLY_HANDOFFS.map((h) => (
                <Tile
                  key={h}
                  name="sfb-handoff"
                  value={h}
                  checked={draft.replyHandoff === h}
                  onSelect={() => onChange((d) => ({ ...d, replyHandoff: h }))}
                  icon={HANDOFF_ICON[h]}
                  title={t[REPLY_HANDOFF_KEY[h]]}
                  desc={h === 'ADMIN' ? t.handoffAdminDesc : t.replyHandoffHint}
                />
              ))}
            </div>
            {metaAiLineNote(draft.replyHandoff, hasLine) && (
              <p className="bg-info/15 text-info-ink mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
                <Icon icon="info-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
                {t.handoffLineNote}
              </p>
            )}
          </li>
          <li>
            <label htmlFor="sfb-stop-tags" className="text-default-800 mb-1.5 flex items-center gap-2 text-sm font-medium">
              <Icon icon="tag" className="text-default-700 size-5 shrink-0" aria-hidden="true" />
              {t.stopTagLabel}
            </label>
            {!advanced && simple ? (
              <SfbSelect
                inputId="sfb-stop-tags"
                isMulti
                isClearable
                placeholder={t.tagPlaceholder}
                noOptionsMessage={() => (tags.length === 0 ? t.noTags : t.noOptions)}
                options={tags.map((x) => ({ value: x.key, label: x.name }))}
                value={simple.stopTags.map((x) => ({ value: x.key, label: x.missing ? fmt(t.tagGoneChip, { name: x.name }) : x.name, missing: x.missing }))}
                classNames={{ multiValue: (s: { data: unknown }) => ((s.data as { missing?: boolean }).missing ? 'sfb-chip-gone' : '') }}
                onChange={(v: unknown) => {
                  const picked = (v as readonly { value: string; label: string }[] | null) ?? []
                  const prev = new Map(simple.stopTags.map((y) => [y.key, y]))
                  setStopTags(picked.map((o): DraftTag => prev.get(o.value) ?? { key: o.value, name: o.label, missing: false }))
                }}
              />
            ) : (
              <p id="sfb-stop-tags" className="text-default-700 bg-default-100 rounded-lg px-3 py-2 text-xs">
                {t.stopTagAdvancedNote}
              </p>
            )}
          </li>
          {/* FR-FA-8: สถานะการขายที่ตั้งไว้ไม่ตรงแล้ว = หยุดเอง (CONDITION_UNMATCHED) — ตั้งที่การ์ด 1 ไม่ต้องตั้งซ้ำ */}
          <li className="text-default-800 flex items-center gap-2 text-sm">
            <Icon icon="circle-check" className="text-success-ink size-5 shrink-0" aria-hidden="true" />
            <span className="font-medium">{t.stopStageUnmatched}</span>
            <span className="badge bg-default-200 text-default-800 text-xs">{t.stopAlwaysOn}</span>
          </li>
        </ul>
      </div>

      {/* ติดตามครบทุกรอบแล้วลูกค้ายังไม่ตอบ — ไม่ทำอะไร = พฤติกรรมเดิม */}
      <div id="sfb-final" className={rowCls}>
        <p id="sfb-final-head" className={head}>
          {t.finalHead}
        </p>
        <div role="radiogroup" aria-labelledby="sfb-final-head" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {FINAL_ACTIONS.map((a) => (
            <Tile
              key={a}
              name="sfb-final-action"
              value={a}
              checked={draft.finalAction === a}
              onSelect={() => onChange((d) => ({ ...d, finalAction: a }))}
              icon={FINAL_ICON[a]}
              title={t[FINAL_KEY[a]]}
              desc={t[`${FINAL_KEY[a]}Desc` as 'finalNoneDesc']}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          <label htmlFor="sfb-final-wait" className={waitOff ? 'text-default-600' : 'text-default-800'}>
            {t.finalWaitLabel}
          </label>
          <div className="w-16">
            <input
              id="sfb-final-wait"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.finalValue}
              disabled={waitOff}
              aria-label={`${t.finalWaitAria} · ${t.amountAria}`}
              aria-invalid={finalIssues.length > 0 || undefined}
              aria-describedby={waitOff ? 'sfb-final-off' : finalIssues.length > 0 ? 'sfb-final-err' : undefined}
              onChange={(e) => onChange((d) => ({ ...d, finalValue: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
              className="form-input text-center tabular-nums"
            />
          </div>
          <div className="min-w-28">
            <SfbSelect
              inputId="sfb-final-unit"
              aria-label={`${t.finalWaitAria} · ${t.unitAria}`}
              isSearchable={false}
              isDisabled={waitOff}
              options={DELAY_UNITS.map((u) => ({ value: u, label: t[UNIT_KEY[u]] }))}
              value={{ value: draft.finalUnit, label: t[UNIT_KEY[draft.finalUnit]] }}
              onChange={(o: unknown) => onChange((d) => ({ ...d, finalUnit: (o as { value: DelayUnit } | null)?.value ?? d.finalUnit }))}
            />
          </div>
        </div>
        {waitOff ? (
          <p id="sfb-final-off" className="text-default-700 mt-1.5 text-xs">
            {t.finalWaitOff}
          </p>
        ) : finalIssues.length > 0 ? (
          <ul id="sfb-final-err" role="alert" className="text-danger-ink mt-1.5 space-y-1 text-xs">
            {finalIssues.map((e, k) => (
              <li key={k}>{issueText(e, t)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-default-700 mt-1.5 text-xs">{t.finalHint}</p>
        )}
      </div>

      <div className="bg-default-100 mt-3 rounded-lg p-3">
        <p className="text-default-900 mb-2 flex items-center gap-2 text-sm font-semibold">
          <Icon icon="robot" aria-hidden="true" />
          {t.stopTitle}
          <span className="badge bg-default-200 text-default-800 text-xs font-normal">{t.stopAutoBadge}</span>
        </p>
        <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
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
      </div>
    </div>
  )
}
