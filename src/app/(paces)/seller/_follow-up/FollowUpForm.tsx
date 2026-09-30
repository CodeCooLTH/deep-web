'use client'

/**
 * FollowUpForm — ฟอร์มสร้าง/แก้ "รายการติดตาม" (sheet มือถือ · modal กลาง ≥lg) 00066 UX พื้นผิว a
 *
 * Base:
 *  - src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanelSheet.tsx (เปลือก overlay React-controlled:
 *    z-80, scrim, grip, useLockBodyScroll, ESC) ← Base ของมัน: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx + ui/modals/page.tsx
 *  - theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTypes.tsx (form-input / type=time / form-label)
 *  - theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (form-select — native ไม่ใช่ hs-dropdown)
 *
 * ตัดสินใจที่ควรรู้:
 *  - ตรวจฟอร์มด้วยฟังก์ชันบริสุทธิ์ `validateForm` (src/lib/follow-up-view.ts) แทน Yup — กฎวัน/เวลาชุดเดียวกับที่ "เลื่อน → เลือกเอง"
 *    ของการ์ดใช้ และมีเทส (ฟอร์มมีแค่ 6 ช่อง ไม่คุ้มลาก resolver เข้ามา)
 *  - ค่าตั้งต้น = พรุ่งนี้ 09:00 เวลาไทย → จด = พิมพ์หัวข้อ + บันทึก
 *  - รายการที่ปิดแล้ว: ล็อกชนิด/วัน/เวลา/ผู้รับ (PATCH ปฏิเสธ) + บอกทางออก "เปิดกลับก่อน"
 *  - ส่ง {date,time|null} เวลาไทย ไม่ส่ง timestamp (TD-FU-6) · ผู้รับผิดชอบว่าง = ไม่ส่ง (server ใช้ผู้สร้าง / คงเดิม — ห้ามส่ง null)
 *  - ไม่ auto-focus บนมือถือ (คีย์บอร์ดดันชีต)
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatDateTH } from '@/lib/format-date'
import { FOLLOW_UP_TYPES, NOTE_MAX, TITLE_MAX } from '@/lib/follow-up-constants'
import {
  buildPayload,
  defaultFormValues,
  dueDateBounds,
  pastDueWarning,
  saveErrorKey,
  typeLabel,
  validateForm,
  valuesFromItem,
  type FormErrors,
  type FormValues,
} from '@/lib/follow-up-view'
import type { FollowUpDto, PersonDto } from '@/services/customer-follow-up.service'
import { callFollowUpApi } from './follow-up-client'
import BeDateHint from '@/components/safepay/BeDateHint'

export interface FollowUpFormProps {
  /** สร้างใหม่: ห้องที่จะผูก · แก้ไข: ส่ง item แทน */
  conversationId?: string
  item?: FollowUpDto
  /** null = ร้าน PERSONAL → ซ่อนช่องผู้รับผิดชอบ (AC-ACT-07) */
  assignees: PersonDto[] | null
  /** toast ตามพื้นผิว: แผงในห้องแชท = bottom-right (HR9) */
  inChat?: boolean
  onClose: () => void
  onSaved: (item: FollowUpDto, mode: 'create' | 'edit') => void
}

