'use client'

/**
 * ShopForm — Stepper form สำหรับตั้งค่าร้านค้า
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 *
 * โครงสร้าง: copy stepper layout (sidebar nav + content area) จาก Paces settings page
 * ปรับ: เก็บ step 1 (ข้อมูลร้าน) + step 2 (logo upload) เท่านั้น
 * Strip: step 3–12 (currency, shipping, payment, notifications, invoices, SEO,
 *        integrations, backup, advanced) — ไม่มีใน SafePay MVP schema
 * Strip: Favicon, Primary Color, Accent Color fields (ไม่มีใน Shop model)
 * Strip: data-hs-stepper Preline plugin — ใช้ React state แทน (Next.js 16 = SSR strict)
 * Dep: Icon wrapper (tabler), react-hook-form + yup, toast, router.refresh
 * Fields map: shopName, description, category, address, businessType, logo (Shop model)
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import ShopSlugField from './ShopSlugField'
import ShopLocationField from './ShopLocationField'
import BusinessDangerZone from './BusinessDangerZone'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { pacesToast } from '@/lib/paces-toast'
import { uploadFileId } from '@/lib/upload-client'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import ShopMobileHero from './ShopMobileHero'

// Yup schema ตรง Shop model — ไม่มี field ที่ไม่มีใน schema
// category ใช้ SHOP_CATEGORY_KEYS เป็น key (SSOT) — label ไทยแสดงจาก SHOP_CATEGORY_LABELS
// เดิมส่ง Thai label string ตรงๆ → เปลี่ยนเป็น key เพื่อตรงกับ ShopCategorySchema (S-P1-4)
const schema = Yup.object({
  shopName: Yup.string()
    .min(2, 'ชื่อร้านต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(100, 'ชื่อร้านต้องไม่เกิน 100 ตัวอักษร')
    .required('กรุณากรอกชื่อร้าน'),
  description: Yup.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').default(''),
  // ตรวจ runtime ว่าส่งแค่ key ที่ถูกต้อง — cast เป็น string[] เพื่อไม่ให้ Yup narrow type
  // (ถ้า narrow → FormValues.category เป็น literal union → TS reject string จาก DB defaultValues)
  category: Yup.string().oneOf(['', ...(SHOP_CATEGORY_KEYS as string[])]).default(''),
  address: Yup.string().max(200, 'ที่อยู่ต้องไม่เกิน 200 ตัวอักษร').default(''),
  businessType: Yup.string()
    .oneOf(['INDIVIDUAL', 'COMPANY'] as const, 'กรุณาเลือกประเภทธุรกิจ')
    .required('กรุณาเลือกประเภทธุรกิจ'),
})

type FormValues = Yup.InferType<typeof schema>

interface ShopFormProps {
  /** อายุร้านแบบสั้น (เช่น "เปิดร้านวันนี้") — ใช้เฉพาะการ์ดหัวร้านของมือถือ */
  ageText?: string | null
  shop?: {
    id: string
    shopName: string
    description: string | null
    logo: string | null
    coverImage: string | null
    category: string | null
    address: string | null
    businessType: string
  } | null
  isExisting: boolean
  /**
   * โซนอันตราย — ส่งมาเฉพาะตอน active shop เป็น BUSINESS และผู้ใช้เป็น OWNER
   * undefined = ไม่มีแท็บนี้เลย (ร้านส่วนตัวลบไม่ได้ · ผู้ดูแลที่ถูกเชิญไม่ใช่เจ้าของ)
   *
   * ทำไมอยู่ในแท็บ ไม่ใช่การ์ดแยกท้ายหน้า (user ทัก 2026-08-05 "แยกกันทำไม แทนที่จะเอาไป
   * เป็น tab ใต้ข้อมูลร้านค้า"): หน้านี้มี nav ซ้ายอยู่แล้ว การ์ดที่ลอยอยู่ข้างล่างอ่านเป็น
   * ของคนละหน้า และหัวข้อ h5 w-full ที่ออกแบบมาสำหรับหน้าแคบ /account ยืดเต็มจอจนดูหลุด
   */
  dangerZone?: { shopId: string; shopName: string; retentionDays: number }
  /**
   * ที่ตั้ง URL หน้าร้านสาธารณะ (2026-08-07) — undefined = ไม่มีบล็อกนี้เลย
   *
   * ส่งมาเฉพาะร้าน BUSINESS: ร้านส่วนตัวใช้ /u/{username} ซึ่งไม่ได้มาจาก slug จึงไม่มีอะไร
   * ให้ตั้งที่นี่ (และ /onboarding บังคับตั้งให้อยู่แล้วก่อนเข้าระบบได้)
   *
   * ทำไมเป็นบล็อกใน step 1 ไม่ใช่ step ใหม่ของ stepper: BASE_STEPS.length ผูกกับ logic ปุ่ม
   * "ถัดไป/บันทึก" แน่นมาก การเพิ่ม step เพื่อ field เดียวเสี่ยงกว่าที่ได้ — และ slug ก็เป็น
   * "ข้อมูลร้าน" อยู่แล้วโดยความหมาย
   */
  slugSetup?: { slug: string | null; publicUrl: string | null; publicOrigin: string }
  /**
   * ที่อยู่ + หมุดแผนที่ (2026-08-14) — undefined = ไม่มีการ์ดนี้ และช่อง "ที่อยู่" แบบข้อความ
   * ทำงานตามเดิม
   *
   * ส่งมาเฉพาะร้านที่ลูกค้าต้องเดินทางมา (SERVICE_QUEUE/LODGING) เกณฑ์เดียวกับที่วิซาร์ด
   * สร้างธุรกิจใช้บังคับขั้น "ที่ตั้งร้าน" — ร้านขายออนไลน์ไม่ต้องมีหมุด ที่อยู่เป็นข้อความพอ
   */
  locationSetup?: {
    shopId: string
    address: string | null
    latitude: number | null
    longitude: number | null
  }
}

