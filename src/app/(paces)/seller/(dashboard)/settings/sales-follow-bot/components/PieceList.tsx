'use client'

/**
 * PieceList — ชิ้นในรอบเดียว (ข้อความ · รูป 1–5 รูป · ข้อความสำเร็จรูป) เรียงตั้ง ลากหรือเลื่อนขึ้น/ลงได้ + ปุ่มเพิ่ม 3 แบบ (UX §19 · mockup ส่วน 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/fileuploads/components/Dropzone.tsx (ท่าเลือก/อัปโหลดรูป — ส่งผ่าน @/lib/upload-client ไม่ส่งไฟล์ผ่าน body · Q7)
 *   + src/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/TemplateBuilderClient.tsx (ท่า @hello-pangea/dnd)
 *   + settings/auto-notify/components/TemplateEditor.tsx (ตัวแก้ข้อความชิป → VarChipEditor)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (ชิป/ป้าย)
 *
 * 🛑 รูปอัปโหลด purpose 'CHAT' และ **ไม่ส่ง conversationId** — route commit ลงทะเบียน MediaAsset ให้ร้าน (ด่านเจ้าของรูปฝั่ง server ผ่าน)
 */
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesToast } from '@/lib/paces-toast'
import { ALLOWED_VARIABLES, SALES_FOLLOW_LIMITS as L, type PartKind } from '@/lib/sales-follow-bot/constants'
import type { BotIssue } from '@/lib/sales-follow-bot/schemas'
import { addPartBlocker, appendFileIds, emptyPart, moveBlocker, moveItem, type Draft, type DraftPart, type DraftStep, type QuickMessageLite } from '@/lib/sales-follow-bot/ui'
import { uploadFileId } from '@/lib/upload-client'
import VarChipEditor from '../../../_shared/VarChipEditor'
import ActionMenu from './ActionMenu'
import { issueText } from './issue-text'
import QuickMessagePicker from './QuickMessagePicker'
import { FileThumb } from './sfb-ui'

