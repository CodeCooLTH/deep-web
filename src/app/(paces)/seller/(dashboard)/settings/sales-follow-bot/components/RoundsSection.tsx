'use client'

/**
 * RoundsSection — ③ "ส่งอะไร เมื่อไร": รางเวลาเส้นประ · ชิปเวลารอระหว่างรอบ · การ์ดรอบ (พับ/กาง) · เพิ่มรอบ · กล่อง "บอทจะหยุดทักเองเมื่อ" (mockup ส่วน 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/timeline/page.tsx (ท่า after:border-dashed + วงกลม — ตัดคอลัมน์เวลาซ้าย)
 *   + theme: .../form/select/components/Select2.tsx (หน่วยเวลา = Select2 ไม่ค้นหา ผ่าน SfbSelect)
 *   + theme: .../apps/ecommerce/(products)/product-add/components/ProductInformation.tsx (form-input · label)
 */
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { SALES_FOLLOW_LIMITS as L } from '@/lib/sales-follow-bot/constants'
import type { BotIssue } from '@/lib/sales-follow-bot/schemas'
import {
  addRoundBlocker,
  DELAY_UNITS,
  emptyStep,
  formatDuration,
  moveBlocker,
  moveItem,
  remainingDelayMin,
  timelineOf,
  type DelayUnit,
  type Draft,
  type DraftStep,
  type QuickMessageLite,
} from '@/lib/sales-follow-bot/ui'
import ActionMenu from './ActionMenu'
import { issueText } from './issue-text'
import PieceList from './PieceList'
import SfbSelect from './SfbSelect'
import { FileThumb, useDurationWords } from './sfb-ui'

const UNIT_KEY = { MIN: 'unitMinute', HOUR: 'unitHour', DAY: 'unitDay' } as const

/** `{ชื่อ}` ในข้อความย่อของการ์ดที่พับ → ชิป (อ่านง่ายกว่าปีกกาดิบ) */
function withChips(text: string, chipLabel: string) {
  return text.split(/(\{ชื่อ\})/).map((seg, i) =>
    seg === '{ชื่อ}' ? (
      <span key={i} className="badge bg-primary/10 text-primary-ink text-2xs mx-0.5 rounded-full font-semibold">
        {chipLabel}
      </span>
    ) : (
      seg
    ),
  )
}