// ข้อมูล step ที่เก็บไว้ใน SafePay MVP (2 step จาก 12 step ของ theme)
const BASE_STEPS = [
  { icon: 'building-store', title: 'ข้อมูลร้านค้า', subtitle: 'ชื่อ / ติดต่อ / ประเภท' },
  { icon: 'photo', title: 'โลโก้ร้าน', subtitle: 'อัปโหลดภาพ' },
]

export default function ShopForm({
  shop,
  isExisting,
  ageText = null,
  dangerZone,
  slugSetup,
  locationSetup,
}: ShopFormProps) {
  const router = useRouter()

  // แท็บที่ 3 โผล่เฉพาะร้านที่ลบได้ — ประกอบใน component เพราะขึ้นกับ prop
  const stepData = dangerZone
    ? [...BASE_STEPS, { icon: 'alert-triangle', title: 'โซนอันตราย', subtitle: 'ลบธุรกิจนี้' }]
    : BASE_STEPS

  // React state แทน data-hs-stepper (Preline plugin) — ป้องกัน hydration mismatch ใน Next.js 16
  const [activeStep, setActiveStep] = useState(0)

  // logoFileId เก็บ fileId ที่ได้จาก POST /api/upload แยกจาก react-hook-form
  const [logoFileId, setLogoFileId] = useState<string>(shop?.logo ?? '')
  const [logoUploading, setLogoUploading] = useState(false)
  const [coverFileId, setCoverFileId] = useState<string>(shop?.coverImage ?? '')
  const [coverUploading, setCoverUploading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      shopName: shop?.shopName ?? '',
      description: shop?.description ?? '',
      category: shop?.category ?? '',
      address: shop?.address ?? '',
      businessType: (shop?.businessType as FormValues['businessType']) ?? 'INDIVIDUAL',
    },
  })

  // อัปโหลดภาพหน้าปกร้าน — pattern เดียวกับโลโก้ทุกอย่าง ต่างแค่ field ปลายทาง
  // ใช้เป็นภาพนำของหน้าลิงก์คำสั่งซื้อที่ผู้ซื้อเปิดจากแชท (จุดที่ต้องพิสูจน์ว่าร้านมีตัวตนจริง)
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCoverUploading(true)
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      setCoverFileId(await uploadFileId(file, 'IMAGE'))
      // ต้องบอกว่ายังไม่จบ — ไฟล์ขึ้น bucket แล้วก็จริง แต่จะลงฐานตอนกดบันทึกเท่านั้น
      pacesToast.success('อัปโหลดภาพหน้าปกสำเร็จ — กดบันทึกเพื่อใช้งานรูปนี้')
    } catch (err) {
      // uploadFileId throw เหตุผลจริง (ชนิด/ขนาด/เน็ตขาด) — ข้อความกลาง ๆ ทำให้ผู้ใช้ลองไฟล์เดิมซ้ำ
      pacesToast.error(err instanceof Error && err.message ? err.message : 'เกิดข้อผิดพลาดขณะอัปโหลด')
    } finally {
      setCoverUploading(false)
    }
  }

  // อัปโหลดโลโก้ผ่าน POST /api/upload → ได้ fileId → บันทึกใน state
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      setLogoFileId(await uploadFileId(file, 'IMAGE'))
      pacesToast.success('อัปโหลดโลโก้สำเร็จ — กดบันทึกเพื่อใช้งานรูปนี้')
    } catch (err) {
      // uploadFileId throw เหตุผลจริง (ชนิด/ขนาด/เน็ตขาด) — ข้อความกลาง ๆ ทำให้ผู้ใช้ลองไฟล์เดิมซ้ำ
      pacesToast.error(err instanceof Error && err.message ? err.message : 'เกิดข้อผิดพลาดขณะอัปโหลด')
    } finally {
      setLogoUploading(false)
    }
  }

  // submit รวม form values + logoFileId → PATCH (แก้ไข) หรือ POST (สร้างใหม่)
  const onSubmit = async (values: FormValues) => {
    try {
      const url = isExisting ? `/api/shops/${shop!.id}` : '/api/shops'
      const method = isExisting ? 'PATCH' : 'POST'

      /**
       * 🛑 ไม่ส่ง address เมื่อการ์ด "ตำแหน่งร้าน" เป็นเจ้าของฟิลด์นี้แทน
       *
       * ช่องที่อยู่ถูกซ่อนไปแล้วก็จริง แต่ react-hook-form ไม่ล้างค่าของ field ที่ไม่ได้ mount
       * (shouldUnregister ตั้งต้นเป็น false) ⇒ `values.address` ยังเป็นค่าเดิม *ตอนโหลดหน้า*
       * อยู่เสมอ และ `router.refresh()` ไม่ทำให้ defaultValues ถูกคำนวณใหม่ (component ไม่ได้
       * remount) ⇒ ถ้าปล่อยไว้ ผู้ใช้ที่เพิ่งแก้ที่อยู่ผ่านการ์ดแล้วกด "บันทึกการเปลี่ยนแปลง"
       * จะโดนค่าเก่าเขียนทับกลับ โดยหน้าจอขึ้นว่า "บันทึกแล้ว" ทั้งสองครั้ง
       */
      const body = {
        shopName: values.shopName,
        description: values.description ?? '',
        category: values.category ?? '',
        ...(locationSetup ? {} : { address: values.address ?? '' }),
        businessType: values.businessType,
        ...(logoFileId ? { logo: logoFileId } : {}),
        ...(coverFileId ? { coverImage: coverFileId } : {}),
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // category key ที่บันทึกไว้ใน DB ถูก inject ผ่าน useForm defaultValues แล้ว
  // ถ้า DB มีค่า Thai label เก่า (ก่อน S-P1-4) → key จะไม่ match → แสดง "-- เลือกหมวดหมู่ --"
  // (acceptable: user เลือกใหม่ครั้งเดียว; ไม่มี data migration ที่ต้องทำ)

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* การ์ดอัตลักษณ์ร้าน — มือถือเท่านั้น (จัดการรูปปก/โลโก้ทั้งหมดในนี้)
          เดสก์ท็อปยังใช้ step 2 เหมือนเดิม ไม่ถูกแตะ */}
      <ShopMobileHero
        shopName={shop?.shopName ?? 'ร้านของคุณ'}
        categoryLabel={shop?.category ? (SHOP_CATEGORY_LABELS[shop.category as keyof typeof SHOP_CATEGORY_LABELS] ?? null) : null}
        ageText={ageText}
        logoFileId={logoFileId}
        coverFileId={coverFileId}
        logoUploading={logoUploading}
        coverUploading={coverUploading}
        onLogoChange={handleLogoUpload}
        onCoverChange={handleCoverUpload}
      />

      {/* -mx-4 lg:mx-0 — edge-to-edge เฉพาะมือถือ (หักล้าง gutter 16px ของ shell) ให้หน้านี้
          กว้างเท่ากับ /dashboard; เดสก์ท็อปรีเซ็ตกลับเป็น 0 จึงไม่เปลี่ยนจากเดิม
          คงมุมโค้งเดิมของ .card ไว้ — ตรงกับการ์ดอื่นใน CommandCenter (CarouselGrid /
          OrderStatusBand) ที่อยู่ใน wrapper full-bleed แต่ยังมีมุมมนปกติ */}
      <div className="card -mx-4 lg:mx-0">
        <div className="card-body">
          {/* Layout: sidebar nav (step list) + content area — จาก Paces settings page */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-base">

            {/* Sidebar: step navigation — เดสก์ท็อปเท่านั้น
                มือถือไม่มี step (เลื่อนเดียวจบ) ถ้าปล่อยไว้ grid-cols-1 จะทำให้รายการ step
                ไปกองบนสุด ต้องเลื่อนผ่าน 2 แถวก่อนเจอช่องกรอกช่องแรก */}
            <div className="hidden lg:block">
              <ul className="relative flex flex-col gap-1.5">
                {stepData.map((step, idx) => (
                  <li className="group" key={idx}>
                    <span className="group inline-flex w-full">
                      <span
                        className={`w-full rounded-md ${
                          activeStep === idx
                            ? 'bg-light/50'
                            : idx < activeStep
                            ? 'border-s-3 border-success bg-success/10 text-success'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="block w-full rounded px-4 py-2 disabled:pointer-events-none disabled:opacity-50"
                          onClick={() => setActiveStep(idx)}
                          aria-selected={activeStep === idx}
                          role="tab"
                        >
                          <span className="flex items-center">
                            <div className="avatar-md">
                              <span
                                className={`btn btn-icon size-9 rounded ${
                                  idx < activeStep ? 'bg-success/10' : 'bg-light'
                                }`}
                              >
                                <Icon icon={step.icon} className="text-2xl" />
                              </span>
                            </div>
                            <span className="ms-2.5">
                              <span className="block text-start font-semibold mb-0.5">
                                {step.title}
                              </span>
                              <span
                                className={`block text-start text-xs font-semibold ${
                                  idx < activeStep ? 'text-success' : 'text-default-400'
                                }`}
                              >
                                {step.subtitle}
                              </span>
                            </span>
                          </span>
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Content area */}
            <div className="md:col-span-2 lg:col-span-3">
              {/* กรอบเส้นประ + padding เฉพาะเดสก์ท็อป — บนมือถือ card-body มี padding อยู่แล้ว
                  กรอบอีกชั้นทำให้เป็นกล่องซ้อน 3 ชั้น (page > card > กรอบ) บีบความกว้างที่ใช้กรอกจริง */}
              <div className="lg:p-7.5 lg:border lg:border-default-300 lg:border-dashed">

                {/* Step 1: ข้อมูลร้านค้า (General Info) — shopName, description, category, address, businessType
                    เดสก์ท็อป: โชว์เฉพาะตอนเป็น step ที่เลือก (lg:hidden เมื่อไม่ active)
                    มือถือ: โชว์เสมอ = เลื่อนเดียวจบ
                    ทำได้เพราะทั้งหน้าอยู่ใน <form> เดียวและ submit ส่งทุกฟิลด์พร้อมกันอยู่แล้ว
                    stepper เป็นแค่ตัวสลับการแสดงผล ไม่ได้แบ่ง state หรือ endpoint */}
                <div className={activeStep === 0 ? undefined : 'lg:hidden'}>
                  {/* หัวข้อกลุ่ม — มือถือเท่านั้น (เดสก์ท็อปมีชื่อ step ในแถบซ้ายแล้ว)
                      Base: theme/paces/.../apps/users/profile/components/ProfileCard.tsx:43-51
                      (แถว flex items-center gap-3 + วงกลม size-8 bg-light ครอบไอคอน) */}
                  <div className="mb-4 flex items-center gap-3 lg:hidden">
                    <div className="bg-light flex size-8 items-center justify-center rounded-full">
                      <Icon icon="building-store" className="text-lg" />
                    </div>
                    <p className="font-semibold">ข้อมูลร้าน</p>
                  </div>

                  {/* URL หน้าร้าน — บนสุดของ step เพราะเป็นสิ่งเดียวในหน้านี้ที่ "ยังทำไม่ได้เลย"
                      ถ้ายังไม่ตั้ง (ที่เหลือแก้ทีหลังได้ตลอด) · โผล่เฉพาะร้าน BUSINESS
                      อยู่นอกเงื่อนไข lg:hidden ของหัวข้อกลุ่มด้านบน — เป็นเนื้อหาของ step
                      ไม่ใช่หัวข้อมือถือ จึงต้องเห็นทั้ง 2 breakpoint */}
                  {slugSetup && (
                    <ShopSlugField
                      initialSlug={slugSetup.slug}
                      publicUrl={slugSetup.publicUrl}
                      publicOrigin={slugSetup.publicOrigin}
                    />
                  )}
                  {/* ที่อยู่ + หมุดแผนที่ (2026-08-14) — โผล่เฉพาะร้านที่ลูกค้าต้องเดินทางมา
                      (SERVICE_QUEUE/LODGING) เกณฑ์เดียวกับที่วิซาร์ดสร้างธุรกิจใช้บังคับขั้น
                      "ที่ตั้งร้าน" · เมื่อการ์ดนี้โผล่ ช่อง "ที่อยู่" แบบข้อความด้านล่างจะถูกซ่อน
                      เพื่อไม่ให้มีช่องที่อยู่ 2 ที่ในหน้าเดียวที่บันทึกคนละจังหวะกัน */}
                  {locationSetup && (
                    <ShopLocationField
                      shopId={locationSetup.shopId}
                      initialAddress={locationSetup.address}
                      initialLat={locationSetup.latitude}
                      initialLng={locationSetup.longitude}
                    />
                  )}
                    <div className="col-span-1 mb-5 grid lg:grid-cols-2 gap-base">
                      {/* ชื่อร้าน */}
                      <div>
                        <label className="form-label">
                          ชื่อร้าน<span className="text-danger ms-0.5">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="เช่น ร้านของดีมีคุณภาพ"
                          {...register('shopName')}
                        />
                        {errors.shopName && (
                          <p className="text-danger mt-1 text-sm">{errors.shopName.message}</p>
                        )}
                      </div>

                      {/* หมวดหมู่ */}
                      <div>
                        <label className="form-label">
                          หมวดหมู่{' '}
                          <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                        </label>
                        <select className="form-select" {...register('category')}>
                          <option value="">-- เลือกหมวดหมู่ --</option>
                          {SHOP_CATEGORY_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {SHOP_CATEGORY_LABELS[key]}
                            </option>
                          ))}
                        </select>
                        {errors.category && (
                          <p className="text-danger mt-1 text-sm">{errors.category.message}</p>
                        )}
                      </div>

                      {/* ที่อยู่ — ซ่อนเมื่อการ์ด "ตำแหน่งร้าน" ทำหน้าที่นี้แทนแล้ว
                          ถ้าโชว์ทั้งคู่ ผู้ใช้จะเจอช่องที่อยู่ 2 ที่ในหน้าเดียว: ช่องนี้รอปุ่ม
                          "บันทึกการเปลี่ยนแปลง" ส่วนการ์ดบันทึกทันที — แก้ที่หนึ่งแล้วอีกที่
                          ยังโชว์ค่าเก่าค้างไว้ */}
                      {!locationSetup && (
                        <div>
                          <label className="form-label">
                            ที่อยู่{' '}
                            <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="เช่น 123 ถ.สุขุมวิท กรุงเทพฯ"
                            {...register('address')}
                          />
                          {errors.address && (
                            <p className="text-danger mt-1 text-sm">{errors.address.message}</p>
                          )}
                        </div>
                      )}

                      {/* ประเภทธุรกิจ */}
                      <div>
                        <label className="form-label">
                          ประเภทธุรกิจ<span className="text-danger ms-0.5">*</span>
                        </label>
                        <div className="flex flex-col gap-2 mt-1">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              value="INDIVIDUAL"
                              className="mt-0.5 shrink-0"
                              {...register('businessType')}
                            />
                            <div>
                              <span className="text-sm font-medium text-dark">บุคคลธรรมดา</span>
                              <p className="text-xs text-default-400 mt-0.5">
                                ขายในนามบุคคล ไม่มีการจดทะเบียน
                              </p>
                            </div>
                          </label>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              value="COMPANY"
                              className="mt-0.5 shrink-0"
                              {...register('businessType')}
                            />
                            <div>
                              <span className="text-sm font-medium text-dark">นิติบุคคล</span>
                              <p className="text-xs text-default-400 mt-0.5">
                                บริษัท ห้างหุ้นส่วน หรือกิจการที่จดทะเบียน
                              </p>
                            </div>
                          </label>
                        </div>
                        {errors.businessType && (
                          <p className="text-danger mt-2 text-sm">{errors.businessType.message}</p>
                        )}
                      </div>

                      {/* คำอธิบายร้าน — full width */}
                      <div className="col-span-1 lg:col-span-2">
                        <label className="form-label">
                          คำอธิบายร้าน{' '}
                          <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                        </label>
                        <textarea
                          className="form-textarea"
                          rows={3}
                          placeholder="แนะนำร้านของคุณ เช่น ขายอะไร มีบริการอะไรบ้าง"
                          {...register('description')}
                        />
                        {errors.description && (
                          <p className="text-danger mt-1 text-sm">{errors.description.message}</p>
                        )}
                      </div>
                    </div>
                </div>

                {/* Step 3: โซนอันตราย — render เฉพาะเมื่อมีสิทธิ์ลบ (ดู prop dangerZone) */}
                {dangerZone && (
                  <div className={activeStep === 2 ? '' : 'hidden'}>
                    <BusinessDangerZone
                      shopId={dangerZone.shopId}
                      shopName={dangerZone.shopName}
                      retentionDays={dangerZone.retentionDays}
                    />
                  </div>
                )}

                {/* Step 2: โลโก้ร้าน + ภาพหน้าปก — เดสก์ท็อปเท่านั้น
                    มือถือย้ายไปอยู่ใน ShopMobileHero ด้านบนแล้ว (แตะที่รูปเพื่อเปลี่ยน) จึงซ่อนที่นี่
                    ไม่งั้นจะมีช่องอัปโหลดรูปเดียวกันสองที่ในหน้าเดียว */}
                <div className={activeStep === 1 ? 'hidden lg:block' : 'hidden'}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-base mb-base">
                      <div>
                        <label className="form-label">โลโก้ร้านค้า</label>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="form-input"
                          onChange={handleLogoUpload}
                          disabled={logoUploading}
                        />
                        {logoUploading && (
                          <p className="text-default-400 mt-1 text-sm flex items-center gap-1">
                            <Icon icon="loader-2" className="animate-spin text-base" />
                            กำลังอัปโหลด...
                          </p>
                        )}
                        {logoFileId && !logoUploading && (
                          <p className="text-success mt-1 text-sm flex items-center gap-1">
                            <Icon icon="circle-check" className="text-base" />
                            อัปโหลดแล้ว
                          </p>
                        )}
                        {/* ตัวอย่างโลโก้ปัจจุบัน (ถ้ามี) */}
                        {logoFileId && (
                          <div className="mt-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/files/${logoFileId}`}
                              alt="โลโก้ร้านค้า"
                              className="h-20 w-20 rounded-lg object-cover border border-default-200"
                            />
                          </div>
                        )}
                      </div>

                      {/* ภาพหน้าปกร้าน — Shop.coverImage (2026-07-25)
                          ใช้เป็นภาพนำของหน้าลิงก์คำสั่งซื้อที่ผู้ซื้อเปิดจากแชท ไม่ใส่ก็ได้
                          ระบบจะใช้โลโก้ขยายเบลอแทน แต่จะไม่สวยเท่ารูปที่ร้านเลือกเอง */}
                      <div>
                        <label className="form-label">ภาพหน้าปกร้าน</label>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="form-input"
                          onChange={handleCoverUpload}
                          disabled={coverUploading}
                        />
                        <p className="text-default-400 mt-1 text-sm">
                          แสดงเป็นภาพใหญ่ด้านบนสุดของหน้าคำสั่งซื้อที่ลูกค้าเปิดจากแชท แนะนำภาพแนวนอน
                        </p>
                        {coverUploading && (
                          <p className="text-default-400 mt-1 text-sm flex items-center gap-1">
                            <Icon icon="loader-2" className="animate-spin text-base" />
                            กำลังอัปโหลด...
                          </p>
                        )}
                        {coverFileId && !coverUploading && (
                          <p className="text-success mt-1 text-sm flex items-center gap-1">
                            <Icon icon="circle-check" className="text-base" />
                            อัปโหลดแล้ว
                          </p>
                        )}
                        {coverFileId && (
                          <div className="mt-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/files/${coverFileId}`}
                              alt="ภาพหน้าปกร้าน"
                              className="h-28 w-full rounded-lg object-cover border border-default-200"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* toast จางหายเองใน 3-4 วิ ใช้เตือนเรื่องที่ต้อง "จำต่อ" ไม่ได้ — ข้อความนี้ค้างจอ
                        อยู่เหนือแถบปุ่มพอดี ผู้ใช้จึงเห็นทั้งเงื่อนไขและปุ่มบันทึกในสายตาเดียวกัน */}
                    <p className="text-default-400 mt-4 flex items-center gap-1.5 text-xs">
                      <Icon icon="info-circle" className="text-sm" />
                      รูปที่อัปโหลดจะยังไม่มีผลจนกว่าจะกดปุ่ม &quot;บันทึก&quot; ด้านล่าง
                    </p>
                </div>

                {/* Navigation: Back / Next / บันทึก — เดสก์ท็อปเท่านั้น
                    มือถือไม่มี step ให้เดินหน้า-ถอยหลัง ใช้ปุ่มบันทึกติดล่างแทน (ด้านล่าง) */}
                <div className="mt-10 hidden flex-wrap items-center justify-between gap-3 lg:flex">
                  <button
                    type="button"
                    className="btn bg-secondary text-white hover:bg-secondary-hover disabled:opacity-50"
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                  >
                    <Icon icon="arrow-left" />
                    ย้อนกลับ
                  </button>

                  {/* เกณฑ์ "ถัดไป หรือ บันทึก" ต้องผูกกับ BASE_STEPS (แท็บที่เป็นฟอร์มจริง — คงที่ 2
                      เสมอ) ไม่ใช่ stepData ซึ่งยาว 3 เมื่อร้านมีแท็บโซนอันตราย: รอบ 54a736cd ผูกไว้กับ
                      stepData.length แล้วแท็บ "โลโก้ร้าน" ตกไปได้ปุ่ม "ถัดไป" ส่วนแท็บโซนอันตรายถูก
                      ตีเป็น null → ร้าน BUSINESS ไม่มีปุ่มบันทึกในหน้าเลยบนเดสก์ท็อป (แถบบันทึกอีกอัน
                      เป็น lg:hidden) อัปโหลดโลโก้ขึ้น bucket ได้จริงแต่ไม่มีอะไรให้กดเพื่อ PATCH ลงฐาน
                      = "อัปโหลดโลโก้ไม่ได้" โดยไม่มี error สักตัว (user เจอเอง 2026-08-07) */}
                  {activeStep < BASE_STEPS.length - 1 ? (
                    <button
                      type="button"
                      className="btn bg-primary text-white hover:bg-primary-hover"
                      onClick={() => setActiveStep((s) => Math.min(BASE_STEPS.length - 1, s + 1))}
                    >
                      ถัดไป
                      <Icon icon="arrow-right" />
                    </button>
                  ) : activeStep === BASE_STEPS.length - 1 ? (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60 inline-flex items-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Icon icon="loader-2" className="animate-spin" />
                          กำลังบันทึก...
                        </>
                      ) : (
                        <>
                          <Icon icon="device-floppy" />
                          {isExisting ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างร้านค้า'}
                        </>
                      )}
                    </button>
                  ) : (
                    // แท็บโซนอันตราย: ไม่มีฟิลด์ของฟอร์มนี้เลย ปุ่มลบอยู่ในการ์ดของมันเองพร้อม confirm
                    // แล้ว — ปุ่ม "บันทึก" ตรงนี้จะสื่อผิดว่ามีอะไรค้างให้บันทึกในแท็บนี้
                    null
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/*
        แถบบันทึกติดล่างจอ — มือถือเท่านั้น

        🛑 ต้องเป็น fixed และอยู่ "นอกการ์ด" — รอบแรกทำเป็น sticky ไว้ในการ์ดแล้วพัง: มันไปลอย
        ทับช่องกรอกที่เหลือกลางฟอร์ม ดูเหมือนปุ่มหลงมาอยู่ผิดที่ (เห็นในสกรีนช็อตจริง 2026-08-01)
        เพราะ sticky ยังนับเป็นลูกของการ์ด จึงเลื่อนทับพี่น้องตัวเองในการ์ดเดียวกัน

        HR7 arbitrary (carve-out safe-area): bottom = calc(4rem + env(safe-area-inset-bottom))
        ยกตัวเองพ้น SellerBottomNav ซึ่ง fixed สูง 64px + safe-area
        (ดู .seller-mobile-shell ใน src/assets/css/safepay-overrides.css)
        ไม่มี token ของ Paces แทนได้ เพราะอิงความสูง component ของเราเอง + ค่าจากตัวเครื่อง

        z-20: ต่ำกว่า SellerBottomNav (z-30) จึงไม่มีทางบังเมนูล่าง แต่สูงกว่าเนื้อหาปกติ
      */}
      <div
        className="bg-card border-default-200 fixed inset-x-0 z-20 border-t px-4 py-3 lg:hidden"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center gap-2 py-3 text-white disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Icon icon="loader-2" className="animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            <>
              <Icon icon="device-floppy" />
              {isExisting ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างร้านค้า'}
            </>
          )}
        </button>
      </div>

    </form>
  )
}
