'use client'

/**
 * ServiceJobPhotoSheet — ชีต "เริ่มงาน" / "ทำเสร็จแล้ว" ของร้านบริการ พร้อมรูปก่อน-หลัง + บันทึก (feature 00086 S-8/S-9)
 *
 * ต้นแบบ: service-tech-mock v13 `sheetHtml` type 'photo' · UX spec 00086-p3 T6 "แผ่น เริ่มงาน / ทำเสร็จแล้ว"
 *
 * 🛑 อัปโหลดทีละรูปผ่าน `uploadToStorage(file, { purpose: 'IMAGE' })` เท่านั้น (ตัวบีบรูปกลาง image-compress ·
 *    docs/conventions/upload-body-size-limit.md) — ห้าม fetch endpoint อัปโหลดเอง (เทส grep กันไว้)
 * 🛑 ยิง start/finish **หลังทุกไทล์อัปสำเร็จ** เท่านั้น — รูปค้าง/ล้ม = ปุ่มหลักกดไม่ได้ (สถานะงานต้องไม่เปลี่ยนโดยรูปไม่ครบ)
 * ไม่ใส่ `capture` — ให้เลือกจากคลังได้ (FR-009 "ถ่ายจากกล้อง/เลือกรูป" · มือถือมีตัวเลือกกล้องในเมนูอยู่แล้ว)
 * ด่านจริง (โหมดรูป · ผู้รับผิดชอบ · ไฟล์มีจริง) อยู่ที่ server — ที่นี่บอก/กันกดก่อนถึง server
 *
 * Base: src/components/safepay/service-close/ServiceCloseSheet.tsx (เปลือกชีต z-90 · หัว · ปุ่ม X · footer safe-area)
 *   ← theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 *   กริดรูป/ไทล์เพิ่มรูป ← theme/paces/Admin/TS/src/app/(admin)/form/fileuploads/page.tsx (Dropzone: image/*, ≤10, multiple)
 *   infobox ← theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (โทนกลาง bg-default-100)
 */

