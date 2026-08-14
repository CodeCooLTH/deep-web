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
 *       + theme/paces/Admin/TS/src/app/(admin)/form/wizard/components/WizardWithProgressbar.tsx
 *         (แถบความคืบหน้า + chip เส้นประต่อ step + ปุ่ม Back/Next ท้ายฟอร์ม)
 *       + CreateBusinessForm.tsx เดิม (ลบแล้วในคอมมิตเดียวกัน — schema/onSubmit/ERROR_MESSAGE ยกมา
 *         ทั้งชุด ไฟล์นี้จึงเป็นนิยามเดียวของกฎฟอร์มนี้ ไม่ใช่สำเนาที่สอง)
 * Mockup: docs/superpowers/specs/2026-08-04-business-create-modal-mockup.html
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { Controller, useForm } from 'react-hook-form'
import { useCallback, useEffect, useState } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import * as Yup from 'yup'
import VerticalTaxonomyPicker, { VERTICAL_LOCK_NOTICE } from '@/components/safepay/VerticalTaxonomyPicker'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { uploadFileId } from '@/lib/upload-client'
import CategoryMultiSelect from '../../dashboard/components/CategoryMultiSelect'
import { SHOP_CATEGORY_LABELS } from '@/lib/shop-categories'
import {
  SHOP_VERTICAL_KEYS,
  verticalRequiresStorefrontLocation,
  type ShopVertical,
} from '@/lib/lodging'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import { buildCreateBusinessShopPayload } from '@/lib/business-shop-payload'
import ThaiAddressSearch from '@/components/safepay/ThaiAddressSearch'

// Leaflet แตะ window ตอน import — ต้อง ssr:false (pattern เดียวกับที่ dashboard ใช้อยู่)
const MapPicker = dynamic(() => import('../../dashboard/components/MapPicker'), { ssr: false })

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
  // บังคับกรอก (user สั่ง 2026-08-05) — ค่านี้ไปโผล่บนโปรไฟล์สาธารณะจริง (shop.description
  // → bio → AboutOverview.tsx) ร้านที่ไม่มีคำอธิบายจึงหน้าโปรไฟล์โล่ง
  // บังคับที่ฟอร์มนี้เท่านั้น ไม่ใช่ที่ schema — ทางเข้าอื่นยังสร้างร้านโดยไม่มีคำอธิบายได้ตามเดิม
  description: Yup.string()
    .trim()
    .min(1, 'กรุณากรอกคำอธิบายธุรกิจ')
    .max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร')
    .required('กรุณากรอกคำอธิบายธุรกิจ'),
  // feature 00030 — ย้ายเข้ามาจาก /business/[shopId]/onboarding ที่ถูกตัดทิ้ง
  logo: Yup.string().default(''),
  slug: Yup.string().trim().min(1, 'กรุณาตั้ง URL ร้าน').required('กรุณาตั้ง URL ร้าน'),
  // ที่อยู่/พิกัด บังคับเฉพาะร้านที่ลูกค้าต้องเดินทางมา (ไม่ใช่ขายออนไลน์) — เงื่อนไขอยู่ที่
  // ตัว validate ต่อขั้น (stepFields) ไม่ใช่ที่ schema เพราะ Yup ไม่รู้จักลำดับขั้นของ wizard
  address: Yup.string().trim().default(''),
  latitude: Yup.number().nullable().default(null),
  longitude: Yup.number().nullable().default(null),
})

type FormValues = Yup.InferType<typeof schema>

const ERROR_MESSAGE: Record<string, string> = {
  NO_ACTIVE_PACKAGE: 'ยังไม่มีแพ็กเกจ ACTIVE กรุณาสมัครแพ็กเกจก่อน',
  BUSINESS_QUOTA_EXCEEDED: 'ครบโควตาจำนวนธุรกิจของแพ็กเกจนี้แล้ว',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  SHOP_CREATE_BLOCKED_PENDING_PHASE2: 'ยังไม่รองรับขั้นตอนนี้ในเวอร์ชันปัจจุบัน',
  SLUG_TAKEN: 'URL นี้มีคนใช้แล้ว กรุณาตั้งใหม่',
}