export default function FollowUpForm({ conversationId, item, assignees, inChat = false, onClose, onSaved }: FollowUpFormProps) {
  const t = useT().followUps
  const uid = useId()
  const mode: 'create' | 'edit' = item ? 'edit' : 'create'
  const closed = item?.status === 'DONE'
  const now = new Date()
  const bounds = dueDateBounds(now)
  // ข้อความ error ที่มีช่วงวันที่ต้องเติมค่าจริง (ไม่ใช่ template ดิบ)
  const rangeText = fmt(t.errDateRange, { from: formatDateTH(bounds.min), to: formatDateTH(bounds.max) })
  useLockBodyScroll(true)

  const [v, setV] = useState<FormValues>(() => (item ? valuesFromItem(item) : defaultFormValues(new Date())))
  const [errors, setErrors] = useState<FormErrors>({})
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }))

  // ESC ปิด — capture ที่ window เพื่อไม่ให้ sheet ข้างหลัง (CustomerPanelSheet) ปิดตามด้วยคีย์เดียวกัน
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Tab') {
        // focus trap: วนอยู่ในกล่อง (aria-modal ไม่พอ — Tab ยังหลุดไปหน้าข้างหลังได้)
        const els = Array.from(
          formRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]') ?? [],
        ).filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0)
        if (els.length === 0) return
        const first = els[0]!
        const last = els[els.length - 1]!
        const active = document.activeElement
        if (!formRef.current?.contains(active) || (e.shiftKey && active === first) || (!e.shiftKey && active === last)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // ย้ายโฟกัสเข้ากล่องทุกอุปกรณ์: เดสก์ท็อป = ช่องหัวข้อ · มือถือ = หัวกล่อง (ไม่เด้งคีย์บอร์ด)
  // ปิดแล้วคืนโฟกัสปุ่มที่เปิด
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    if (window.matchMedia('(min-width: 1024px)').matches) titleRef.current?.focus()
    else headingRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const errs = validateForm(v, closed, new Date())
    setErrors(errs)
    setSaveErr(null)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    const payload = buildPayload(v, mode, closed)
    const r =
      mode === 'edit'
        ? await callFollowUpApi(`/api/follow-ups/${item!.id}`, 'PATCH', payload)
        : await callFollowUpApi(`/api/chat/conversations/${conversationId}/follow-ups`, 'POST', payload)
    setSaving(false)
    if (!r.ok || !r.item) {
      const key = saveErrorKey(r.ok ? undefined : r.code ?? (r.status === 404 ? 'NOT_FOUND' : undefined))
      setSaveErr(key === 'errDateRange' ? rangeText : t[key])
      return
    }
    const notify = inChat ? pacesToast.chat : pacesToast
    notify.success(mode === 'edit' ? t.toastUpdated : t.toastCreated)
    onSaved(r.item, mode)
  }

  const id = (n: string) => `${uid}-${n}`
  const errId = (n: keyof FormErrors) => (errors[n] ? id(`${n}-err`) : undefined)
  const emptyAssigneeLabel = mode === 'create' ? t.assigneeMe : t.filterUnassigned
  const titleLen = Array.from(v.title).length
  const noteLen = Array.from(v.note).length

  return createPortal(
    // HR7: z-80 = viewport overlay lock (precedent CustomerPanelSheet.tsx / OrderQrSheet.tsx)
    <div
      className="fixed inset-0 z-80 flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'edit' ? t.formTitleEdit : t.formTitleNew}
    >
      <button type="button" aria-label={t.cancel} onClick={onClose} className="absolute inset-0 bg-default-900/40 backdrop-blur-xs" />

      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        className="relative max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-card pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 shadow-lg lg:max-w-md lg:rounded-2xl lg:pb-5 lg:pt-5" // HR7 carve-out: dvh + safe-area ไม่มี token ใน Paces — precedent CustomerPanelSheet.tsx
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-default-300 lg:hidden" />

        <div className="mb-3 flex items-center justify-between px-4">
          <h3 ref={headingRef} tabIndex={-1} className="text-default-900 mb-0 text-base font-bold outline-none">{mode === 'edit' ? t.formTitleEdit : t.formTitleNew}</h3>
          <button type="button" onClick={onClose} aria-label={t.cancel} className="btn btn-icon text-default-700 hover:bg-default-100">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="space-y-4 px-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={id('title')} className="form-label mb-0">
                {t.fieldTitle} <span aria-hidden="true">*</span>
              </label>
              <span className={`text-xs ${titleLen > TITLE_MAX ? 'text-danger-ink' : 'text-default-700'}`}>
                {titleLen}/{TITLE_MAX}
              </span>
            </div>
            <input
              ref={titleRef}
              id={id('title')}
              type="text"
              className={`form-input ${errors.title ? 'is-invalid' : ''}`}
              placeholder={t.fieldTitlePh}
              value={v.title}
              aria-invalid={!!errors.title}
              aria-describedby={errId('title')}
              onChange={(e) => set('title', e.target.value)}
            />
            {errors.title && (
              <p id={id('title-err')} role="alert" className="text-danger-ink mb-0 mt-1 text-xs">
                {t[errors.title]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={id('type')} className="form-label mb-1">
              {t.fieldType}
            </label>
            <select
              id={id('type')}
              className="form-select"
              value={v.type}
              disabled={closed}
              onChange={(e) => set('type', e.target.value as FormValues['type'])}
            >
              {FOLLOW_UP_TYPES.map((k) => (
                <option key={k} value={k}>
                  {typeLabel(t, k)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={id('date')} className="form-label mb-1">
                {t.fieldDate} <span aria-hidden="true">*</span>
              </label>
              <input
                id={id('date')}
                type="date"
                className={`form-input ${errors.date ? 'is-invalid' : ''}`}
                value={v.date}
                min={bounds.min}
                max={bounds.max}
                disabled={closed}
                aria-invalid={!!errors.date}
                aria-describedby={[errId('date'), id('date-be')].filter(Boolean).join(' ')}
                onChange={(e) => set('date', e.target.value)}
              />
              <BeDateHint id={id('date-be')} value={v.date} />
              {errors.date && (
                <p id={id('date-err')} role="alert" className="text-danger-ink mb-0 mt-1 text-xs">
                  {errors.date === 'errDateRange' ? rangeText : t[errors.date]}
                </p>
              )}
              {mode === 'create' && !errors.date && pastDueWarning(v, now) && (
                <p id={id('date-warn')} role="status" className="text-warning-ink mb-0 mt-1 flex items-center gap-1 text-xs">
                  <Icon icon="clock-exclamation" className="shrink-0 text-sm" />
                  {t.warnPastDue}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={id('time')} className="form-label mb-1">
                {t.fieldTime} <span aria-hidden="true">*</span>
              </label>
              <input
                id={id('time')}
                type="time"
                className={`form-input ${errors.time ? 'is-invalid' : ''}`}
                value={v.time}
                disabled={closed || v.allDay}
                aria-invalid={!!errors.time}
                aria-describedby={errId('time')}
                onChange={(e) => set('time', e.target.value)}
              />
              {errors.time && (
                <p id={id('time-err')} role="alert" className="text-danger-ink mb-0 mt-1 text-xs">
                  {t[errors.time]}
                </p>
              )}
            </div>
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={v.allDay}
              disabled={closed}
              onChange={(e) => set('allDay', e.target.checked)}
            />
            {t.fieldAllDay}
          </label>

          {assignees !== null && (
            <div>
              <label htmlFor={id('assignee')} className="form-label mb-1">
                {t.fieldAssignee}
              </label>
              <select
                id={id('assignee')}
                className="form-select"
                value={v.assigneeUserId}
                disabled={closed}
                onChange={(e) => set('assigneeUserId', e.target.value)}
              >
                {v.assigneeUserId === '' && <option value="">{emptyAssigneeLabel}</option>}
                {assignees.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={id('note')} className="form-label mb-0">
                {t.fieldNote}
              </label>
              <span className={`text-xs ${noteLen > NOTE_MAX ? 'text-danger-ink' : 'text-default-700'}`}>
                {noteLen}/{NOTE_MAX}
              </span>
            </div>
            <textarea
              id={id('note')}
              rows={3}
              className={`form-textarea ${errors.note ? 'is-invalid' : ''}`}
              value={v.note}
              aria-invalid={!!errors.note}
              aria-describedby={errors.note ? id('note-err') : id('note-hint')}
              onChange={(e) => set('note', e.target.value)}
            />
            {errors.note ? (
              <p id={id('note-err')} role="alert" className="text-danger-ink mb-0 mt-1 text-xs">
                {t[errors.note]}
              </p>
            ) : (
              <p id={id('note-hint')} className="text-default-700 mb-0 mt-1 text-xs">
                {t.noteHint}
              </p>
            )}
          </div>

          {closed && <p className="text-default-700 mb-0 text-xs">{t.closedEditHint}</p>}
          {saveErr && (
            <p role="alert" className="text-danger-ink mb-0 text-sm">
              {saveErr}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2 px-4">
          <button type="button" onClick={onClose} className="btn min-h-11 border border-default-300 text-default-800 hover:bg-default-100 lg:min-h-0">
            {t.cancel}
          </button>
          <button type="submit" disabled={saving} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white disabled:opacity-60 lg:min-h-0">
            {t.save}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