import { useEffect, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import {
  SERVICE_JOB_ERROR_MESSAGE,
  SERVICE_JOB_MAX_PHOTOS,
  SERVICE_JOB_NOTE_MAX,
  type ServiceJobPhotoMode,
} from '@/lib/service-job'
import { uploadToStorage } from '@/lib/upload-client'
import { cn } from '@/utils/helpers'

import { useSheetA11y } from './useSheetA11y'

export type ServiceJobPhotoPhase = 'START' | 'FINISH'

export interface ServiceJobPhotoSheetProps {
  open: boolean
  onClose: () => void
  phase: ServiceJobPhotoPhase
  orderToken: string
  orderLabel: string
  /** "บริการ · ลูกค้า" ใต้หัวชีต — กันกดผิดใบ · null = ไม่แสดง */
  summaryLine?: string | null
  /** Shop.serviceJobPhotoMode */
  photoMode: ServiceJobPhotoMode
  /** Shop.serviceJobPhotosBuyerVisible */
  buyerVisible: boolean
  /** สำเร็จ (รวมกรณีมีคนทำไปก่อน) — ผู้เรียกรีเฟรชข้อมูลของตัวเอง */
  onDone: () => void
}

export type ServiceJobPhotoTile = {
  key: string
  previewUrl: string
  file: File
  status: 'uploading' | 'done' | 'failed'
  progress: number
  fileId: string | null
}

const COPY = {
  START: {
    title: 'เริ่มงาน',
    icon: 'player-play',
    photoLabel: 'รูปก่อนทำ',
    noteLabel: 'บันทึกก่อนเริ่ม',
    placeholder: 'เช่น สภาพก่อนทำ จุดที่ลูกค้าแจ้ง',
    cta: 'เริ่มงาน',
    success: 'เริ่มงานแล้ว',
    already: 'งานนี้เริ่มไปแล้ว — ดูรูปของคนที่เริ่มก่อนได้ในการ์ดรูป',
    endpoint: 'start',
  },
  FINISH: {
    title: 'ทำเสร็จแล้ว',
    icon: 'check',
    photoLabel: 'รูปหลังทำ',
    noteLabel: 'ทำอะไรไปบ้าง',
    placeholder: 'เช่น สิ่งที่ทำไป ผลที่ได้',
    cta: 'บันทึกว่าทำเสร็จ',
    success: 'บันทึกว่าทำเสร็จแล้ว',
    already: 'งานนี้บันทึกว่าทำเสร็จไปแล้ว — ดูรูปของคนที่บันทึกก่อนได้ในการ์ดรูป',
    endpoint: 'finish',
  },
} as const

let tileSeq = 0

/**
 * ปุ่มหลักกดได้ไหม + คำบนปุ่ม — แยกเป็นฟังก์ชันบริสุทธิ์ให้เทสได้ตรง (docs/conventions/ui-boolean-needs-a-testable-home.md)
 * REQUIRED ∧ ไม่มีรูปสำเร็จ → ห้าม · มีรูปกำลังอัป/ล้มค้าง → ห้าม (ต้องลองใหม่หรือลบก่อน) · กำลังส่ง → ห้าม
 */
export function photoSheetSubmitState(input: {
  mode: ServiceJobPhotoMode
  tiles: readonly Pick<ServiceJobPhotoTile, 'status'>[]
  submitting: boolean
}): { disabled: boolean; needPhoto: boolean; uploading: boolean; failed: boolean } {
  const uploading = input.tiles.some((t) => t.status === 'uploading')
  const failed = input.tiles.some((t) => t.status === 'failed')
  const done = input.tiles.filter((t) => t.status === 'done').length
  const needPhoto = input.mode === 'REQUIRED' && done === 0
  return { disabled: input.submitting || uploading || failed || needPhoto, needPhoto, uploading, failed }
}

/**
 * อัปรูปหนึ่งใบ — ผ่านตัวบีบรูปกลางเสมอ (purpose IMAGE → โปรไฟล์ standard · memory upload-through-central-compressor)
 * แยกออกมาให้เทสยืนยันได้ว่าไม่มีทางอื่น (ไม่ส่ง compress 'off' · ไม่ fetch เอง)
 */
export function uploadServiceJobPhoto(
  file: File,
  opts: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
) {
  return uploadToStorage(file, { purpose: 'IMAGE', onProgress: opts.onProgress, signal: opts.signal })
}

/**
 * คำขอ start/finish — คืน null เมื่อยังส่งไม่ได้ (รูปค้าง/ล้ม · บังคับรูปแต่ยังไม่มี · กำลังส่ง)
 * ⇒ ไม่มีทางยิงเปลี่ยนสถานะงานโดยรูปยังอัปไม่ครบ (ผู้เรียก fetch เฉพาะเมื่อได้ค่ากลับมา)
 */
export function buildServiceJobStepRequest(input: {
  orderToken: string
  phase: ServiceJobPhotoPhase
  mode: ServiceJobPhotoMode
  tiles: readonly Pick<ServiceJobPhotoTile, 'status' | 'fileId'>[]
  note: string
  submitting: boolean
}): { url: string; init: RequestInit } | null {
  if (photoSheetSubmitState({ mode: input.mode, tiles: input.tiles, submitting: input.submitting }).disabled) return null
  const trimmed = input.note.trim()
  const photoFileIds = input.tiles.filter((t) => t.status === 'done' && t.fileId).map((t) => t.fileId as string)
  return {
    url: `/api/orders/${input.orderToken}/${COPY[input.phase].endpoint}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // โหมดไม่ใช้รูป: ไม่ส่งคีย์รูปเลย (server ตอบ PHOTOS_DISABLED ถ้าส่ง)
        ...(input.mode !== 'NONE' && photoFileIds.length > 0 ? { photoFileIds } : {}),
        ...(trimmed ? { note: trimmed } : {}),
      }),
    },
  }
}

export default function ServiceJobPhotoSheet({
  open,
  onClose,
  phase,
  orderToken,
  orderLabel,
  summaryLine = null,
  photoMode,
  buyerVisible,
  onDone,
}: ServiceJobPhotoSheetProps) {
  const c = COPY[phase]
  const photosOn = photoMode !== 'NONE'
  const [tiles, setTiles] = useState<ServiceJobPhotoTile[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** ล็อกกันกดซ้ำแบบ synchronous — state อัปเดตไม่ทันการแตะสองครั้งติดกัน */
  const submittingRef = useRef(false)
  const aborters = useRef(new Map<string, AbortController>())
  const tilesRef = useRef<ServiceJobPhotoTile[]>([])
  useEffect(() => {
    tilesRef.current = tiles
  }, [tiles])

  const dirty = tiles.length > 0 || note.trim() !== ''

  /** ทิ้งทุกอย่างของรอบนี้ — ยกเลิกอัปที่ค้าง + คืนหน่วยความจำรูปตัวอย่าง */
  function resetAll() {
    aborters.current.forEach((a) => a.abort())
    aborters.current.clear()
    tilesRef.current.forEach((t) => URL.revokeObjectURL(t.previewUrl))
    tilesRef.current = []
    setTiles([])
    setNote('')
  }

  // เปิดใหม่ทุกครั้ง = ชีตว่าง · ปิด/unmount = ยกเลิกอัปที่ค้าง
  useEffect(() => {
    if (!open) return
    submittingRef.current = false
    setSubmitting(false)
    return () => resetAll()
  }, [open])

  async function requestClose() {
    if (submittingRef.current) return
    if (dirty) {
      const ok = await pacesConfirm({
        icon: 'question',
        title: 'ทิ้งรูปและบันทึกนี้?',
        text: 'ยังไม่ได้บันทึก — ปิดแล้วต้องถ่ายใหม่',
        confirmButtonText: 'ทิ้ง',
        cancelButtonText: 'กลับไปแก้',
      })
      if (!ok) return
    }
    onClose()
  }

  const { panelRef, closeRef } = useSheetA11y(open, () => void requestClose())

  if (!open) return null

  const updateTile = (key: string, patch: Partial<ServiceJobPhotoTile>) =>
    setTiles((cur) => cur.map((t) => (t.key === key ? { ...t, ...patch } : t)))

  async function upload(key: string, file: File) {
    const ac = new AbortController()
    aborters.current.set(key, ac)
    updateTile(key, { status: 'uploading', progress: 0, fileId: null })
    try {
      const r = await uploadServiceJobPhoto(file, {
        signal: ac.signal,
        onProgress: (p) => updateTile(key, { progress: p }),
      })
      if (ac.signal.aborted) return
      updateTile(key, { status: 'done', progress: 100, fileId: r.fileId })
    } catch (e) {
      // ลบไทล์/ปิดชีตระหว่างอัป = ไม่ใช่ความล้มเหลวที่ต้องบอก
      if (ac.signal.aborted) return
      updateTile(key, { status: 'failed' })
      pacesToast.error(e instanceof Error && e.message ? e.message : 'อัปโหลดรูปไม่สำเร็จ — แตะ "ลองใหม่" บนรูปนั้น')
    } finally {
      if (aborters.current.get(key) === ac) aborters.current.delete(key)
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const room = SERVICE_JOB_MAX_PHOTOS - tilesRef.current.length
    const picked = Array.from(list).slice(0, Math.max(0, room))
    if (list.length > picked.length) pacesToast.info(`แนบได้ไม่เกิน ${SERVICE_JOB_MAX_PHOTOS} รูป`)
    const fresh: ServiceJobPhotoTile[] = picked.map((file) => ({
      key: `t${++tileSeq}`,
      previewUrl: URL.createObjectURL(file),
      file,
      status: 'uploading',
      progress: 0,
      fileId: null,
    }))
    tilesRef.current = [...tilesRef.current, ...fresh]
    setTiles(tilesRef.current)
    for (const t of fresh) void upload(t.key, t.file)
  }

  function removeTile(key: string) {
    aborters.current.get(key)?.abort()
    aborters.current.delete(key)
    const t = tilesRef.current.find((x) => x.key === key)
    if (t) URL.revokeObjectURL(t.previewUrl)
    tilesRef.current = tilesRef.current.filter((x) => x.key !== key)
    setTiles(tilesRef.current)
  }

  const state = photoSheetSubmitState({ mode: photoMode, tiles, submitting })

  async function submit() {
    if (submittingRef.current) return
    const req = buildServiceJobStepRequest({ orderToken, phase, mode: photoMode, tiles, note, submitting: false })
    if (!req) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const res = await fetch(req.url, req.init)
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        alreadyStarted?: boolean
        alreadyFinished?: boolean
      }
      if (!res.ok) {
        // ชีตค้างไว้ ไม่ทิ้งรูป — แก้ตามข้อความแล้วกดใหม่ได้
        pacesToast.error(
          json.message ?? SERVICE_JOB_ERROR_MESSAGE[json.error ?? ''] ?? 'บันทึกไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง',
        )
        return
      }
      if (json.alreadyStarted || json.alreadyFinished) pacesToast.info(c.already)
      else pacesToast.success(c.success)
      // สำเร็จแล้ว = รูปเป็นของงานแล้ว ปิดชีตโดยไม่ถามทิ้ง
      onDone()
      onClose()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const visibilityHint = buyerVisible && photosOn ? 'ลูกค้าเห็นรูปนี้' : 'เห็นเฉพาะในร้าน'
  const notifyText =
    'บันทึกเวลาและชื่อคุณลงประวัติงาน · แจ้งเจ้าของร้านและผู้ดูแล' +
    (phase === 'START' ? ' · แจ้งลูกค้าว่าเริ่มงานแล้ว (ถ้าเปิดส่งอัตโนมัติไว้)' : '') +
    // critique P1-7 — SERVICE_FINISHED ไม่มีสวิตช์ส่งอัตโนมัติของตัวเอง ("ลูกค้าเห็นรูป" คือตัวเปิด) เงื่อนไขที่เหลือจริงคือใบต้องผูกแชท
    (phase === 'FINISH' && buyerVisible && photosOn ? ' · ส่งลิงก์ดูรูปให้ลูกค้าในแชท (ถ้างานนี้มีแชทกับลูกค้า)' : '')
  const noteId = `job-photo-note-${phase}`
  const hintId = `job-photo-need-${phase}`
  const titleId = `job-photo-title-${phase}`

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        // มีรูป/ข้อความแล้ว คลิกฉากหลังไม่ปิด (กันนิ้วพลาดทำรูปหาย) · ปิดได้ทาง X / ยังไม่เริ่ม·ยังไม่บันทึก / Esc ที่ถามก่อน
        if (e.target === e.currentTarget && !submitting && !dirty) onClose()
      }}
    >
      <div ref={panelRef} className="card bg-card flex max-h-full w-full flex-col rounded-b-none sm:max-w-lg sm:rounded-lg">
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id={titleId} className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon={c.icon} className="text-primary shrink-0 text-lg" aria-hidden="true" />
            <span className="truncate">
              {c.title} · {orderLabel}
            </span>
          </h5>
          <button
            ref={closeRef}
            type="button"
            onClick={() => void requestClose()}
            disabled={submitting}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {summaryLine && <p className="text-default-700 mb-0 line-clamp-2 text-sm">{summaryLine}</p>}

          {photosOn ? (
            <section>
              <p className="text-default-800 mb-2 text-sm font-medium">
                {c.photoLabel}{' '}
                <span className="text-default-700 text-xs font-normal">
                  {photoMode === 'REQUIRED' ? 'อย่างน้อย 1 รูป' : 'ไม่บังคับ'} · {visibilityHint}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {tiles.map((t, i) => (
                  <div
                    key={t.key}
                    className="bg-default-100 relative aspect-square overflow-hidden rounded-lg"
                    aria-busy={t.status === 'uploading'}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- object URL ของไฟล์ในเครื่อง ไม่ผ่าน image optimizer */}
                    <img src={t.previewUrl} alt={`${c.photoLabel} ${i + 1}`} className="size-full object-cover" />
                    {t.status === 'uploading' && (
                      <div className="bg-dark/40 absolute inset-0 flex flex-col items-center justify-center gap-1 text-white">
                        <Icon icon="loader-2" className="animate-spin text-xl" aria-hidden="true" />
                        <span className="text-xs tabular-nums">{t.progress}%</span>
                      </div>
                    )}
                    {t.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => void upload(t.key, t.file)}
                        aria-label={`อัปโหลดรูปที่ ${i + 1} ใหม่`}
                        className="bg-danger/15 text-danger-ink absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium"
                      >
                        <Icon icon="alert-triangle" className="text-xl" aria-hidden="true" />
                        ลองใหม่
                      </button>
                    )}
                    {/* เห็นเล็ก แตะ 44 — วงกลม 28px อยู่กลางพื้นที่แตะ size-11 (DESIGN §Do) · bg-dark/60 บนรูป = Photo-Scrim Exception */}
                    <button
                      type="button"
                      onClick={() => removeTile(t.key)}
                      aria-label={`ลบรูปที่ ${i + 1}`}
                      className="absolute end-0 top-0 flex size-11 items-center justify-center"
                    >
                      <span className="bg-dark/60 flex size-7 items-center justify-center rounded-full text-white">
                        <Icon icon="x" className="text-sm" aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                ))}
                {tiles.length < SERVICE_JOB_MAX_PHOTOS && (
                  <label className="border-default-300 text-default-700 hover:bg-default-50 flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs">
                    <Icon icon="camera-plus" className="text-xl" aria-hidden="true" />
                    ถ่าย/เลือกรูป
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        addFiles(e.target.files)
                        // เลือกไฟล์เดิมซ้ำได้ (ลบแล้วเลือกใหม่)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
              {tiles.length >= SERVICE_JOB_MAX_PHOTOS && (
                <p className="text-default-700 mb-0 mt-2 text-xs">ครบ {SERVICE_JOB_MAX_PHOTOS} รูปแล้ว</p>
              )}
            </section>
          ) : (
            <p className="text-default-700 bg-default-100 mb-0 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs">
              <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span className="min-w-0">ร้านตั้งค่า &ldquo;ไม่ใช้รูป&rdquo; · บันทึกเป็นข้อความได้</span>
            </p>
          )}

          <section>
            <label htmlFor={noteId} className="text-default-800 mb-2 block text-sm font-medium">
              {c.noteLabel} <span className="text-default-700 text-xs font-normal">(ไม่บังคับ)</span>
            </label>
            <textarea
              id={noteId}
              rows={3}
              maxLength={SERVICE_JOB_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={c.placeholder}
              className="form-input"
            />
            {note.length > SERVICE_JOB_NOTE_MAX - 100 && (
              <p className="text-default-700 mb-0 mt-1 text-end text-xs tabular-nums" aria-live="polite">
                {note.length}/{SERVICE_JOB_NOTE_MAX}
              </p>
            )}
          </section>

          <p className="text-default-700 bg-default-100 mb-0 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs">
            <Icon icon="bell" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span className="min-w-0">{notifyText}</span>
          </p>
        </div>

        <div className="border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out HR7: safe-area ไม่มี token ในธีม Paces — แถบปุ่มยึดขอบจอจึงต้องรับ inset เอง (เท่า ServiceCloseSheet) */}
          {state.needPhoto && (
            <p id={hintId} className="text-default-700 mb-2 text-center text-xs">
              ถ่ายรูปอย่างน้อย 1 รูปก่อน
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={submitting}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 disabled:opacity-60"
            >
              {/* critique P2 — ล้อ "ยังไม่ปิด" ของชีตปิดงาน */}
              {phase === 'START' ? 'ยังไม่เริ่ม' : 'ยังไม่บันทึก'}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={state.disabled}
              aria-describedby={state.needPhoto ? hintId : undefined}
              className="btn bg-primary hover:bg-primary-hover min-h-11 flex-2 items-center justify-center gap-2 text-white disabled:opacity-60"
            >
              <Icon
                icon={submitting || state.uploading ? 'loader-2' : 'check'}
                className={cn('text-base', (submitting || state.uploading) && 'animate-spin')}
                aria-hidden="true"
              />
              {state.uploading ? 'กำลังอัปโหลดรูป…' : c.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
