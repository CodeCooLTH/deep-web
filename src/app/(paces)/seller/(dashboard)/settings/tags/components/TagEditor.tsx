'use client'

/**
 * TagEditor — ตัวแก้แท็ก inline (เพิ่ม / แก้ / ตั้งค่าแท็กที่ยังไม่ตั้ง) ฟอร์ม RHF + Yup
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (form-input + form-label)
 *   + .../form/elements/components/InputGroup.tsx (input-group Input + Button สำหรับ "เพิ่มคำ")
 *   + .../form/elements/components/ChecksRadioSwitches.tsx (form-switch ผูก label — ท่าเดียวกับ AutoNotifyRow)
 *   + .../ui/list-group/page.tsx (ul divide-y สำหรับแถวคำ)
 *   + .../plugins/sweet-alerts/components/SweetAlerts.tsx (confirm ลบ/เปลี่ยนชื่อ ผ่าน pacesConfirm)
 * HR1: "รายการคำเพิ่มทีละคำแบบ draft" ไม่มีใน theme — ประกอบจาก list-group + input-group (Design-Spec §Theme Source Mapping)
 *
 * ห้าม import @/lib/shop-tag-match | shop-tag-schemas | @/services/* (ลาก node:crypto เข้า client bundle) — ตัวเทียบอยู่ใน ./types
 * name ของแท็กที่ยังไม่ตั้งค่า = อ่านอย่างเดียว: POST ลงทะเบียนด้วยชื่อสตริงที่ห้องใช้อยู่ ส่วนเปลี่ยนชื่อเป็น PATCH อีกรอบ
 *    (สองคำขอ = ล้มครึ่งทางได้) — ให้ตั้งค่าก่อน แล้วค่อยเปลี่ยนชื่อจากแถวที่ลงทะเบียนแล้ว
 */
import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { charLen, kwKeyOf, nameKeyOf, rowKey, type TagLimits, type TagRow } from './types'

type FormValues = { name: string; keywords: string[]; remove: boolean; draft: string }

const API = '/api/shops/current/tags'
const SHORT_KEYWORD_MAX = 3
const NAME_COUNTER_FROM = 24

type ApiError = { error?: string; issues?: { path?: string; message: string }[] }

