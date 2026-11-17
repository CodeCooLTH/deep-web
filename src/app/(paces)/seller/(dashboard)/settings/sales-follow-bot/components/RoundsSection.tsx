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
import { DragDropContext, Draggable, Droppable, type DropResult, type ResponderProvided } from '@hello-pangea/dnd'
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
import { useDragAnnounce } from './drag-announce'
import PieceList from './PieceList'
import SfbSelect from './SfbSelect'
import { FileThumb, useDurationWords } from './sfb-ui'

// ราง timeline: after:top-8 = ต่อจากขอบล่างวง (size-8) ลงไปสุดแถว · border-default-500 ≥3:1 บนการ์ด (วัดใน browser)
const RAIL = 'relative after:absolute after:start-1/2 after:top-8 after:bottom-0 after:w-px after:border-e after:border-dashed after:border-default-500'
const MARK = 'relative z-10 flex size-8 items-center justify-center rounded-full'

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
  const total = draft.steps.length
  const announce = useDragAnnounce(t, total)
  const onDragEnd = (r: DropResult, p: ResponderProvided) => {
    announce.end(r, p)
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

      <DragDropContext onBeforeCapture={onBeforeCapture} onDragStart={announce.start} onDragUpdate={announce.update} onDragEnd={onDragEnd} dragHandleUsageInstructions={t.dragUsage}>
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
                        <div id={`sfb-step-${i}`} className="flex md:gap-x-3">
                          {/* ราง (≥md): เส้นประเป็น ::after ของคอลัมน์ ท่าเดียวกับธีม timeline — ต่อเนื่องข้ามแถวเพราะคอลัมน์สูงเท่าแถว · <md ซ่อนรางเอาความกว้างคืนให้ตัวแก้ข้อความ */}
                          <div className={`${RAIL} hidden w-8 shrink-0 md:block`}>
                            <span className={`${MARK} ${ad ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-700'}`}>
                              <Icon icon="clock" className="text-base" aria-hidden="true" />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 pb-3">
                            <div className={`flex min-h-8 flex-wrap items-center gap-1.5 text-sm ${ad ? 'text-warning-ink' : 'text-default-800'}`}>
                              <span className="inline-flex items-center gap-1.5">
                                <Icon icon="clock" className="text-base md:hidden" aria-hidden="true" />
                                {i === 0 ? t.waitFirst : t.waitNext}
                              </span>
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
                        <div className="flex md:gap-x-3">
                          <div className={`${RAIL} hidden w-8 shrink-0 md:block ${isLast ? 'after:hidden' : ''}`}>
                            <span className={`${MARK} bg-primary/15 text-primary-ink text-sm font-semibold tabular-nums`}>{i + 1}</span>
                          </div>
                          <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-3'}`}>
                            <div className={`bg-card relative rounded-lg border p-2 ${isOpen ? 'border-primary' : 'border-default-300 hover:border-default-400'}`}>
                              <div className="flex items-center gap-1">
                                <span {...drag.dragHandleProps} aria-label={t.dragAria} title={t.dragAria} className="text-default-700 flex size-11 shrink-0 cursor-grab items-center justify-center text-base lg:size-9">
                                  <Icon icon="grip-vertical" aria-hidden="true" />
                                </span>
                                {/* ปุ่มจริงสำหรับพับ/กาง — ลาก/ลบเป็นพี่น้อง ไม่ซ้อนปุ่มในปุ่ม */}
                                <button type="button" onClick={() => toggle(step.uid)} aria-expanded={isOpen} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-start lg:min-h-9">
                                  <span className="bg-primary/15 text-primary-ink flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums md:hidden" aria-hidden="true">{i + 1}</span>
                                  <span className="text-default-900 font-medium whitespace-nowrap">{fmt(t.roundTitle, { n: i + 1 })}</span>
                                  {isOpen ? (
                                    <span className="text-default-700 text-xs tabular-nums">{fmt(t.roundPieceCount, { n: step.parts.length, max: L.maxParts })}</span>
                                  ) : (
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                      {firstImage && firstImage.kind === 'IMAGES' && <FileThumb fileId={firstImage.fileIds[0]} alt="" className="bg-default-200 size-8 shrink-0 rounded object-cover" />}
                                      <span className="text-default-700 min-w-0 truncate text-sm">{preview ? withChips(preview, t.varName) : summary}</span>
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  aria-label={fmt(t.roundRemoveAria, { n: i + 1 })}
                                  aria-disabled={mb.remove ? true : undefined}
                                  aria-describedby={mb.remove ? `sfb-step-${i}-del-why` : undefined}
                                  onClick={() => {
                                    if (mb.remove) return
                                    onChange((d) => ({ ...d, steps: d.steps.filter((s) => s.uid !== step.uid) }))
                                  }}
                                  className={`btn btn-icon text-danger-ink hover:bg-default-100 size-11 shrink-0 lg:size-9 ${mb.remove ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                  <Icon icon="trash" className="size-5" aria-hidden="true" />
                                </button>
                              </div>
                              {mb.remove && (
                                <p id={`sfb-step-${i}-del-why`} className="text-default-700 mt-1 text-xs">
                                  {t.reasonOnlyRound}
                                </p>
                              )}

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

      {/* ความจุเป็นป้ายในปุ่มเพิ่มรอบ (ผู้ใช้ 2026-11-17: บรรทัดข้อความเล็กใต้ปุ่มไม่เข้าธีม) */}
      <button
        type="button"
        disabled={!!blocker}
        aria-describedby="sfb-add-round-note"
        onClick={() => {
          const s = { ...emptyStep(), value: '1', unit: 'HOUR' as const }
          onChange((d) => ({ ...d, steps: [...d.steps, s] }))
          setOpen(() => new Set([s.uid]))
        }}
        className="btn border-default-400 text-default-800 hover:bg-default-100 mt-3 min-h-11 w-full flex-wrap justify-between gap-2 border border-dashed disabled:opacity-60 lg:min-h-0"
      >
        <span className="flex items-center gap-1.5">
          <Icon icon="plus" className="size-4" aria-hidden="true" />
          {t.addRound}
        </span>
        <span id="sfb-add-round-note" className="flex flex-wrap items-center gap-1.5 text-xs font-normal tabular-nums">
          {blocker ? (
            <span className="badge bg-warning/15 text-warning-ink">
              {blocker === 'MAX_ROUNDS' ? fmt(t.reasonMaxRounds, { max: L.maxSteps }) : fmt(t.reasonMaxTotal, { d: formatDuration(L.maxTotalDelayMin, words) })}
            </span>
          ) : (
            <>
              <span className="badge bg-default-100 text-default-800">{fmt(t.roundsLeftCount, { n: left })}</span>
              <span className="badge bg-default-100 text-default-800 gap-1">
                <Icon icon="clock" className="size-3.5" aria-hidden="true" />
                {fmt(t.timeLeft, { d: formatDuration(remainingDelayMin(draft), words) })}
              </span>
            </>
          )}
        </span>
      </button>
    </div>
  )
}
