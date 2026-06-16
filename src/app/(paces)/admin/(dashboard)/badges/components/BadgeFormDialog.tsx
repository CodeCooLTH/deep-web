'use client'

/**
 * Admin /badges create + edit dialog — Preline hs-overlay modal with a
 * structured react-hook-form + yup form.
 *
 * Base shell: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 * (Preline `hs-overlay` modal). Form pattern:
 *   - theme/paces/Admin/TS/src/app/(admin)/form/validation/components/CustomValidation.tsx (RHF)
 *   - src/app/(paces)/seller/(dashboard)/products/components/ProductForm.tsx (RHF + yup + toast idiom)
 *
 * The dialog is mounted once on the badges page. BadgesTable opens it via
 * Preline `data-hs-overlay="#badge-form-dialog"` buttons and broadcasts
 * `badge-dialog:create` / `badge-dialog:edit` events so this component can
 * reset / prefill fields.
 *
 * Criteria type identifiers (FIRST_ORDER / ORDER_COUNT / PERFECT_RATING /
 * HIGH_RATING / ZERO_COMPLAINT / VETERAN / FAST_SHIPPING / FULL_VERIFICATION
 * / UNIQUE_REVIEWERS) match the seed in `src/services/badge.service.ts`.
 * The existing `evaluateBadges` awards by `nameEN`, but using the same
 * criteria shape keeps the JSON self-describing for the next iteration.
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { pacesToast } from '@/lib/paces-toast'
import * as Yup from 'yup'
import { Icon as IconifyIcon } from '@iconify/react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

// ---------------------------------------------------------------------------
// Criteria types — mirror the seed in src/services/badge.service.ts.
// Adding a type here only requires adding a case in `fieldsForType` below.
// ---------------------------------------------------------------------------
const CRITERIA_TYPES = [
  { value: 'FIRST_ORDER', label: 'ออเดอร์แรกสำเร็จ (FIRST_ORDER)' },
  { value: 'ORDER_COUNT', label: 'จำนวนออเดอร์สำเร็จขั้นต่ำ (ORDER_COUNT)' },
  { value: 'PERFECT_RATING', label: 'คะแนน 5.0 + จำนวนรีวิว (PERFECT_RATING)' },
  { value: 'HIGH_RATING', label: 'คะแนนเฉลี่ยสูง + จำนวนรีวิว (HIGH_RATING)' },
  { value: 'ZERO_COMPLAINT', label: 'ไม่มียกเลิกเลย (ZERO_COMPLAINT)' },
  { value: 'VETERAN', label: 'อายุบัญชี + active (VETERAN)' },
  { value: 'FAST_SHIPPING', label: 'ส่งของเร็วเฉลี่ย (FAST_SHIPPING)' },
  { value: 'FULL_VERIFICATION', label: 'ยืนยันครบทุกระดับ (FULL_VERIFICATION)' },
  { value: 'UNIQUE_REVIEWERS', label: 'ผู้รีวิวไม่ซ้ำ (UNIQUE_REVIEWERS)' },
] as const

type CriteriaType = (typeof CRITERIA_TYPES)[number]['value']

// Numeric sub-fields a given criteria type requires. The form only shows
// (and only validates) these fields for the currently selected type.
const fieldsForType: Record<CriteriaType, Array<{ key: CriteriaField; label: string; help?: string }>> = {
  FIRST_ORDER: [],
  ORDER_COUNT: [{ key: 'count', label: 'จำนวนออเดอร์สำเร็จขั้นต่ำ' }],
  PERFECT_RATING: [{ key: 'minReviews', label: 'จำนวนรีวิวขั้นต่ำ' }],
  HIGH_RATING: [
    { key: 'minRating', label: 'คะแนนเฉลี่ยขั้นต่ำ', help: 'เช่น 4.8' },
    { key: 'minReviews', label: 'จำนวนรีวิวขั้นต่ำ' },
  ],
  ZERO_COMPLAINT: [{ key: 'minOrders', label: 'จำนวนออเดอร์สำเร็จขั้นต่ำ' }],
  VETERAN: [{ key: 'minDays', label: 'อายุบัญชีขั้นต่ำ (วัน)' }],
  FAST_SHIPPING: [
    { key: 'maxHours', label: 'เวลาส่งเฉลี่ยสูงสุด (ชั่วโมง)' },
    { key: 'minOrders', label: 'จำนวนออเดอร์ขั้นต่ำ' },
  ],
  FULL_VERIFICATION: [],
  UNIQUE_REVIEWERS: [{ key: 'count', label: 'จำนวนผู้รีวิวไม่ซ้ำขั้นต่ำ' }],
}

type CriteriaField = 'count' | 'minReviews' | 'minRating' | 'minOrders' | 'minDays' | 'maxHours'

type FormValues = {
  name: string
  nameEN: string
  icon: string
  type: 'VERIFICATION' | 'ACHIEVEMENT'
  criteriaType: CriteriaType
  count: number | null
  minReviews: number | null
  minRating: number | null
  minOrders: number | null
  minDays: number | null
  maxHours: number | null
}

// Yup schema: each numeric sub-field is optional by default but becomes
// required (+ positive) when the selected criteriaType requires it.
const numericWhen = (field: CriteriaField, allowDecimal = false) =>
  Yup.number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .nullable()
    .typeError('ต้องเป็นตัวเลข')
    .when('criteriaType', {
      is: (t: CriteriaType) => fieldsForType[t].some((f) => f.key === field),
      then: (schema) => {
        const s = schema.required('กรุณากรอกค่า').positive('ต้องมากกว่า 0')
        return allowDecimal ? s : s.integer('ต้องเป็นจำนวนเต็ม')
      },
      otherwise: (schema) => schema.notRequired(),
    })

const schema = Yup.object({
  name: Yup.string().trim().required('กรุณากรอกชื่อภาษาไทย').max(80, 'ยาวเกิน 80 ตัวอักษร'),
  nameEN: Yup.string()
    .trim()
    .required('กรุณากรอกชื่อภาษาอังกฤษ')
    .max(80, 'ยาวเกิน 80 ตัวอักษร'),
  icon: Yup.string()
    .trim()
    .required('กรุณากรอก iconify ID')
    .matches(/^[a-z0-9-]+:[a-z0-9-]+$/, 'รูปแบบต้องเป็น set:name (เล็กทั้งหมด) เช่น tabler:trophy'),
  type: Yup.mixed<'VERIFICATION' | 'ACHIEVEMENT'>()
    .oneOf(['VERIFICATION', 'ACHIEVEMENT'])
    .required('กรุณาเลือกประเภท'),
  criteriaType: Yup.mixed<CriteriaType>()
    .oneOf(CRITERIA_TYPES.map((c) => c.value) as CriteriaType[])
    .required('กรุณาเลือกเงื่อนไข'),
  count: numericWhen('count'),
  minReviews: numericWhen('minReviews'),
  minRating: numericWhen('minRating', true),
  minOrders: numericWhen('minOrders'),
  minDays: numericWhen('minDays'),
  maxHours: numericWhen('maxHours', true),
})

const defaultValues: FormValues = {
  name: '',
  nameEN: '',
  icon: '',
  type: 'ACHIEVEMENT',
  criteriaType: 'ORDER_COUNT',
  count: null,
  minReviews: null,
  minRating: null,
  minOrders: null,
  minDays: null,
  maxHours: null,
}

// Shape matching the BadgesTable row (kept local to avoid circular import).
// icon เป็น string | null เพราะ prisma schema เปลี่ยนเป็น nullable
// imageUrl: URL ที่ได้จาก /api/files/<fileId> ใช้ prefill preview ตอน edit
type EditPayload = {
  id: string
  name: string
  nameEN: string
  icon: string | null
  imageUrl: string | null
  type: 'VERIFICATION' | 'ACHIEVEMENT'
  criteria: Record<string, unknown>
}

// Given a criteria JSON blob, populate the corresponding form fields.
const criteriaToForm = (criteria: Record<string, unknown>): Partial<FormValues> => {
  const t = String(criteria.type ?? '') as CriteriaType
  const known = CRITERIA_TYPES.some((c) => c.value === t)
  const ct: CriteriaType = known ? t : 'ORDER_COUNT'
  const num = (k: string): number | null => {
    const v = criteria[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  return {
    criteriaType: ct,
    count: num('count'),
    minReviews: num('minReviews'),
    minRating: num('minRating'),
    minOrders: num('minOrders'),
    minDays: num('minDays'),
    maxHours: num('maxHours'),
  }
}

const BadgeFormDialog = () => {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // imageUrl: URL ที่แสดง preview รูป badge ปัจจุบัน (จาก /api/files/<fileId>)
  // null = ยังไม่มีรูป หรือโหลดไม่สำเร็จ
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  // fileInputRef: ใช้ trigger input[type=file] แบบ programmatic (pattern จาก ProductImages.tsx)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as any,
    mode: 'onBlur',
    defaultValues,
  })

  const criteriaType = watch('criteriaType')
  const iconValue = watch('icon')
  const typeValue = watch('type')
  const activeFields = fieldsForType[criteriaType] ?? []

  // Listen for open events from BadgesTable (create / edit).
  useEffect(() => {
    const onCreate = () => {
      setEditingId(null)
      setImageUrl(null)
      reset(defaultValues)
    }
    const onEdit = (e: Event) => {
      const ce = e as CustomEvent<EditPayload>
      const row = ce.detail
      if (!row) return
      setEditingId(row.id)
      // prefill imageUrl จาก row ที่ BadgesTable ส่งมา เพื่อแสดง preview ตอน edit
      setImageUrl(row.imageUrl ?? null)
      reset({
        ...defaultValues,
        name: row.name,
        nameEN: row.nameEN,
        // coerce null → '' ที่ load boundary เพราะ form field คง type เป็น string
        icon: row.icon ?? '',
        type: row.type,
        ...criteriaToForm(row.criteria),
      })
    }
    window.addEventListener('badge-dialog:create', onCreate)
    window.addEventListener('badge-dialog:edit', onEdit as EventListener)
    return () => {
      window.removeEventListener('badge-dialog:create', onCreate)
      window.removeEventListener('badge-dialog:edit', onEdit as EventListener)
    }
  }, [reset])

  // handleImageFileChange — อ่านไฟล์จาก input แล้ว POST ไปยัง /api/admin/badges/upload
  // ทำไมไม่ใช้ FileUploader component: dialog นี้ต้องการ single-file inline upload
  // ไม่ใช่ dropzone multi-file grid — ใช้ pattern fetch ตรง (เหมือน ProductImages.tsx:uploadOne)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // reset input เพื่อให้ user เลือกไฟล์เดิมซ้ำได้
    e.target.value = ''
    if (!file || !editingId) return

    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('badgeId', editingId)
      const res = await fetch('/api/admin/badges/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? 'อัปโหลดไม่สำเร็จ')
      }
      const data = (await res.json()) as { imageUrl: string }
      setImageUrl(data.imageUrl)
      pacesToast.success('อัปโหลดรูป badge สำเร็จ')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ'
      pacesToast.error(msg)
    } finally {
      setUploadingImage(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    // Serialize the numeric sub-fields that belong to the selected type into
    // the `{ type, ...fields }` JSON shape expected by the seed + service.
    const criteria: Record<string, number | string> = { type: values.criteriaType }
    for (const f of fieldsForType[values.criteriaType]) {
      const v = values[f.key]
      if (typeof v === 'number') criteria[f.key] = v
    }

    const payload = {
      name: values.name.trim(),
      nameEN: values.nameEN.trim(),
      icon: values.icon.trim(),
      type: values.type,
      criteria,
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/badges', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? 'บันทึกไม่สำเร็จ')
      }
      pacesToast.success(editingId ? 'แก้ไข badge สำเร็จ' : 'เพิ่ม badge สำเร็จ')
      if (typeof window !== 'undefined') {
        window.HSOverlay?.close('#badge-form-dialog')
      }
      reset(defaultValues)
      setEditingId(null)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
      pacesToast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      id="badge-form-dialog"
      className="hs-overlay hs-overlay-open:opacity-100 hs-overlay-open:duration-500 hidden size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto pointer-events-none"
      role="dialog"
      tabIndex={-1}
      aria-labelledby="badgeFormDialogLabel"
    >
      <div className="hs-overlay-animation-target hs-overlay-open:scale-100 hs-overlay-open:opacity-100 scale-95 opacity-0 ease-in-out transition-all duration-200 lg:max-w-3xl md:max-w-2xl md:w-full m-3 md:mx-auto min-h-[calc(100%-56px)] flex items-center">
        <div className="w-full flex flex-col card pointer-events-auto">
          <div className="card-header p-5">
            <h3 id="badgeFormDialogLabel" className="font-medium text-base">
              {editingId ? 'แก้ไข Badge' : 'เพิ่ม Badge ใหม่'}
            </h3>
            <button type="button" aria-label="ปิด" data-hs-overlay="#badge-form-dialog">
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="card-body overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Name (TH) */}
                <div className="md:col-span-6">
                  <label htmlFor="badgeName" className="form-label">
                    ชื่อ (ภาษาไทย)
                  </label>
                  <input
                    id="badgeName"
                    type="text"
                    className={cn('form-input', errors.name && '!border-danger')}
                    placeholder="เช่น ร้านค้ายอดนิยม"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="invalid-msg mt-1 text-sm text-danger">{errors.name.message}</p>
                  )}
                </div>

                {/* Name (EN) */}
                <div className="md:col-span-6">
                  <label htmlFor="badgeNameEN" className="form-label">
                    ชื่อ (ภาษาอังกฤษ)
                  </label>
                  <input
                    id="badgeNameEN"
                    type="text"
                    className={cn('form-input', errors.nameEN && '!border-danger')}
                    placeholder="e.g. Trusted Seller 50"
                    {...register('nameEN')}
                  />
                  {errors.nameEN && (
                    <p className="invalid-msg mt-1 text-sm text-danger">{errors.nameEN.message}</p>
                  )}
                </div>

                {/* Icon (iconify ID) */}
                <div className="md:col-span-8">
                  <label htmlFor="badgeIcon" className="form-label">
                    Icon (iconify ID)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default-100">
                      {iconValue && /^[a-z0-9-]+:[a-z0-9-]+$/.test(iconValue) ? (
                        <IconifyIcon icon={iconValue} className="text-xl" />
                      ) : (
                        <Icon icon="award" className="text-xl text-default-400" />
                      )}
                    </div>
                    <input
                      id="badgeIcon"
                      type="text"
                      className={cn('form-input', errors.icon && '!border-danger')}
                      placeholder="เช่น tabler:trophy, mdi:medal-outline"
                      {...register('icon')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-default-400">
                    ใช้รูปแบบ set:name (ดูได้ที่ icon-sets.iconify.design) เช่น tabler:trophy หรือ mdi:medal-outline
                  </p>
                  {errors.icon && (
                    <p className="invalid-msg mt-1 text-sm text-danger">{errors.icon.message}</p>
                  )}
                </div>

                {/* Type */}
                <div className="md:col-span-4">
                  <label htmlFor="badgeType" className="form-label">
                    ประเภท
                  </label>
                  <select
                    id="badgeType"
                    className={cn('form-input', errors.type && '!border-danger')}
                    {...register('type')}
                  >
                    <option value="ACHIEVEMENT">Achievement</option>
                    <option value="VERIFICATION">Verification</option>
                  </select>
                  {errors.type && (
                    <p className="invalid-msg mt-1 text-sm text-danger">{errors.type.message}</p>
                  )}
                </div>

                {/* Achievement evaluator disclosure — evaluateBadges() in
                    src/services/badge.service.ts awards achievement badges by
                    hardcoded nameEN lookup (see BADGE_CHECKS), NOT by reading
                    the criteria JSON. Creating a NEW achievement badge here
                    stores metadata but won't auto-award until a developer
                    extends BADGE_CHECKS. MVP-level honest disclosure. */}
                {typeValue === 'ACHIEVEMENT' && (
                  <div className="md:col-span-12 rounded-md bg-warning/10 border border-warning/30 p-3 text-sm text-dark flex items-start gap-2">
                    <Icon icon="alert-triangle" className="text-warning text-lg shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">หมายเหตุ (ACHIEVEMENT):</strong>{' '}
                      Badge ประเภทนี้ถูกมอบอัตโนมัติผ่าน{' '}
                      <code className="bg-default-100 px-1 rounded">evaluateBadges()</code>{' '}
                      ซึ่งตรวจสอบด้วย <code className="bg-default-100 px-1 rounded">nameEN</code>{' '}
                      แบบ hardcoded (<code className="bg-default-100 px-1 rounded">BADGE_CHECKS</code>{' '}
                      ใน{' '}
                      <code className="bg-default-100 px-1 rounded">src/services/badge.service.ts</code>).
                      การสร้าง/แก้ไข metadata ที่นี่จะบันทึกข้อมูลลง DB
                      แต่การมอบ badge ใหม่ต้องให้ developer เพิ่ม check function
                      และ deploy โค้ดก่อน จึงจะ auto-award ได้
                    </div>
                  </div>
                )}

                {/* Image upload — แสดงเฉพาะตอน edit (ต้องมี badgeId ก่อน) */}
                {/* ทำไม: upload route ต้องการ badgeId ที่มีอยู่ใน DB แล้ว
                    → สำหรับ badge ใหม่ให้สร้างก่อนแล้วกลับมา edit เพื่อเพิ่มรูป */}
                {editingId && (
                  <div className="md:col-span-12 border-t border-default-200 pt-4">
                    <h4 className="text-sm font-medium mb-3">รูปภาพ Badge (ไม่บังคับ)</h4>
                    <div className="flex items-center gap-4">
                      {/* Preview — ใช้ <img> เพื่อรองรับ blob: URL และ /api/files/ URL
                          onError: ซ่อนรูปแล้ว reset imageUrl → null กัน broken-image icon โผล่ */}
                      <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-default-100 overflow-hidden border border-default-200">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrl}
                            alt="badge preview"
                            className="size-20 object-cover"
                            onError={() => setImageUrl(null)}
                          />
                        ) : (
                          <Icon icon="photo" className="text-3xl text-default-300" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {/* hidden file input — trigger โดย button ด้านล่าง (pattern จาก ProductImages) */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/webp,image/jpeg"
                          className="sr-only"
                          onChange={handleImageFileChange}
                        />
                        <button
                          type="button"
                          disabled={uploadingImage}
                          onClick={() => fileInputRef.current?.click()}
                          className="btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                        >
                          {uploadingImage ? (
                            <>
                              <IconifyIcon icon="tabler:loader-2" className="text-sm animate-spin" />
                              กำลังอัปโหลด…
                            </>
                          ) : (
                            <>
                              <Icon icon="upload" className="text-sm" />
                              {imageUrl ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                            </>
                          )}
                        </button>
                        <p className="text-xs text-default-400">
                          PNG / WebP / JPEG · ไม่เกิน 256 KB · ไม่รองรับ SVG
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ประกาศสำหรับ badge ใหม่ — upload ได้หลัง save แล้ว */}
                {!editingId && (
                  <div className="md:col-span-12">
                    <p className="text-xs text-default-400">
                      หมายเหตุ: สามารถอัปโหลดรูปภาพ badge ได้หลังจากบันทึก badge แล้วกลับมาแก้ไข
                    </p>
                  </div>
                )}

                {/* Criteria sub-form */}
                <div className="md:col-span-12 border-t border-default-200 pt-4">
                  <h4 className="text-sm font-medium mb-3">เงื่อนไขการมอบ Badge</h4>
                  <Controller
                    name="criteriaType"
                    control={control}
                    render={({ field }) => (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-6">
                          <label htmlFor="criteriaType" className="form-label">
                            ประเภทเงื่อนไข
                          </label>
                          <select
                            id="criteriaType"
                            className={cn(
                              'form-input',
                              errors.criteriaType && '!border-danger',
                            )}
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            onBlur={field.onBlur}
                          >
                            {CRITERIA_TYPES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          {errors.criteriaType && (
                            <p className="invalid-msg mt-1 text-sm text-danger">
                              {errors.criteriaType.message}
                            </p>
                          )}
                        </div>

                        {activeFields.length === 0 && (
                          <div className="md:col-span-6 flex items-end">
                            <p className="text-sm text-default-500">
                              ประเภทนี้ไม่ต้องการค่าตัวเลขเพิ่มเติม
                            </p>
                          </div>
                        )}

                        {activeFields.map((f) => {
                          const err = errors[f.key]
                          return (
                            <div key={f.key} className="md:col-span-3">
                              <label htmlFor={`criteria-${f.key}`} className="form-label">
                                {f.label}
                              </label>
                              <input
                                id={`criteria-${f.key}`}
                                type="number"
                                step="any"
                                className={cn('form-input', err && '!border-danger')}
                                {...register(f.key)}
                              />
                              {f.help && (
                                <p className="mt-1 text-xs text-default-400">{f.help}</p>
                              )}
                              {err && (
                                <p className="invalid-msg mt-1 text-sm text-danger">
                                  {err.message as string}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
              <button
                type="button"
                className="btn bg-light hover:text-primary"
                data-hs-overlay="#badge-form-dialog"
                disabled={submitting}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {submitting
                  ? 'กำลังบันทึก…'
                  : editingId
                    ? 'บันทึกการแก้ไข'
                    : 'เพิ่ม Badge'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default BadgeFormDialog
