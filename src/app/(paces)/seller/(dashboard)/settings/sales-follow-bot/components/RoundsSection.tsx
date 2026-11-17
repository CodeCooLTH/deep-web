'use client'

/**
 * RoundsSection — ③ "รอบการติดตาม": timeline แนวตั้ง (รางซ้ายเส้นประ · วงนาฬิกา = เวลารอ · วงเลข = รอบ) · ลากสลับรอบ · การ์ดรอบ (พับ/กาง) · เพิ่มรอบ · (mockup ส่วน 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/timeline/page.tsx (ท่าเส้นประ + วงกลม — ตัดคอลัมน์เวลาซ้าย)
 *   + src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity.tsx (เส้นประเป็น element จริง w-px flex-1 border-e border-dashed)
 *   + settings/auto-notify … TemplateBuilderClient.tsx (ท่า @hello-pangea/dnd)
 *   + theme: .../form/select/components/Select2.tsx (หน่วยเวลา = Select2 ไม่ค้นหา ผ่าน SfbSelect)
 *   + theme: .../apps/ecommerce/(products)/product-add/components/ProductInformation.tsx (form-input · label)
 */
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { useRef } from 'react'

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
  firstAdOnlyIndex,
  draftStepPreview,
  moveBlocker,
  moveItem,
  remainingDelayMin,
  timelineOf,
  type DelayUnit,
  type Draft,
  type DraftStep,
  type QuickMessageLite,
} from '@/lib/sales-follow-bot/ui'
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
  // กางทีละรอบ (redesign A) — กางรอบใหม่ = พับรอบที่เปิดอยู่ ฟอร์มไม่ยาวเกินจอ
  const toggle = (uid: string) => setOpen((s) => (s.has(uid) ? new Set() : new Set([uid])))

  // ลากเริ่ม = พับทุกรอบเป็นบรรทัดเดียว (ลากข้ามรอบที่กางสูงไม่ไหว) · วางแล้วเปิดรอบที่เปิดอยู่ก่อนลากกลับ
  const openBeforeDrag = useRef<ReadonlySet<string>>(new Set())
  const onBeforeCapture = () => {
    openBeforeDrag.current = open
    setOpen(() => new Set())
  }
  const onDragEnd = (r: DropResult) => {
    // delayMin อยู่ในรอบเอง ⇒ ย้ายรอบ = เวลารอย้ายตาม · "นับจากร้านตอบล่าสุด" ผูกกับตำแหน่ง i===0
    if (r.destination && r.destination.index !== r.source.index) onChange((d) => ({ ...d, steps: moveItem(d.steps, r.source.index, r.destination!.index) }))
    setOpen(() => openBeforeDrag.current)
  }

  const stepsIssues = issues.filter((i) => i.stepIndex === undefined && i.code !== 'FINAL_DELAY_INVALID')
  const adFirst = firstAdOnlyIndex(tl.adOnly)
  const noteId = 'sfb-ad-note'

  return (
    <div>
      {stepsIssues.length > 0 && (
        <ul role="alert" className="text-danger-ink mb-2 space-y-1 text-xs">
          {stepsIssues.map((e, k) => (
            <li key={k}>{issueText(e, t)}</li>
          ))}
        </ul>
      )}

      <DragDropContext onBeforeCapture={onBeforeCapture} onDragEnd={onDragEnd}>
        <Droppable droppableId="sfb-rounds">
          {(drop) => (
            <div ref={drop.innerRef} {...drop.droppableProps}>
              {draft.steps.map((step, i) => {
                const isOpen = open.has(step.uid)
                const isLast = i === draft.steps.length - 1
                const ad = tl.adOnly[i]
                const stepErrs = issues.filter((x) => x.stepIndex === i && x.partIndex === undefined)
                const partErrs = issues.filter((x) => x.stepIndex === i && x.partIndex !== undefined)
                const mb = moveBlocker(i, draft.steps.length)
                const unit = step.unit
                const gone = step.parts.some((p) => p.kind === 'QUICK_MESSAGE' && p.quickMessageId !== '' && !quick.has(p.quickMessageId))
                const preview = draftStepPreview(step)
                const firstImage = step.parts.find((p) => p.kind === 'IMAGES' && p.fileIds.length > 0)
                const summary = step.parts
                  .map((p) => (p.kind === 'TEXT' ? t.pieceKindText : p.kind === 'IMAGES' ? fmt(t.pieceKindImages, { n: p.fileIds.length }) : t.pieceKindQuick))
                  .join(', ')
                const errId = `sfb-step-${i}-err`

                return (
                  <Draggable key={step.uid} draggableId={step.uid} index={i}>
                    {(drag, snap) => (
                      <div ref={drag.innerRef} {...drag.draggableProps} className={snap.isDragging ? 'bg-card rounded-lg shadow-lg' : ''}>
                        {/* เวลารอก่อนรอบนี้ — แถวธรรมดา ไม่มีพื้นหลัง */}
                        <div id={`sfb-step-${i}`} className="flex gap-x-3">
                          <div className="flex w-8 shrink-0 flex-col items-center">
                            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${ad ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-700'}`}>
                              <Icon icon="clock" className="text-base" aria-hidden="true" />
                            </span>
                            <span className="border-default-300 w-px flex-1 border-e border-dashed" />
                          </div>
                          <div className="min-w-0 flex-1 pb-3">
                            <div className={`flex min-h-8 flex-wrap items-center gap-1.5 text-sm ${ad ? 'text-warning-ink' : 'text-default-800'}`}>
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
                              <span className={`text-xs tabular-nums ${ad ? 'text-warning-ink' : 'text-default-700'}`}>{fmt(t.cumulative, { d: formatDuration(tl.cumulative[i], words) })}</span>
                            </div>
                            {i === adFirst && (
                              <p id={noteId} className="text-warning-ink mt-1 flex items-start gap-1.5 text-xs">
                                <Icon icon="speakerphone" className="mt-0.5 shrink-0" aria-hidden="true" />
                                {t.adOnlyNote}
                              </p>
                            )}
                            {stepErrs.length > 0 && (
                              <ul id={errId} role="alert" className="text-danger-ink mt-1 space-y-1 text-xs">
                                {stepErrs.map((e, k) => (
                                  <li key={k}>{issueText(e, t)}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {/* รอบ: วงเลขบนราง + การ์ดทางขวา */}
                        <div className="flex gap-x-3">
                          <div className="flex w-8 shrink-0 flex-col items-center">
                            <span className="bg-primary/15 text-primary-ink flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums">{i + 1}</span>
                            {!isLast && <span className="border-default-300 w-px flex-1 border-e border-dashed" />}
                          </div>
                          <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-3'}`}>
                            <div
                              className={`bg-card relative rounded-lg border p-2 ${isOpen ? 'border-primary' : 'border-default-300 hover:border-default-400'}`}
                              {...(!isOpen
                                ? {
                                    role: 'button' as const,
                                    tabIndex: 0,
                                    'aria-label': fmt(t.roundEditAria, { n: i + 1 }),
                                    onClick: (e: React.MouseEvent) => {
                                      if (!(e.target as HTMLElement).closest('button, [data-rfd-drag-handle-draggable-id]')) toggle(step.uid)
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
                              <div className="flex items-center gap-1">
                                <span {...drag.dragHandleProps} aria-label={t.dragAria} title={t.dragAria} className="text-default-700 flex size-11 shrink-0 cursor-grab items-center justify-center text-base lg:size-9">
                                  <Icon icon="grip-vertical" aria-hidden="true" />
                                </span>
                                <span className="text-default-900 font-medium whitespace-nowrap">{fmt(t.roundTitle, { n: i + 1 })}</span>
                                {isOpen ? (
                                  <button type="button" onClick={() => toggle(step.uid)} aria-expanded="true" className="text-default-700 min-h-11 flex-1 text-start text-xs tabular-nums lg:min-h-0">
                                    {fmt(t.roundPieceCount, { n: step.parts.length, max: L.maxParts })}
                                  </button>
                                ) : (
                                  <span className="flex min-w-0 flex-1 items-center gap-2">
                                    {firstImage && firstImage.kind === 'IMAGES' && <FileThumb fileId={firstImage.fileIds[0]} alt="" className="bg-default-200 size-8 shrink-0 rounded object-cover" />}
                                    <span className="text-default-700 min-w-0 truncate text-sm">{preview ? withChips(preview, t.varName) : summary}</span>
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label={fmt(t.roundRemoveAria, { n: i + 1 })}
                                  title={mb.remove ? t.reasonOnlyRound : fmt(t.roundRemoveAria, { n: i + 1 })}
                                  disabled={!!mb.remove}
                                  onClick={() => onChange((d) => ({ ...d, steps: d.steps.filter((s) => s.uid !== step.uid) }))}
                                  className="btn btn-icon text-danger-ink hover:bg-default-100 size-11 shrink-0 disabled:opacity-50 lg:size-9"
                                >
                                  <Icon icon="trash" className="size-5" aria-hidden="true" />
                                </button>
                              </div>

                              {isOpen ? (
                                <PieceList step={step} stepIndex={i} quick={quick} quickList={quickList} issues={partErrs} onChange={(next) => setStep(step.uid, next)} onDraft={onChange} />
                              ) : (
                                <>
                                  {gone && (
                                    <p className="bg-warning/15 text-warning-ink mt-2 flex items-start gap-1.5 rounded px-2.5 py-1.5 text-xs">
                                      <Icon icon="alert-triangle" className="mt-0.5 shrink-0" aria-hidden="true" />
                                      {t.quickGone}
                                    </p>
                                  )}
                                  {partErrs.length > 0 && (
                                    <p role="alert" className="text-danger-ink mt-2 flex items-start gap-1.5 text-xs">
                                      <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
                                      {issueText(partErrs[0], t)}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                )
              })}
              {drop.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button
        type="button"
        disabled={!!blocker}
        aria-describedby="sfb-add-round-note"
        onClick={() => {
          const s = { ...emptyStep(), value: '1', unit: 'HOUR' as const }
          onChange((d) => ({ ...d, steps: [...d.steps, s] }))
          setOpen(() => new Set([s.uid]))
        }}
        className="btn border-default-400 text-default-800 hover:bg-default-100 mt-3 min-h-11 w-full border border-dashed disabled:opacity-50 lg:min-h-0"
      >
        <Icon icon="plus" className="size-4" aria-hidden="true" />
        {t.addRound}
      </button>
      <p id="sfb-add-round-note" className="text-default-700 mt-1 text-xs tabular-nums">
        {blocker === 'MAX_ROUNDS'
          ? fmt(t.reasonMaxRounds, { max: L.maxSteps })
          : blocker === 'MAX_TOTAL'
            ? fmt(t.reasonMaxTotal, { d: formatDuration(L.maxTotalDelayMin, words) })
            : fmt(t.roundsLeft, { n: left, d: formatDuration(remainingDelayMin(draft), words) })}
      </p>
    </div>
  )
}