export default function PieceList({
  step,
  stepIndex,
  quick,
  quickList,
  issues,
  onChange,
  onDraft,
}: {
  step: DraftStep
  stepIndex: number
  quick: ReadonlyMap<string, QuickMessageLite>
  quickList: readonly QuickMessageLite[]
  /** issue ของรอบนี้ที่ผูกกับชิ้น (partIndex มีค่า) */
  issues: readonly BotIssue[]
  onChange: (step: DraftStep) => void
  /** แก้ร่างทั้งก้อนแบบ functional updater — ผลอัปโหลดที่มาหลัง await ต้องต่อบนร่างล่าสุด ไม่ใช่ step ที่ปิดค่าไว้ตอนเลือกไฟล์ */
  onDraft: (fn: (d: Draft) => Draft) => void
}) {
  const t = useT().salesFollowBot
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const parts = step.parts
  const blocker = addPartBlocker(step)
  const variables = ALLOWED_VARIABLES.map((name) => ({ name, sample: t.previewSampleName }))

  const setParts = (next: DraftPart[]) => onChange({ ...step, parts: next })
  const update = (uid: string, patch: Partial<DraftPart>) => setParts(parts.map((p) => (p.uid === uid ? { ...p, ...patch } : p)))
  const add = (kind: PartKind) => {
    if (blocker) return
    const part = emptyPart(kind)
    setParts([...parts, part])
    if (kind === 'QUICK_MESSAGE') setPickerFor(part.uid)
  }
  const move = (from: number, to: number) => setParts(moveItem(parts, from, to))
  const onDragEnd = (r: DropResult) => {
    if (r.destination && r.destination.index !== r.source.index) move(r.source.index, r.destination.index)
  }

  const addFiles = async (part: DraftPart, files: File[]) => {
    const room = L.maxImagesPerPart - part.fileIds.length
    const picked = files.slice(0, Math.max(0, room))
    if (picked.length === 0) return
    setUploading((u) => ({ ...u, [part.uid]: (u[part.uid] ?? 0) + picked.length }))
    const stepUid = step.uid
    for (const f of picked) {
      try {
        const id = await uploadFileId(f, 'CHAT')
        onDraft((d) => appendFileIds(d, stepUid, part.uid, [id]))
      } catch {
        // ข้อความจาก upload-client เป็นไทยล้วน — ใช้คำของ dictionary เพื่อให้ตามภาษาที่เลือก
        pacesToast.error(t.uploadFailed)
      }
      setUploading((u) => ({ ...u, [part.uid]: Math.max(0, (u[part.uid] ?? 0) - 1) }))
    }
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`round-${step.uid}`}>
          {(drop) => (
            <ol ref={drop.innerRef} {...drop.droppableProps} className="mt-2.5 flex flex-col gap-2">
              {parts.map((part, j) => {
                const mb = moveBlocker(j, parts.length)
                const errs = issues.filter((i) => i.partIndex === j)
                const errId = `sfb-part-${stepIndex}-${j}-err`
                const gone = part.kind === 'QUICK_MESSAGE' && part.quickMessageId !== '' && !quick.has(part.quickMessageId)
                const qm = part.kind === 'QUICK_MESSAGE' ? quick.get(part.quickMessageId) : undefined
                return (
                  <Draggable key={part.uid} draggableId={part.uid} index={j}>
                    {(drag, snap) => (
                      <li ref={drag.innerRef} {...drag.draggableProps} className={`flex items-start gap-1 ${snap.isDragging ? 'bg-card rounded-lg shadow-lg' : ''}`}>
                        <span {...drag.dragHandleProps} aria-label={t.dragAria} title={t.dragAria} className="text-default-700 flex min-h-11 w-6 shrink-0 cursor-grab items-center justify-center text-base">
                          <Icon icon="grip-vertical" aria-hidden="true" />
                        </span>
                        <div id={`sfb-part-${stepIndex}-${j}`} className="min-w-0 flex-1">
                          {part.kind === 'TEXT' && (
                            <VarChipEditor
                              key={part.uid}
                              id={`sfb-editor-${stepIndex}-${j}`}
                              initialValue={part.text}
                              variables={variables}
                              max={L.maxText}
                              ariaLabel={fmt(t.editorAria, { r: stepIndex + 1, p: j + 1 })}
                              describedBy={errs.length ? errId : undefined}
                              invalid={errs.length > 0}
                              labels={{ emoji: t.emojiAria, insertVar: (name) => fmt(t.insertVarAria, { name: `{${name}}` }), varMenu: t.varMenuAria }}
                              onChange={(text) => update(part.uid, { text })}
                            />
                          )}

                          {part.kind === 'IMAGES' && (
                            <div className={`flex flex-col gap-1.5 rounded-lg border p-2.5 ${errs.length ? 'border-danger' : 'border-default-300'}`}>
                              <div className="flex flex-wrap gap-2">
                                {part.fileIds.map((id, k) => (
                                  <span key={id} className="relative">
                                    <FileThumb fileId={id} alt={fmt(t.imageAlt, { n: k + 1 })} className="bg-default-200 size-16 rounded-lg object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => update(part.uid, { fileIds: part.fileIds.filter((x) => x !== id) })}
                                      aria-label={fmt(t.removeImageAria, { n: k + 1 })}
                                      className="absolute -end-3 -top-3 flex size-11 items-center justify-center"
                                    >
                                      <span className="bg-dark flex size-5 items-center justify-center rounded-full text-white">
                                        <Icon icon="x" className="size-3" aria-hidden="true" />
                                      </span>
                                    </button>
                                  </span>
                                ))}
                                {Array.from({ length: uploading[part.uid] ?? 0 }).map((_, k) => (
                                  <span key={`up${k}`} role="status" aria-label={t.uploading} className="bg-default-100 text-default-700 flex size-16 items-center justify-center rounded-lg">
                                    <Icon icon="loader-2" className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                  </span>
                                ))}
                                {part.fileIds.length + (uploading[part.uid] ?? 0) < L.maxImagesPerPart && (
                                  <label className="border-default-400 text-default-700 focus-within:ring-primary flex size-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed focus-within:ring-2">
                                    <Icon icon="plus" className="size-5" aria-hidden="true" />
                                    <span className="text-2xs">{t.addImage}</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      className="sr-only"
                                      onChange={(e) => {
                                        const files = Array.from(e.target.files ?? [])
                                        e.target.value = ''
                                        void addFiles(part, files)
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                              <span className="text-default-700 text-xs tabular-nums">{fmt(t.imagesCount, { n: part.fileIds.length, max: L.maxImagesPerPart })}</span>
                            </div>
                          )}

                          {part.kind === 'QUICK_MESSAGE' && (
                            <>
                              <div className={`bg-default-100 flex flex-wrap items-center gap-2.5 rounded-lg border p-2.5 ${errs.length ? 'border-danger' : 'border-default-300'}`}>
                                <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                                  <Icon icon="bolt" aria-hidden="true" />
                                </span>
                                <div className="min-w-36 flex-1">
                                  {qm ? (
                                    <>
                                      <p className="text-default-900 text-sm font-medium">{qm.title}</p>
                                      <p className="text-default-700 line-clamp-2 text-xs">{qm.bodyPreview}</p>
                                    </>
                                  ) : (
                                    <p className="text-default-700 text-sm">{gone ? t.quickGone : t.quickChoose}</p>
                                  )}
                                </div>
                                {qm?.thumbUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={qm.thumbUrl} alt="" className="bg-default-200 size-10 shrink-0 rounded-lg object-cover" />
                                )}
                                <button
                                  type="button"
                                  aria-expanded={pickerFor === part.uid}
                                  onClick={() => setPickerFor(pickerFor === part.uid ? null : part.uid)}
                                  className="btn btn-sm border-default-300 text-default-800 bg-card min-h-11 border lg:min-h-8"
                                >
                                  {qm || gone ? t.quickChange : t.quickChoose}
                                </button>
                              </div>
                              {pickerFor === part.uid && (
                                <QuickMessagePicker
                                  items={quickList}
                                  selectedId={part.quickMessageId}
                                  onPick={(id) => {
                                    update(part.uid, { quickMessageId: id })
                                    setPickerFor(null)
                                  }}
                                  onClose={() => setPickerFor(null)}
                                />
                              )}
                            </>
                          )}

                          {errs.length > 0 && (
                            <ul id={errId} role="alert" className="text-danger-ink mt-1.5 space-y-1 text-xs">
                              {errs.map((e, k) => (
                                <li key={k} className="flex items-start gap-1">
                                  <Icon icon="alert-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                  {issueText(e, t)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <ActionMenu
                          ariaLabel={fmt(t.pieceMenuAria, { n: j + 1 })}
                          items={[
                            { key: 'up', label: t.moveUp, icon: 'arrow-up', onSelect: () => move(j, j - 1), disabledReason: mb.up ? t.reasonFirstPiece : null },
                            { key: 'down', label: t.moveDown, icon: 'arrow-down', onSelect: () => move(j, j + 1), disabledReason: mb.down ? t.reasonLastPiece : null },
                            { key: 'del', label: t.remove, icon: 'trash', danger: true, onSelect: () => setParts(parts.filter((p) => p.uid !== part.uid)), disabledReason: mb.remove ? t.reasonOnlyPiece : null },
                          ]}
                        />
                      </li>
                    )}
                  </Draggable>
                )
              })}
              {drop.placeholder}
            </ol>
          )}
        </Droppable>
      </DragDropContext>

      <div className="mt-2.5 flex flex-wrap gap-2 ps-7">
        {(
          [
            ['TEXT', t.addText],
            ['IMAGES', t.addImages],
            ['QUICK_MESSAGE', t.addQuick],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            disabled={!!blocker}
            aria-describedby={`sfb-round-${stepIndex}-parts-note`}
            onClick={() => add(kind)}
            className="btn btn-sm border-default-300 text-default-800 min-h-11 border disabled:opacity-50 lg:min-h-8"
          >
            <Icon icon="plus" className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p id={`sfb-round-${stepIndex}-parts-note`} className="text-default-700 mt-1 ps-7 text-xs">
        {blocker ? fmt(t.piecesFull, { max: L.maxParts }) : fmt(t.piecesLeft, { n: L.maxParts - parts.length, max: L.maxParts })}
      </p>
    </>
  )
}