/**
 * โครง step ตาม WizardWithProgressbar ของธีม (icon + title + subtitle ต่อ step)
 * ไอคอนเลือกจากที่ "มีที่ใช้อยู่แล้วในโปรเจกต์" ไม่ได้เดาชื่อใหม่:
 *   building-store / category — ใช้ใน STEP_META ของ seller/onboarding
 *   user-circle — ใช้ใน WizardWithProgressbar ของธีมเอง (step ข้อมูลผู้กรอก)
 *   circle-check — ใช้ใน BusinessOnboardingWizard (สถานะอัปโหลดโลโก้สำเร็จ)
 */
const STEP_DEFS = {
  info: { key: 'info', cap: 'ข้อมูลธุรกิจ', sub: 'ชื่อ หมวดหมู่ โลโก้', icon: 'building-store' },
  vertical: { key: 'vertical', cap: 'ประเภทกิจการ', sub: 'เลือกครั้งเดียว', icon: 'category' },
  location: { key: 'location', cap: 'ที่ตั้งร้าน', sub: 'ที่อยู่และหมุดแผนที่', icon: 'map-pin' },
  owner: { key: 'owner', cap: 'ผู้ประกอบการ', sub: 'บุคคล/นิติบุคคล', icon: 'user-circle' },
  slug: { key: 'slug', cap: 'URL ร้าน', sub: 'ลิงก์สาธารณะ', icon: 'link' },
  review: { key: 'review', cap: 'ตรวจทาน', sub: 'ก่อนกดสร้าง', icon: 'circle-check' },
} as const

type StepKey = keyof typeof STEP_DEFS

/**
 * ลำดับขั้นผันตามประเภทกิจการ — ร้านขายออนไลน์ไม่มีขั้น "ที่ตั้งร้าน" เพราะลูกค้าไม่ได้เดินทางมา
 * (user สั่ง 2026-08-05: บังคับที่อยู่+หมุดเฉพาะที่ไม่ใช่ขายออนไลน์)
 *
 * คืนลำดับจริงไม่ใช่ซ่อนแล้วข้าม — แถบความคืบหน้าจะได้นับจากจำนวนขั้นที่ผู้ใช้เจอจริง
 * ไม่ใช่ค้างที่ 6 แล้วกระโดดข้ามหนึ่งช่อง
 */
function stepsFor(vertical: string): StepKey[] {
  // ใช้ SSOT ตัวเดียวกับที่ buildCreateBusinessShopPayload ใช้ตัดสินว่าจะส่งพิกัดไหม —
  // เงื่อนไขสองอย่างนี้แยกกันเมื่อไรคือรูปร่างของบั๊ก 2026-08-14 (วิซาร์ดถาม แต่ payload ไม่ส่ง)
  const needsLocation = verticalRequiresStorefrontLocation(vertical)
  return needsLocation
    ? ['info', 'vertical', 'location', 'owner', 'slug', 'review']
    : ['info', 'vertical', 'owner', 'slug', 'review']
}

const VERTICAL_SUMMARY: Record<string, string> = {
  ONLINE_SALES: 'ขายของออนไลน์',
  SERVICE_QUEUE: 'รับนัดหมายและจอง · มาใช้บริการแล้วกลับ',
  LODGING: 'รับนัดหมายและจอง · มาพักค้างคืน',
}

