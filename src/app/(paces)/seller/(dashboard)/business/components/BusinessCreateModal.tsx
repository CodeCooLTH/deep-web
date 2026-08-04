'use client'

/**
 * BusinessCreateModal — สร้างธุรกิจใหม่แบบ modal 4 ขั้น บนฉากหลังเบลอ (user สั่ง 2026-08-04)
 *
 * ทำไมเป็น modal ไม่ใช่หน้าเต็ม: user ตัดสินเอง ("อยากให้ดูหรู ขั้นตอนชัดเจนกว่านี้ และเป็น
 * Modal หลังเบลอ"). safepay-ux เสนอหน้าเต็มและคัดค้าน modal ด้วยเหตุผลเดียวคือ "ปิดกลางคัน
 * แล้วข้อมูลหาย" — ข้อนั้นถูกแก้ในดีไซน์นี้ด้วย confirm-on-dismiss (ถามเฉพาะเมื่อกรอกไปแล้วจริง)
 * และขั้นที่ 4 ตรวจทานก่อนสร้าง
 *
 * ทำไมแบ่ง 4 ขั้นแบบนี้: "ประเภทกิจการ" ได้อยู่ขั้นของตัวเองโดยตั้งใจ เพราะเป็นค่าเดียวใน
 * ฟอร์มนี้ที่ **เลือกแล้วแก้ไม่ได้** (409 VERTICAL_LOCKED) — ไม่ควรถูกกรอกผ่าน ๆ ปนกับชื่อร้าน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (modal shell: backdrop + panel)
 *       + src/app/(paces)/seller/onboarding/page.tsx (step dots / ปุ่มถัดไป-ย้อนกลับ)
 *       + CreateBusinessForm.tsx เดิม (ลบแล้วในคอมมิตเดียวกัน — schema/onSubmit/ERROR_MESSAGE ยกมา
 *         ทั้งชุด ไฟล์นี้จึงเป็นนิยามเดียวของกฎฟอร์มนี้ ไม่ใช่สำเนาที่สอง)
 * Mockup: docs/superpowers/specs/2026-08-04-business-create-modal-mockup.html
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { useCallback, useEffect, useState } from 'react'
import * as Yup from 'yup'
import VerticalTaxonomyPicker, { VERTICAL_LOCK_NOTICE } from '@/components/safepay/VerticalTaxonomyPicker'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import CategoryMultiSelect from '../../dashboard/components/CategoryMultiSelect'
import { SHOP_CATEGORY_LABELS } from '@/lib/shop-categories'
import { SHOP_VERTICAL_KEYS, type ShopVertical } from '@/lib/lodging'

// mirror CreateBusinessShopSchema ฝั่ง backend (SRS §9 / API.md §4.7) — ห้าม fork กฎ
const schema = Yup.object({
  shopName: Yup.string()
    .min(1, 'กรุณากรอกชื่อธุรกิจ')
    .max(100, 'ชื่อธุรกิจต้องไม่เกิน 100 ตัวอักษร')
    .required('กรุณากรอกชื่อธุรกิจ'),
  // หลายหมวดได้ ≤5 ตาม SSOT จริง (Shop.categories) — ของเดิมในฟอร์มนี้เลือกได้หมวดเดียว
  // ทั้งที่ฐานเก็บได้หลายหมวดมาตั้งแต่ feature 00001
  // บังคับอย่างน้อย 1 หมวด (user สั่ง 2026-08-04) — บังคับที่ฟอร์มนี้เท่านั้น ไม่ใช่ที่ backend
  // เพราะทางเข้าอื่น (onboarding, สมัครผู้ขาย) ยังสร้างร้านโดยไม่ระบุหมวดได้ตามเดิม
  categories: Yup.array()
    .of(Yup.string().required())
    .min(1, 'เลือกอย่างน้อย 1 หมวด')
    .max(5, 'เลือกได้สูงสุด 5 หมวด')
    .default([]),
  businessType: Yup.string()
    .oneOf(['INDIVIDUAL', 'COMPANY'] as const, 'กรุณาเลือกประเภทผู้ประกอบการ')
    .required('กรุณาเลือกประเภทผู้ประกอบการ'),
  vertical: Yup.string()
    .oneOf(SHOP_VERTICAL_KEYS, 'กรุณาเลือกประเภทกิจการ')
    .required('กรุณาเลือกประเภทกิจการ'),
  description: Yup.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').default(''),
})

type FormValues = Yup.InferType<typeof schema>

const ERROR_MESSAGE: Record<string, string> = {
  NO_ACTIVE_PACKAGE: 'ยังไม่มีแพ็กเกจ ACTIVE กรุณาสมัครแพ็กเกจก่อน',
  BUSINESS_QUOTA_EXCEEDED: 'ครบโควตาจำนวนธุรกิจของแพ็กเกจนี้แล้ว',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  SHOP_CREATE_BLOCKED_PENDING_PHASE2: 'ยังไม่รองรับขั้นตอนนี้ในเวอร์ชันปัจจุบัน',
}

const STEPS = [
  { n: 1, cap: 'ข้อมูลธุรกิจ', capShort: 'ข้อมูล' },
  { n: 2, cap: 'ประเภทกิจการ', capShort: 'ประเภท' },
  { n: 3, cap: 'ผู้ประกอบการ', capShort: 'ผู้ประกอบการ' },
  { n: 4, cap: 'ตรวจทาน', capShort: 'ตรวจทาน' },
] as const

const VERTICAL_SUMMARY: Record<string, string> = {
  ONLINE_SALES: 'ขายของออนไลน์',
  SERVICE_QUEUE: 'รับนัดหมายและจอง · มาใช้บริการแล้วกลับ',
  LODGING: 'รับนัดหมายและจอง · มาพักค้างคืน',
}

export default function BusinessCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)

  const {
    register,
    handleSubmit,
    control,
    watch,
    trigger,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    // BR-SBT-07 — ค่าเริ่มต้นยังเป็น ONLINE_SALES เหมือนฟอร์มเดิมทุกประการ
    defaultValues: { shopName: '', categories: [], businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES', description: '' },
  })

  const values = watch()

  /**
   * ปิดหน้าต่าง — ถามก่อนเฉพาะเมื่อผู้ใช้กรอกอะไรไปแล้วจริง (isDirty)
   * ยังไม่แตะอะไรเลยให้ปิดเงียบ ๆ ไม่ต้องกวน (ถามทุกครั้งคือการลงโทษคนที่กดผิด)
   */
  const requestClose = useCallback(async () => {
    if (!isDirty) return onClose()
    const ok = await pacesConfirm.danger(
      'ปิดหน้าต่างนี้?',
      'ข้อมูลที่กรอกไว้จะหายทั้งหมด ต้องเริ่มใหม่ตั้งแต่ขั้นแรก',
      { confirmButtonText: 'ปิดและทิ้งข้อมูล', cancelButtonText: 'กรอกต่อ' },
    )
    if (ok) onClose()
  }, [isDirty, onClose])

  // Esc = ทางออกที่ผู้ใช้คาดหวังจาก modal — ต้องผ่านตัวกันเดียวกับกากบาท/พื้นหลัง
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose()
    }
    document.addEventListener('keydown', onKey)
    // ล็อกการเลื่อนหน้าหลังระหว่างเปิด — ไม่งั้นเลื่อนทะลุไปหน้าข้างหลังขณะกรอกฟอร์ม
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, requestClose])

  // เปิดใหม่ = เริ่มใหม่เสมอ (ปิดไปแล้วแปลว่าทิ้งข้อมูล — ห้ามค้างค่าเก่าไว้หลอกผู้ใช้)
  useEffect(() => {
    if (open) {
      reset()
      setStep(1)
    }
  }, [open, reset])

  if (!open) return null

  const next = async () => {
    // validate เฉพาะฟิลด์ของขั้นนั้น — กันผู้ใช้เดินข้ามขั้นที่ยังกรอกไม่ครบ
    const fields: Record<number, (keyof FormValues)[]> = {
      1: ['shopName', 'categories'],
      2: ['vertical'],
      3: ['businessType', 'description'],
    }
    const ok = await trigger(fields[step] ?? [])
    if (ok) setStep((s) => Math.min(4, s + 1))
  }

  const onSubmit = async (v: FormValues) => {
    try {
      const body = {
        shopName: v.shopName,
        businessType: v.businessType,
        vertical: v.vertical,
        categories: v.categories,
        ...(v.description ? { description: v.description } : {}),
      }
      const res = await fetch('/api/business/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(ERROR_MESSAGE[data?.error as string] ?? 'สร้างธุรกิจไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const data: { shopId: string } = await res.json()
      pacesToast.success('สร้างธุรกิจสำเร็จ')
      router.push(`/business/${data.shopId}/onboarding`)
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* ฉากหลัง: เบลอ + ม่านหมึกพลัม ไม่ใช่ดำสนิท (Ink-Tinted Shadow rule ของ DESIGN.md)
          arbitrary: backdrop-blur-[7px] + bg — Paces ไม่มี token ของ backdrop overlay */}
      <button
        type="button"
        aria-label="ปิดหน้าต่างสร้างธุรกิจ"
        onClick={requestClose}
        className="absolute inset-0 cursor-default backdrop-blur-[7px]"
        style={{ backgroundColor: 'rgba(49,58,70,0.34)' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bcm-title"
        className="bg-card relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg shadow-lg"
      >
        {/* ── หัว: ชื่อ + แถบขั้นตอน ── */}
        <div className="shrink-0 px-5 pt-5 sm:px-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 id="bcm-title" className="text-default-900 text-base font-semibold">สร้างธุรกิจใหม่</h4>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิด"
              className="text-default-400 hover:bg-default-100 hover:text-dark flex size-8 items-center justify-center rounded-full"
            >
              <Icon icon="x" className="size-4" />
            </button>
          </div>

          <ol className="flex items-start pb-5">
            {STEPS.map((s) => {
              const done = step > s.n
              const now = step === s.n
              return (
                <li key={s.n} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  {/* เส้นเชื่อมขั้น: right-1/2 + w-full = ขอบขวาอยู่กึ่งกลางจุดนี้ แล้วลากย้อนเต็มความกว้าง
                      ไปถึงกึ่งกลางจุดก่อนหน้าพอดี — ใช้ utility มาตรฐานล้วน ไม่ต้องพึ่ง arbitrary value */}
                  {s.n > 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-3 right-1/2 h-0.5 w-full ${done || now ? 'bg-primary' : 'bg-default-200'}`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                      done || now ? 'bg-primary text-white' : 'bg-default-200 text-default-500'
                    } ${now ? 'ring-primary/15 ring-4' : ''}`}
                  >
                    {done ? <Icon icon="check" className="size-3.5" /> : s.n}
                  </span>
                  <span
                    className={`w-full truncate text-center text-2xs ${now ? 'text-default-900 font-semibold' : 'text-default-400'}`}
                  >
                    <span className="hidden sm:inline">{s.cap}</span>
                    <span className="sm:hidden">{s.capShort}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* ── เนื้อ ── */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="border-default-300 min-h-0 flex-1 overflow-y-auto border-t px-5 py-5 sm:px-6">
            {step === 1 && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ธุรกิจนี้ชื่ออะไร</p>
                <p className="text-default-400 mb-5 text-xs">ชื่อที่ลูกค้าจะเห็น เปลี่ยนภายหลังได้</p>
                <div>
                    <label className="form-label" htmlFor="bcm-name">
                      ชื่อธุรกิจ<span className="text-danger ms-0.5">*</span>
                    </label>
                    <input
                      id="bcm-name"
                      className={`form-input ${errors.shopName ? 'is-invalid' : ''}`}
                      placeholder="เช่น สาขา 2"
                      autoFocus
                      {...register('shopName')}
                    />
                    {errors.shopName && <p className="text-danger mt-1 text-sm">{errors.shopName.message}</p>}
                </div>
                <div className="mt-4">
                  <label className="form-label">
                    หมวดหมู่<span className="text-danger ms-0.5">*</span>{' '}
                    <span className="text-default-400 font-normal">(เลือกได้ถึง 5)</span>
                  </label>
                  <Controller
                    name="categories"
                    control={control}
                    render={({ field }) => (
                      <CategoryMultiSelect
                        value={(field.value ?? []) as string[]}
                        onChange={field.onChange}
                        max={5}
                      />
                    )}
                  />
                  {errors.categories && (
                    <p className="text-danger mt-1 text-sm">{errors.categories.message}</p>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ธุรกิจของคุณเป็นแบบไหน</p>
                <p className="text-default-400 mb-4 text-xs">กำหนดว่าธุรกิจนี้จะได้เมนูและความสามารถชุดไหน</p>

                {/* เตือนก่อนตัดสินใจ ไม่ใช่หลัง — และเป็นคำเดียวกับฝั่ง onboarding */}
                <div className="bg-warning/15 text-warning-ink mb-4 flex items-start gap-2 rounded p-2.5 text-xs">
                  <Icon icon="lock" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{VERTICAL_LOCK_NOTICE}</span>
                </div>

                <Controller
                  name="vertical"
                  control={control}
                  render={({ field }) => (
                    <VerticalTaxonomyPicker
                      columns={2}
                      value={(field.value as ShopVertical | '') || null}
                      onChange={(v) => field.onChange(v ?? '')}
                    />
                  )}
                />
                {errors.vertical && <p className="text-danger mt-2 text-sm">{errors.vertical.message}</p>}
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ใครเป็นผู้ประกอบการ</p>
                <p className="text-default-400 mb-5 text-xs">ใช้สำหรับการยืนยันตัวตนระดับ 3</p>
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      { v: 'INDIVIDUAL', t: 'บุคคลธรรมดา', d: 'ขายในนามบุคคล ไม่มีการจดทะเบียน' },
                      { v: 'COMPANY', t: 'นิติบุคคล', d: 'บริษัท ห้างหุ้นส่วน หรือกิจการที่จดทะเบียน' },
                    ] as const
                  ).map((o) => (
                    <label
                      key={o.v}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 ${
                        values.businessType === o.v ? 'border-primary bg-primary/5' : 'border-default-200'
                      }`}
                    >
                      <input type="radio" value={o.v} className="mt-0.5 shrink-0" {...register('businessType')} />
                      <span>
                        <span className="text-dark block text-sm font-medium">{o.t}</span>
                        <span className="text-default-400 mt-0.5 block text-xs">{o.d}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="form-label" htmlFor="bcm-desc">
                    คำอธิบาย <span className="text-default-400 font-normal">(ไม่บังคับ)</span>
                  </label>
                  <textarea
                    id="bcm-desc"
                    rows={3}
                    className="form-textarea"
                    placeholder="แนะนำธุรกิจนี้ เช่น ขายอะไร มีบริการอะไรบ้าง"
                    {...register('description')}
                  />
                  {errors.description && <p className="text-danger mt-1 text-sm">{errors.description.message}</p>}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ตรวจทานก่อนสร้าง</p>
                <p className="text-default-400 mb-5 text-xs">
                  มีข้อมูลหนึ่งอย่างที่แก้ทีหลังไม่ได้ ตรวจให้แน่ใจก่อนกดสร้าง
                </p>
                <dl className="border-default-300 divide-default-300 divide-y overflow-hidden rounded-lg border">
                  <Row k="ชื่อธุรกิจ" v={values.shopName} />
                  <Row
                    k="หมวดหมู่"
                    v={
                      values.categories?.length
                        ? values.categories
                            .map((c) => (SHOP_CATEGORY_LABELS as Record<string, string>)[c as string] ?? c)
                            .join(" · ")
                        : null
                    }
                  />
                  <div className="bg-warning/15 flex items-start justify-between gap-4 px-3.5 py-2.5">
                    <dt className="text-default-400 shrink-0 text-xs">ประเภทกิจการ</dt>
                    <dd className="text-default-900 text-right text-sm font-medium">
                      {VERTICAL_SUMMARY[values.vertical] ?? '—'}
                      <span className="text-warning-ink mt-0.5 flex items-center justify-end gap-1 text-2xs font-medium">
                        <Icon icon="lock" className="size-3" />
                        เปลี่ยนภายหลังไม่ได้
                      </span>
                    </dd>
                  </div>
                  <Row
                    k="ผู้ประกอบการ"
                    v={values.businessType === 'COMPANY' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}
                  />
                  <Row k="คำอธิบาย" v={values.description || null} />
                </dl>
                <p className="text-default-400 mt-4 text-xs">
                  สร้างเสร็จแล้วจะพาไปตั้งค่าร้าน (ลิงก์ร้าน และหมวดหมู่) ก่อนเริ่มใช้งาน
                </p>
              </>
            )}
          </div>

          {/* ── ท้าย ── */}
          <div className="border-default-300 bg-default-100 flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || isSubmitting}
              className="btn text-default-500 hover:text-dark inline-flex items-center gap-1 bg-transparent disabled:opacity-40"
            >
              <Icon icon="chevron-left" className="size-4" />
              ย้อนกลับ
            </button>
            <span className="text-default-400 text-2xs">ขั้นที่ {step} จาก 4</span>
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-1 text-white"
              >
                ถัดไป
                <Icon icon="chevron-right" className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn bg-primary hover:bg-primary-hover text-white disabled:opacity-50"
              >
                {isSubmitting ? 'กำลังสร้าง...' : 'สร้างธุรกิจ'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

/** แถวสรุปในขั้นตรวจทาน — ค่าที่ไม่ได้กรอกบอกตรง ๆ ว่า "ไม่ได้กรอก" ไม่ใช่ปล่อยว่างให้เดา */
function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-default-400 shrink-0 text-xs">{k}</dt>
      <dd className={`text-right text-sm ${v ? 'text-default-900 font-medium' : 'text-default-400'}`}>
        {v || 'ไม่ได้กรอก'}
      </dd>
    </div>
  )
}