export default function RoundsSection({
  draft,
  onChange,
  open,
  setOpen,
  quick,
  quickList,
  issues,
}: {
  draft: Draft
  onChange: (fn: (d: Draft) => Draft) => void
  open: ReadonlySet<string>
  setOpen: (fn: (s: ReadonlySet<string>) => ReadonlySet<string>) => void
  quick: ReadonlyMap<string, QuickMessageLite>
  quickList: readonly QuickMessageLite[]
  issues: readonly BotIssue[]
}) {
  const t = useT().salesFollowBot
  const words = useDurationWords()
  const tl = timelineOf(draft)
  const blocker = addRoundBlocker(draft)
  const left = L.maxSteps - draft.steps.length

  const setStep = (uid: string, next: DraftStep) => onChange((d) => ({ ...d, steps: d.steps.map((s) => (s.uid === uid ? next : s)) }))
  const moveStep = (from: number, to: number) => onChange((d) => ({ ...d, steps: moveItem(d.steps, from, to) }))
  const toggle = (uid: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(uid)) n.delete(uid)
      else n.add(uid)
      return n
    })

  const stepsIssues = issues.filter((i) => i.stepIndex === undefined)

  return (
    <div>
      {stepsIssues.length > 0 && (
        <ul role="alert" className="text-danger-ink mb-2 space-y-1 text-xs">
          {stepsIssues.map((e, k) => (
            <li key={k}>{issueText(e, t)}</li>
          ))}
        </ul>
      )}

      <div className="relative mt-3 before:absolute before:inset-y-0 before:start-4 before:border-s before:border-dashed before:border-default-300">
        {draft.steps.map((step, i) => {
          const isOpen = open.has(step.uid)
          const ad = tl.adOnly[i]
          const stepErrs = issues.filter((x) => x.stepIndex === i && x.partIndex === undefined)
          const partErrs = issues.filter((x) => x.stepIndex === i && x.partIndex !== undefined)
          const mb = moveBlocker(i, draft.steps.length)
          const unit = step.unit
          const gone = step.parts.some((p) => p.kind === 'QUICK_MESSAGE' && p.quickMessageId !== '' && !quick.has(p.quickMessageId))
          const firstText = step.parts.find((p) => p.kind === 'TEXT' && p.text.trim() !== '')
          const firstImage = step.parts.find((p) => p.kind === 'IMAGES' && p.fileIds.length > 0)
          const summary = step.parts
            .map((p) => (p.kind === 'TEXT' ? t.pieceKindText : p.kind === 'IMAGES' ? fmt(t.pieceKindImages, { n: p.fileIds.length }) : t.pieceKindQuick))
            .join(', ')
          const errId = `sfb-step-${i}-err`
          const noteId = `sfb-step-${i}-ad`

          return (
            <div key={step.uid}>
              {/* ชิปเวลารอก่อนรอบนี้ */}
              <div id={`sfb-step-${i}`} className="relative pt-1 pb-3">
                <div
                  className={`relative inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm md:rounded-full md:py-1 md:ps-3 md:pe-1.5 ${ad ? 'bg-warning/15 text-warning-ink border-transparent' : 'bg-card border-default-300 text-default-800'}`}
                >
                  <Icon icon="clock" className={ad ? 'text-warning-ink' : 'text-default-500'} aria-hidden="true" />
                  <span>{i === 0 ? t.waitFirst : t.waitNext}</span>
                  <div className="w-16">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={step.value}
                      aria-label={`${fmt(t.roundTitle, { n: i + 1 })} · ${t.amountAria}`}
                      aria-invalid={stepErrs.length > 0 || undefined}
                      aria-describedby={[stepErrs.length ? errId : '', ad ? noteId : ''].filter(Boolean).join(' ') || undefined}
                      onChange={(e) => setStep(step.uid, { ...step, value: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) })}
                      className="form-input text-center tabular-nums"
                    />
                  </div>
                  <div className="min-w-28">
                    <SfbSelect
                      inputId={`sfb-unit-${i}`}
                      aria-label={`${fmt(t.roundTitle, { n: i + 1 })} · ${t.unitAria}`}
                      isSearchable={false}
                      options={DELAY_UNITS.map((u) => ({ value: u, label: t[UNIT_KEY[u]] }))}
                      value={{ value: unit, label: t[UNIT_KEY[unit]] }}
                      onChange={(o: unknown) => setStep(step.uid, { ...step, unit: ((o as { value: DelayUnit } | null)?.value ?? unit) })}
                    />
                  </div>
                  {i === 0 && <span>{t.waitFirstSuffix}</span>}
                  <span className={`px-1.5 text-xs tabular-nums ${ad ? 'text-warning-ink' : 'text-default-600'}`}>{fmt(t.cumulative, { d: formatDuration(tl.cumulative[i], words) })}</span>
                </div>
                {ad && (
                  <p id={noteId} className="text-warning-ink mt-1.5 flex items-start gap-1.5 ps-2 text-xs">
                    <Icon icon="speakerphone" className="mt-0.5 shrink-0" aria-hidden="true" />
                    {t.adOnlyNote}
                  </p>
                )}
                {stepErrs.length > 0 && (
                  <ul id={errId} role="alert" className="text-danger-ink mt-1.5 space-y-1 ps-2 text-xs">
                    {stepErrs.map((e, k) => (
                      <li key={k}>{issueText(e, t)}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* การ์ดรอบ */}
              <div
                className={`bg-card relative rounded-lg border p-3 ${isOpen ? 'border-primary' : 'border-default-300 hover:border-default-400'}`}
                {...(!isOpen
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      'aria-label': fmt(t.roundEditAria, { n: i + 1 }),
                      onClick: (e: React.MouseEvent) => {
                        if (!(e.target as HTMLElement).closest('[role="menu"], [aria-haspopup]')) toggle(step.uid)
                      },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          toggle(step.uid)
                        }
                      },
                    }
                  : {})}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isOpen ? 'bg-primary text-white' : 'bg-default-200 text-default-800'}`}>{i + 1}</span>
                  <span className="text-default-900 font-medium whitespace-nowrap">{fmt(t.roundTitle, { n: i + 1 })}</span>
                  {isOpen ? (
                    <button type="button" onClick={() => toggle(step.uid)} aria-expanded="true" className="text-default-600 min-h-11 flex-1 text-start text-xs tabular-nums lg:min-h-0">
                      {fmt(t.roundPieceCount, { n: step.parts.length, max: L.maxParts })}
                    </button>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <ActionMenu
                    ariaLabel={fmt(t.roundMenuAria, { n: i + 1 })}
                    items={[
                      { key: 'up', label: t.moveUp, icon: 'arrow-up', onSelect: () => moveStep(i, i - 1), disabledReason: mb.up ? t.reasonFirstRound : null },
                      { key: 'down', label: t.moveDown, icon: 'arrow-down', onSelect: () => moveStep(i, i + 1), disabledReason: mb.down ? t.reasonLastRound : null },
                      { key: 'del', label: t.remove, icon: 'trash', danger: true, onSelect: () => onChange((d) => ({ ...d, steps: d.steps.filter((s) => s.uid !== step.uid) })), disabledReason: mb.remove ? t.reasonOnlyRound : null },
                    ]}
                  />
                </div>

                {isOpen ? (
                  <PieceList step={step} stepIndex={i} quick={quick} quickList={quickList} issues={partErrs} onChange={(next) => setStep(step.uid, next)} onDraft={onChange} />
                ) : (
                  <>
                    <p className="text-default-600 mt-1 text-xs md:ps-8">
                      {fmt(t.pieceSummary, { n: step.parts.length })} · {summary}
                    </p>
                    {(firstText || firstImage) && (
                      <div className="mt-1.5 flex items-start gap-2.5 md:ps-8">
                        {firstImage && firstImage.kind === 'IMAGES' && <FileThumb fileId={firstImage.fileIds[0]} alt="" className="bg-default-200 size-10 shrink-0 rounded-lg object-cover" />}
                        {firstText && <p className="text-default-700 line-clamp-2 text-sm">{withChips(firstText.text, t.varName)}</p>}
                      </div>
                    )}
                    {gone && (
                      <p className="bg-warning/15 text-warning-ink mt-2 flex items-start gap-1.5 rounded px-2.5 py-1.5 text-xs md:ms-8">
                        <Icon icon="alert-triangle" className="mt-0.5 shrink-0" aria-hidden="true" />
                        {t.quickGone}
                      </p>
                    )}
                    {partErrs.length > 0 && (
                      <p role="alert" className="text-danger-ink mt-2 flex items-start gap-1.5 text-xs md:ps-8">
                        <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
                        {issueText(partErrs[0], t)}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="pb-3" />
            </div>
          )
        })}
      </div>

      <button
        type="button"
        disabled={!!blocker}
        aria-describedby="sfb-add-round-note"
        onClick={() => {
          const s = { ...emptyStep(), value: '1', unit: 'HOUR' as const }
          onChange((d) => ({ ...d, steps: [...d.steps, s] }))
          setOpen((o) => new Set(o).add(s.uid))
        }}
        className="btn border-default-400 text-default-800 hover:bg-default-100 mt-3 min-h-11 w-full border border-dashed disabled:opacity-50 lg:min-h-0"
      >
        <Icon icon="plus" className="size-4" aria-hidden="true" />
        {t.addRound}
      </button>
      <p id="sfb-add-round-note" className="text-default-600 mt-1 text-xs tabular-nums">
        {blocker === 'MAX_ROUNDS'
          ? fmt(t.reasonMaxRounds, { max: L.maxSteps })
          : blocker === 'MAX_TOTAL'
            ? fmt(t.reasonMaxTotal, { d: formatDuration(L.maxTotalDelayMin, words) })
            : fmt(t.roundsLeft, { n: left, d: formatDuration(remainingDelayMin(draft), words) })}
      </p>

      <div className="bg-default-100 mt-5 rounded-lg px-3.5 py-3">
        <p className="text-default-800 text-sm font-medium">{t.stopTitle}</p>
        <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
          {(
            [
              ['message-reply', t.stopReplied],
              ['receipt', t.stopStage],
              ['tag-off', t.stopTag],
              ['clock-off', t.stopWindow],
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