export default function TagEditor({
  tag,
  preset,
  tags,
  limits,
  onClose,
  onDirtyChange,
  onDone,
}: {
  /** null = โหมดเพิ่ม */
  tag: TagRow | null
  preset?: { name: string; keyword: string }
  tags: TagRow[]
  limits: TagLimits
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  /** บันทึก/ลบสำเร็จ — ตัวแม่ปิดตัวแก้ + refresh */
  onDone: () => void
}) {
  const t = useT().tagManager
  const router = useRouter()
  const unregistered = tag !== null && !tag.registered
  const isEdit = tag !== null
  const nameRef = useRef<HTMLInputElement | null>(null)
  const draftRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const takenKeys = useMemo(
    () => new Set(tags.filter((x) => rowKey(x) !== (tag ? rowKey(tag) : '')).filter((x) => x.registered).map((x) => nameKeyOf(x.name))),
    [tags, tag],
  )

  const schema = useMemo(
    () =>
      Yup.object({
        name: Yup.string()
          .trim()
          .required(t.errNameRequired)
          .test('max', t.errNameTooLong, (v) => charLen(v ?? '') <= limits.nameMax)
          .test('taken', ({ value }) => fmt(t.errNameTaken, { name: String(value ?? '').trim() }), (v) => !takenKeys.has(nameKeyOf(v ?? ''))),
        keywords: Yup.array(Yup.string().required()).max(limits.maxKeywords, t.errKwTooMany).required(),
        remove: Yup.boolean().required(),
        // ช่องพิมพ์ค้าง: ว่างได้ ไม่ว่างต้องผ่านกติกาเดียวกับคำ (บันทึกแล้วรวมให้ ไม่ทิ้งเงียบ)
        draft: Yup.string().test('draft', function (raw) {
          const v = (raw ?? '').replace(/\s+/g, ' ').trim()
          if (!v) return true
          const kws = (this.parent as FormValues).keywords
          if (charLen(v) < limits.keywordMin) return this.createError({ message: t.errKwTooShort })
          if (charLen(v) > limits.keywordMax) return this.createError({ message: t.errKwTooLong })
          if (kws.some((k) => kwKeyOf(k) === kwKeyOf(v))) return this.createError({ message: t.errKwDuplicate })
          if (kws.length >= limits.maxKeywords) return this.createError({ message: t.errKwTooMany })
          return true
        }),
      }),
    [t, limits, takenKeys],
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    setError,
    getValues,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as never,
    defaultValues: {
      name: tag?.name ?? preset?.name ?? '',
      keywords: tag?.keywords ?? (preset ? [preset.keyword] : []),
      remove: tag?.removeOnOrderCreate ?? (preset ? true : false),
      draft: '',
    },
  })
  const keywords = watch('keywords')
  const nameVal = watch('name')
  const draft = watch('draft')
  const remove = watch('remove')

  // ตัวอย่างจากสถานะว่างเติมค่าให้แล้วแต่ยังไม่บันทึก → ถือว่า "มีการเปลี่ยนแปลง" เพื่อกันปิดทิ้งเงียบ ๆ
  const dirty = isDirty || (!isEdit && preset !== undefined)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
  }, [])

  const { ref: nameRegRef, ...nameReg } = register('name')
  const { ref: draftRegRef, ...draftReg } = register('draft')

  const addDraft = async () => {
    const raw = getValues('draft').replace(/\s+/g, ' ').trim()
    if (!raw) return
    if (!(await trigger('draft'))) return
    setValue('keywords', [...getValues('keywords'), raw], { shouldDirty: true })
    setValue('draft', '')
    draftRef.current?.focus()
  }
  const removeKeyword = (i: number) =>
    setValue('keywords', getValues('keywords').filter((_, j) => j !== i), { shouldDirty: true })

  /** รายการล่าสุดก่อนเปิด Swal (SDS TD-010) — จำนวนห้องที่โชว์ต้องไม่เก่ากว่าตอนกด · ล้ม = ใช้ค่าจากหน้า */
  const freshRows = async (): Promise<TagRow[]> => {
    try {
      const res = await fetch(API, { cache: 'no-store' })
      if (!res.ok) return tags
      return ((await res.json()) as { tags: TagRow[] }).tags
    } catch {
      return tags
    }
  }

  const handleFailure = async (res: Response) => {
    const body = (await res.json().catch(() => null)) as ApiError | null
    const code = body?.error
    if (res.status === 409 && code === 'TAG_NAME_TAKEN') {
      setError('name', { message: fmt(t.errNameTaken, { name: getValues('name').trim() }) })
      return
    }
    if (res.status === 409 && code === 'TAG_LIMIT_REACHED') return setFormError(t.errTagLimit)
    if (res.status === 409 && code === 'KEYWORD_TAG_LIMIT_REACHED') return setFormError(t.errKeywordTagLimit)
    if (res.status === 400) {
      const issue = body?.issues?.[0]
      if (issue?.path === 'name') return setError('name', { message: issue.message })
      return setFormError(issue?.message ?? t.toastSaveFailed)
    }
    if (res.status === 404 || res.status === 409) {
      pacesToast.warning(t.toastConflict)
      onDone()
      return
    }
    if (res.status === 403) {
      pacesToast.error(code === 'SHOP_LOCKED' ? (body as { message?: string } | null)?.message ?? t.toastForbidden : t.toastForbidden)
      router.refresh()
      return
    }
    pacesToast.error(t.toastSaveFailed)
  }

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    const name = v.name.trim()
    const draftKw = v.draft.replace(/\s+/g, ' ').trim()
    const kws = draftKw ? [...v.keywords, draftKw] : v.keywords
    const payload = { name, keywords: kws, removeOnOrderCreate: v.remove }
    setBusy(true)
    try {
      if (isEdit && tag.registered) {
        const renamed = name !== tag.name
        let renamedRooms = 0
        if (renamed) {
          const fresh = await freshRows()
          const cur = fresh.find((x) => x.id === tag.id)
          renamedRooms = cur?.rooms ?? tag.rooms
          if (renamedRooms > 0) {
            const clash = fresh.find((x) => !x.registered && nameKeyOf(x.name) === nameKeyOf(name))
            const body = fmt(t.renameBody, { from: tag.name, to: name }) + (clash ? ` ${fmt(t.renameMerge, { to: name, m: clash.rooms })}` : '')
            const ok = await pacesConfirm.warning(fmt(t.renameTitle, { n: renamedRooms }), body, {
              confirmButtonText: t.renameConfirm,
              cancelButtonText: t.renameCancel,
              focusCancel: true,
            })
            if (!ok) return
          }
        }
        const res = await fetch(`${API}/${tag.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) return await handleFailure(res)
        const data = (await res.json()) as { renamedRooms: number }
        pacesToast.success(renamed ? fmt(t.toastRenamed, { name, n: data.renamedRooms }) : fmt(t.toastSaved, { name }))
      } else {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) return await handleFailure(res)
        pacesToast.success(fmt(isEdit ? t.toastSaved : t.toastAdded, { name }))
      }
      onDone()
    } catch {
      pacesToast.error(t.toastSaveFailed)
    } finally {
      setBusy(false)
    }
  })

  const onDelete = async () => {
    if (!tag?.id) return
    setBusy(true)
    try {
      const cur = (await freshRows()).find((x) => x.id === tag.id)
      const rooms = cur?.rooms ?? tag.rooms
      setBusy(false)
      const ok = await pacesConfirm.danger(
        fmt(t.deleteTitle, { name: tag.name }),
        rooms > 0 ? fmt(t.deleteBody, { n: rooms }) : t.deleteBodyEmpty,
        { confirmButtonText: t.deleteConfirm, cancelButtonText: t.deleteKeep, focusCancel: true },
      )
      if (!ok) return
      setBusy(true)
      const res = await fetch(`${API}/${tag.id}`, { method: 'DELETE' })
      if (res.status === 404) {
        pacesToast.warning(t.toastConflict)
        return onDone()
      }
      if (!res.ok) {
        pacesToast.error(t.toastDeleteFailed)
        if (res.status === 403) router.refresh()
        return
      }
      const data = (await res.json()) as { removedFromRooms: number }
      pacesToast.success(
        data.removedFromRooms > 0
          ? fmt(t.toastDeleted, { name: tag.name, n: data.removedFromRooms })
          : fmt(t.toastDeletedEmpty, { name: tag.name }),
      )
      onDone()
    } catch {
      pacesToast.error(t.toastDeleteFailed)
    } finally {
      setBusy(false)
    }
  }

  const title = !isEdit ? t.editorAdd : unregistered ? t.editorSetup : t.editorEdit
  const hasShort = keywords.some((k) => charLen(k) <= SHORT_KEYWORD_MAX)
  const nameLen = charLen(nameVal)
  const saveDisabled = busy || (isEdit && !unregistered && !isDirty)

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy || undefined} className="card">
      <div className="card-header">
        <h4 className="card-title">{title}</h4>
        {tag && <span className="text-default-700 text-xs tabular-nums">{fmt(t.editorRooms, { n: tag.rooms.toLocaleString() })}</span>}
      </div>
      <div className="card-body space-y-base">
        {unregistered && (
          <div className="bg-default-100 text-default-800 flex items-start gap-3 rounded-lg p-3 text-sm">
            <Icon icon="info-circle" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>{t.unregisteredInfo}</p>
          </div>
        )}

        {/* ชื่อ */}
        <div>
          <label htmlFor="tag-name" className="form-label">
            {t.nameLabel}
          </label>
          <div className="input-group max-w-md">
            <input
              id="tag-name"
              type="text"
              className="form-input min-h-11 lg:min-h-0"
              placeholder={t.namePlaceholder}
              maxLength={limits.nameMax}
              readOnly={unregistered}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'tag-name-err' : 'tag-name-help'}
              {...nameReg}
              ref={(el) => {
                nameRegRef(el)
                nameRef.current = el
              }}
            />
          </div>
          <div className="mt-1 flex items-start justify-between gap-2">
            {errors.name ? (
              <p id="tag-name-err" role="alert" className="text-danger-ink text-xs">
                {errors.name.message}
              </p>
            ) : (
              <p id="tag-name-help" className="text-default-700 text-xs">
                {t.nameHelp}
              </p>
            )}
            {nameLen >= NAME_COUNTER_FROM && (
              <span className="text-default-700 shrink-0 text-xs tabular-nums">
                {nameLen}/{limits.nameMax}
              </span>
            )}
          </div>
        </div>

        {/* คำที่ทำให้ติด */}
        <div>
          <label htmlFor="tag-draft" className="form-label">
            {t.kwLabel} <span className="text-default-700 font-normal">{t.kwOptional}</span>
          </label>
          <div className="input-group">
            <input
              id="tag-draft"
              type="text"
              className="form-input min-h-11 lg:min-h-0 placeholder:text-default-500!"
              placeholder={t.kwPlaceholder}
              aria-invalid={errors.draft ? true : undefined}
              aria-describedby={errors.draft ? 'tag-draft-err' : 'tag-draft-help'}
              autoComplete="off"
              {...draftReg}
              ref={(el) => {
                draftRegRef(el)
                draftRef.current = el
              }}
              onKeyDown={(e) => {
                // Enter ของคีย์บอร์ดไทยมือถือคือ "ยืนยันคำ" ของ IME ไม่ใช่ "เพิ่มคำ"
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                void addDraft()
              }}
            />
            <button type="button" className="btn border-default-300 text-default-800 min-h-11 shrink-0 border lg:min-h-0" onClick={() => void addDraft()} disabled={!draft.trim()}>
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              {t.kwAdd}
            </button>
          </div>
          <div className="mt-1 flex items-start justify-between gap-2">
            {errors.draft ? (
              <p id="tag-draft-err" role="alert" className="text-danger-ink text-xs">
                {errors.draft.message}
              </p>
            ) : (
              <p id="tag-draft-help" className="text-default-700 text-xs">
                {t.kwHelp}
              </p>
            )}
            <span className="text-default-700 shrink-0 text-xs tabular-nums">{fmt(t.kwCount, { n: keywords.length, max: limits.maxKeywords })}</span>
          </div>

          {keywords.length === 0 ? (
            <p className="text-default-700 mt-2 text-sm">{t.kwEmpty}</p>
          ) : (
            <ul className="divide-default-200 border-default-200 mt-2 divide-y rounded-lg border">
              {keywords.map((k, i) => (
                <li key={k} className="flex min-h-11 items-center gap-2 py-1 ps-3 pe-1">
                  <span className="text-default-900 min-w-0 flex-1 text-sm break-words">“{k}”</span>
                  {charLen(k) <= SHORT_KEYWORD_MAX && <span className="badge bg-warning/15 text-warning-ink shrink-0 text-xs">{t.kwShort}</span>}
                  <button
                    type="button"
                    onClick={() => removeKeyword(i)}
                    aria-label={fmt(t.kwRemoveAria, { kw: k })}
                    className="btn btn-icon text-default-700 hover:text-danger-ink size-11 shrink-0 lg:size-9"
                  >
                    <Icon icon="x" className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasShort && (
            <p role="status" className="bg-warning/15 text-warning-ink mt-2 flex items-start gap-2 rounded-lg p-3 text-sm">
              <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t.kwShortWarn}
            </p>
          )}
        </div>

        {/* สวิตช์ถอดเมื่อสร้างคำสั่งซื้อ */}
        <div>
          <div className="flex items-center gap-3">
            <input id="tag-remove" type="checkbox" className="form-switch shrink-0" {...register('remove')} />
            <label htmlFor="tag-remove" className="text-default-900 text-sm font-medium">
              {t.switchLabel}
            </label>
            <span className={cn('text-xs', remove ? 'text-primary-ink font-medium' : 'text-default-700')}>{remove ? t.removes : t.keeps}</span>
          </div>
          <p className="text-default-700 mt-1 text-xs">{t.switchHelp}</p>
        </div>

        {formError && (
          <div role="alert" className="bg-danger/15 text-danger-ink flex items-start gap-2 rounded-lg p-3 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{formError}</p>
          </div>
        )}
      </div>

      <div className="card-footer flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:ms-auto sm:w-auto sm:order-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn border-default-300 text-default-800 min-h-11 flex-1 border sm:flex-none lg:min-h-0">
            {t.cancel}
          </button>
          <button type="submit" disabled={saveDisabled} className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white sm:flex-none lg:min-h-0">
            {busy && <Icon icon="loader-2" className="size-4 animate-spin" aria-hidden="true" />}
            {busy ? t.saving : isEdit ? t.save : t.saveAdd}
          </button>
        </div>
        {isEdit && tag.registered && (
          <div className="border-default-300 w-full border-t border-dashed pt-2 sm:order-1 sm:w-auto sm:border-t-0 sm:pt-0">
            <button type="button" onClick={() => void onDelete()} disabled={busy} className="btn text-danger-ink min-h-11 lg:min-h-0">
              <Icon icon="trash" className="size-4" aria-hidden="true" />
              {t.deleteTag}
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