export default function BusinessCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { update } = useSession()

  /**
   * ตรึง scroll หน้าข้างหลังระหว่างเปิด — โมดัลประกอบเองด้วย React state ไม่ได้ล็อกฟรีแบบ
   * hs-overlay (docs/conventions/overlay-scroll-lock.md) · ต้องเรียกก่อน `if (!open) return null`
   */
  useLockBodyScroll(open)

  const [stepIdx, setStepIdx] = useState(0)
  const [logoUploading, setLogoUploading] = useState(false)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')

  const {
    register,
    handleSubmit,
    control,
    watch,
    trigger,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    // BR-SBT-07 — ค่าเริ่มต้นยังเป็น ONLINE_SALES เหมือนฟอร์มเดิมทุกประการ
    defaultValues: {
      shopName: '',
      categories: [],
      businessType: 'INDIVIDUAL',
      vertical: 'ONLINE_SALES',
      description: '',
      logo: '',
      slug: '',
      address: '',
      latitude: null,
      longitude: null,
    },
  })

  const values = watch()
  const steps = stepsFor(values.vertical)
  const stepKey = steps[Math.min(stepIdx, steps.length - 1)]
  const isLast = stepIdx === steps.length - 1

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
      setStepIdx(0)
      setSlugState('idle')
    }
  }, [open, reset])

  if (!open) return null

  const STEP_FIELDS: Record<StepKey, (keyof FormValues)[]> = {
    info: ['shopName', 'categories'],
    vertical: ['vertical'],
    location: ['address'],
    owner: ['businessType', 'description'],
    slug: ['slug'],
    review: [],
  }

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[stepKey] ?? [])
    if (!ok) return
    // ขั้นที่ตั้งร้าน: ที่อยู่กับหมุดต้องครบทั้งคู่ — Yup ตรวจ address ได้ แต่พิกัดมาจากแผนที่
    // ไม่ใช่ input จึงต้องเช็คแยก (บังคับเฉพาะร้านที่ลูกค้าเดินทางมา)
    if (stepKey === 'location') {
      if (!values.address?.trim()) {
        pacesToast.error('กรุณาเลือกที่อยู่ร้าน')
        return
      }
      if (values.latitude == null || values.longitude == null) {
        pacesToast.error('กรุณาปักหมุดตำแหน่งร้านบนแผนที่')
        return
      }
    }
    if (stepKey === 'slug' && slugState !== 'ok') {
      pacesToast.error(slugState === 'taken' ? 'URL นี้มีคนใช้แล้ว' : 'กรุณาตั้ง URL ร้านให้ถูกต้อง')
      return
    }
    setStepIdx((i) => Math.min(steps.length - 1, i + 1))
  }

  /** ตรวจ URL ร้านว่าว่างไหม — reuse GET /api/shops/check-slug (Shop.slug @unique ไม่แยกประเภทร้าน) */
  const checkSlug = async (raw: string) => {
    const slug = normalizeSlug(raw)
    setValue('slug', slug, { shouldDirty: true })
    if (!slug) return setSlugState('idle')
    if (!isValidSlugFormat(slug) || isReservedSlug(slug)) return setSlugState('invalid')
    setSlugState('checking')
    try {
      const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(slug)}`)
      const data = (await res.json()) as { available: boolean }
      setSlugState(data.available ? 'ok' : 'taken')
    } catch {
      setSlugState('idle')
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      setValue('logo', await uploadFileId(file, 'IMAGE'), { shouldDirty: true })
    } catch (err) {
      pacesToast.error(err instanceof Error && err.message ? err.message : 'อัปโหลดโลโก้ไม่สำเร็จ')
    } finally {
      setLogoUploading(false)
    }
  }

  const onSubmit = async (v: FormValues) => {
    try {
      /**
       * 🛑 ห้ามประกอบ body ตรงนี้ด้วยมืออีก — ต้องผ่าน buildCreateBusinessShopPayload เท่านั้น
       *
       * บั๊ก 2026-08-14: object literal ที่เคยอยู่ตรงนี้มีแค่ 5 คีย์ ส่วน slug/logo/address/
       * latitude/longitude ที่ผู้ใช้กรอกและยืนยันผ่านหน้าจอไปแล้วถูกทิ้งเงียบ ๆ ผู้ใช้เข้า
       * /shop แล้วเจอ "ตั้ง URL หน้าร้าน" ว่างเปล่าทั้งที่เพิ่งกรอกไป และร้าน SERVICE_QUEUE/
       * LODGING เสียหมุดแผนที่ทุกใบทั้งที่วิซาร์ดบังคับปักก่อนกดถัดไปได้
       * ฟังก์ชันนั้นมีเทส [blocker] ที่แดงทันทีถ้าคีย์ไหนหลุด — literal ตรงนี้ไม่มีอะไรเฝ้า
       */
      const body = buildCreateBusinessShopPayload(v)
      const res = await fetch('/api/business/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const code = data?.error as string
        if (code === 'SLUG_TAKEN') setStepIdx(steps.indexOf('slug'))
        pacesToast.error(ERROR_MESSAGE[code] ?? 'สร้างธุรกิจไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      await res.json()
      /**
       * บอก URL จริงที่บันทึกแล้ว ไม่ใช่คำชมลอย ๆ — "สร้างธุรกิจสำเร็จ" เฉย ๆ ไม่ได้ยืนยันว่า
       * สิ่งที่ผู้ใช้กรอกถูกเก็บจริงหรือเปล่า ซึ่งเป็นช่องว่างที่ทำให้บั๊ก 2026-08-14 ผ่านตาไป
       * ถึงหน้า /shop (ผู้ใช้เพิ่งเห็นคำว่า "สำเร็จ" มาหมาด ๆ แล้วเจอช่อง URL ว่าง)
       */
      pacesToast.success(
        body.slug ? `สร้างธุรกิจสำเร็จ — เปิดที่ deepthailand.app/b/${body.slug}` : 'สร้างธุรกิจสำเร็จ',
      )
      /**
       * รีเฟรช session ก่อน navigate — ตัวสลับบัญชีมุมขวาอ่านรายชื่อร้านจาก session
       * ถ้าไม่สั่ง update() ร้านใหม่จะยังไม่โผล่จนกว่าผู้ใช้จะ refresh หน้าเอง
       * (user ทักเอง 2026-08-05) router.refresh() ตามอีกทีให้ RSC ของหน้ารายการดึงข้อมูลใหม่
       */
      await update()
      onClose()
      router.refresh()
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
        className="card pointer-events-auto relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden"
      >
        {/* หัว modal — โครงจาก AddClientModal ของธีม: border-b + card-title + ปุ่ม x */}
        <div className="border-default-300 flex shrink-0 items-center justify-between border-b p-5">
          <h3 id="bcm-title" className="card-title">
            สร้างธุรกิจใหม่
          </h3>
          <button type="button" onClick={requestClose} aria-label="ปิด">
            <Icon icon="x" className="text-xl" />
          </button>
        </div>

        {/* แถบความคืบหน้า — WizardWithProgressbar ของธีม */}
        <div className="shrink-0 px-5 pt-5">

          {/* Base: theme/paces/Admin/TS/src/app/(admin)/form/wizard/components/WizardWithProgressbar.tsx
              — progress bar (h-1.5 rounded-full + hs-stepper-progress-bar) + chip เส้นประต่อ step
              ปรับ content เป็นไทยและเหลือ 4 step; ตัดพฤติกรรมกดที่ chip เพื่อกระโดดข้ามขั้นออก
              เพราะ wizard นี้ validate ทีละขั้น (ธีมเป็นเดโมที่ไม่มี validation) */}
          <div data-hs-stepper="" className="pb-5">
            <div className="mb-4">
              <div className="bg-default-100 flex h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="hs-stepper-progress-bar bg-primary flex flex-col justify-center overflow-hidden whitespace-nowrap text-center text-xs text-white transition-all duration-300"
                  style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
                />
              </div>
            </div>

            <ul className="relative flex flex-wrap gap-1.25">
              {steps.map((k, i) => {
                const s2 = STEP_DEFS[k]
                const done = stepIdx > i
                const now = stepIdx === i
                return (
                  <li key={k}>
                    <span className="group inline-flex items-center align-middle text-xs">
                      <span
                        className={`flex shrink-0 items-center justify-center gap-2 rounded border border-dashed px-3 py-1.5 font-medium ${
                          now
                            ? 'bg-default-50 text-default-700 border-default-300'
                            : done
                              ? 'bg-success/10 text-success border-success'
                              : 'border-default-300 text-default-400'
                        }`}
                      >
                        <Icon icon={done ? 'circle-check-filled' : s2.icon} className="size-5" />
                        <span className="text-start">
                          <span className="block text-xs font-semibold">{s2.cap}</span>
                          <span className="text-2xs">{s2.sub}</span>
                        </span>
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* ── เนื้อ ── */}
        {/* กด Enter ในช่องกรอกก็ยิง submit ได้เหมือนกัน — กันไว้ที่ตัวฟอร์มอีกชั้น
            ไม่ให้สร้างธุรกิจจากขั้นที่ยังไม่ใช่ขั้นสุดท้าย */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (isLast) void handleSubmit(onSubmit)()
          }}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* ความสูงคงที่ — วัดจากของจริงบน prod แล้วแต่ละขั้นสูงไม่เท่ากันมาก (body 240/310/399/718)
              ทำให้กล่องกระโดดขึ้นลงเกือบ 500px ระหว่างกดถัดไป (user ทักเอง 2026-08-05)
              เลือก h-100 (400px) เพราะขั้นตรวจทาน (399px) ซึ่งเป็นจังหวะตัดสินใจสุดท้ายพอดีไม่ต้องเลื่อน
              ขั้น 1 (กริดหมวด 25 ชิป) เลื่อนภายในเอา — ยอมให้ขั้นเดียวเลื่อน ดีกว่ากล่องเต้นทุกขั้น
              max-h-full กันจอเตี้ยกว่านั้นไม่ให้ล้นออกนอกจอ */}
          <div className="card-body h-100 max-h-full min-h-0 shrink overflow-y-auto overscroll-contain">
            {stepKey === 'info' && (
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
                <div className="mt-4">
                  <label className="form-label" htmlFor="bcm-logo">
                    โลโก้ร้าน <span className="text-default-400 font-normal">(ไม่บังคับ)</span>
                  </label>
                  <input
                    id="bcm-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="form-input"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                  {logoUploading && (
                    <p className="text-default-400 mt-1 flex items-center gap-1 text-sm">
                      <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
                      กำลังอัปโหลด...
                    </p>
                  )}
                  {values.logo && !logoUploading && (
                    <p className="text-success mt-1 flex items-center gap-1 text-sm">
                      <Icon icon="circle-check" className="text-base" aria-hidden="true" />
                      อัปโหลดแล้ว
                    </p>
                  )}
                </div>
              </>
            )}

            {stepKey === 'location' && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ร้านอยู่ที่ไหน</p>
                <p className="text-default-400 mb-4 text-xs">ลูกค้าต้องเดินทางมาที่ร้าน จึงต้องรู้ที่อยู่และตำแหน่ง</p>
                <div className="mb-4">
                  <label className="form-label">
                    ที่อยู่ร้าน<span className="text-danger ms-0.5">*</span>
                  </label>
                  <ThaiAddressSearch onChange={(composed) => setValue('address', composed, { shouldDirty: true })} />
                </div>
                <div>
                  <label className="form-label">
                    ปักหมุดตำแหน่งร้าน<span className="text-danger ms-0.5">*</span>
                  </label>
                  <MapPicker
                    initialLat={values.latitude}
                    initialLng={values.longitude}
                    onLocationChange={(lat, lng) => {
                      setValue('latitude', lat, { shouldDirty: true })
                      setValue('longitude', lng, { shouldDirty: true })
                    }}
                  />
                  {values.latitude != null && values.longitude != null && (
                    <p className="text-success mt-1 flex items-center gap-1 text-sm">
                      <Icon icon="circle-check" className="text-base" aria-hidden="true" />
                      ปักหมุดแล้ว
                    </p>
                  )}
                </div>
              </>
            )}

            {stepKey === 'slug' && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ตั้ง URL ร้านของคุณ</p>
                <p className="text-default-400 mb-4 text-xs">ลูกค้าจะเปิดร้านคุณผ่านลิงก์นี้</p>
                <label className="form-label" htmlFor="bcm-slug">
                  URL ร้าน<span className="text-danger ms-0.5">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text">deepthailand.app/b/</span>
                  <input
                    id="bcm-slug"
                    className="form-input"
                    placeholder="my-shop"
                    defaultValue={values.slug}
                    onChange={(e) => void checkSlug(e.target.value)}
                  />
                </div>
                {slugState === 'checking' && (
                  <p className="text-default-400 mt-1 flex items-center gap-1 text-sm">
                    <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
                    กำลังตรวจสอบ...
                  </p>
                )}
                {slugState === 'ok' && (
                  <p className="text-success mt-1 flex items-center gap-1 text-sm">
                    <Icon icon="circle-check" className="text-base" aria-hidden="true" />
                    ใช้ URL นี้ได้
                  </p>
                )}
                {slugState === 'taken' && <p className="text-danger mt-1 text-sm">URL นี้มีคนใช้แล้ว</p>}
                {slugState === 'invalid' && (
                  <p className="text-danger mt-1 text-sm">ใช้ได้เฉพาะ a-z 0-9 และ - เท่านั้น</p>
                )}
              </>
            )}

            {stepKey === 'vertical' && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ธุรกิจของคุณเป็นแบบไหน</p>
                <p className="text-default-400 mb-4 text-xs">ระบุรูปแบบธุรกิจ เพื่อฟังก์ชันการทำงานที่เหมาะสม</p>

                {/* เตือนก่อนตัดสินใจ ไม่ใช่หลัง — และเป็นคำเดียวกับฝั่ง onboarding */}
                {/* Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx:48 (bg-{semantic}/15 + rounded px-4 py-3)
                    ต่างจากธีมจุดเดียว: ใช้ text-warning-ink แทน text-warning ตาม DESIGN.md
                    (ตัวหนังสือบนพื้น /15 ต้องใช้ตระกูล -ink ให้ผ่านคอนทราสต์) */}
                <div className="bg-warning/15 text-warning-ink mb-4 flex items-center gap-2 rounded px-4 py-3 text-xs" role="alert">
                  <Icon icon="lock" className="size-3.5 shrink-0" />
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

            {stepKey === 'owner' && (
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
                    คำอธิบาย<span className="text-danger ms-0.5">*</span>
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

            {stepKey === 'review' && (
              <>
                <p className="text-default-900 mb-1 text-xl font-semibold">ตรวจทานก่อนสร้าง</p>
                {/* "2 อย่าง" ไม่ใช่ "หนึ่งอย่าง" — ตั้งแต่ payload ส่ง slug จริง (2026-08-14)
                    URL ร้านก็กลายเป็นค่าถาวรเหมือน vertical: setShopSlug ปฏิเสธการเขียนทับ
                    ด้วย SLUG_ALREADY_SET แล้ว ไม่ใช่แค่หน้าจอไม่มีช่องให้แก้ */}
                <p className="text-default-400 mb-5 text-xs">
                  มีข้อมูล 2 อย่างที่แก้ทีหลังไม่ได้ ตรวจให้แน่ใจก่อนกดสร้าง
                </p>
                {/* Base: src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx:342
                    (โครงแถว: flex items-center justify-between + border-b py-3 last:border-0) */}
                <dl className="border-default-200 rounded border px-4">
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
                  <div className="border-default-200 flex items-center justify-between gap-3 border-b py-3 last:border-0">
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
                  {/* แถวนี้ไม่ใช้ Row() แล้ว — ต้องมี badge ล็อกเหมือนแถว "ประเภทกิจการ"
                      เพราะ URL ร้านเป็นค่าถาวรพอกัน (ดู subtitle ด้านบน) */}
                  <div className="border-default-200 flex items-center justify-between gap-3 border-b py-3 last:border-0">
                    <dt className="text-default-400 shrink-0 text-xs">URL ร้าน</dt>
                    <dd className="text-default-900 text-right text-sm font-medium">
                      {values.slug ? `deepthailand.app/b/${values.slug}` : '—'}
                      <span className="text-warning-ink mt-0.5 flex items-center justify-end gap-1 text-2xs font-medium">
                        <Icon icon="lock" className="size-3" />
                        เปลี่ยนภายหลังไม่ได้
                      </span>
                    </dd>
                  </div>
                  {steps.includes('location') && <Row k="ที่อยู่ร้าน" v={values.address || null} />}
                </dl>
                {/* ข้อความเดิมบอกว่าต้องไปตั้งลิงก์ร้าน/หมวดหมู่ต่อที่หน้าตั้งค่า — เป็นคำที่เขียนไว้
                    ตอนที่ payload ยังไม่ส่ง slug จริง พอแก้บั๊กแล้วมันจะกลายเป็นคำโกหกทันที
                    สิ่งเดียวที่วิซาร์ดนี้ยังไม่ถามจริง ๆ คือภาพหน้าปกร้าน (coverImage) */}
                <p className="text-default-400 mt-4 text-xs">
                  ข้อมูลทุกอย่างในหน้านี้ถูกบันทึกทันทีที่กดสร้าง — แก้ไขเพิ่มเติมได้ภายหลังที่หน้าตั้งค่าร้าน เช่น ภาพหน้าปกร้าน
                </p>
              </>
            )}
          </div>

          {/* ── ท้าย ── */}
          <div className="border-default-300 flex shrink-0 items-center justify-between gap-x-2 border-t p-5">
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              disabled={stepIdx === 0 || isSubmitting}
              className="btn bg-light hover:text-primary inline-flex items-center gap-1 disabled:opacity-40"
            >
              <Icon icon="chevron-left" className="size-4" />
              ย้อนกลับ
            </button>
            <span className="text-default-400 text-2xs">ขั้นที่ {stepIdx + 1} จาก {steps.length}</span>
            {!isLast ? (
              <button
                key="next"
                type="button"
                onClick={next}
                className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-1 text-white"
              >
                ถัดไป
                <Icon icon="chevron-right" className="size-4" />
              </button>
            ) : (
              <button
                /**
                 * 🛑 ต้องเป็น type="button" ห้ามเป็น "submit" — บั๊กจริงที่เจอบน prod 2026-08-05:
                 * React reconcile ปุ่มตัวนี้ทับปุ่ม "ถัดไป" (ตำแหน่งเดียวกัน element เดียวกัน)
                 * พอกด "ถัดไป" เข้าขั้นสุดท้าย type จะพลิกเป็น submit **ระหว่างคลิกเดียวกัน**
                 * แล้ว default action ของคลิกนั้นยิง submit ต่อทันที = สร้างธุรกิจเองโดยผู้ใช้
                 * ยังไม่ได้กดสร้าง (user เจอเอง: "กดไปถึงสเตปที่ 4 ระบบสร้างให้อัตโนมัติ")
                 * key ที่ต่างกันกันไม่ให้ reuse node อีกชั้น
                 */
                key="submit"
                type="button"
                onClick={() => void handleSubmit(onSubmit)()}
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
    <div className="border-default-200 flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <dt className="text-default-400 shrink-0 text-xs">{k}</dt>
      <dd className={`text-right text-sm ${v ? 'text-default-900 font-medium' : 'text-default-400'}`}>
        {v || 'ไม่ได้กรอก'}
      </dd>
    </div>
  )
}
