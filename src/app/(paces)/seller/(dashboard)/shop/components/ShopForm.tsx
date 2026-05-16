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
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'

// หมวดหมู่ร้านค้าที่รองรับใน SafePay MVP
// เพิ่ม 'ยานยนต์' — ร้านค้าตัวอย่าง (seed) ใช้หมวดนี้; ลิสต์เดิมขาดไป
const CATEGORIES = [
  'อาหารและเครื่องดื่ม',
  'แฟชั่น',
  'ความงาม',
  'อิเล็กทรอนิกส์',
  'ยานยนต์',
  'บ้านและสวน',
  'บริการ',
  'ดิจิทัล',
  'สุขภาพ',
  'อื่นๆ',
]

// Yup schema ตรง Shop model — ไม่มี field ที่ไม่มีใน schema
const schema = Yup.object({
  shopName: Yup.string()
    .min(2, 'ชื่อร้านต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(100, 'ชื่อร้านต้องไม่เกิน 100 ตัวอักษร')
    .required('กรุณากรอกชื่อร้าน'),
  description: Yup.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').default(''),
  category: Yup.string().default(''),
  address: Yup.string().max(200, 'ที่อยู่ต้องไม่เกิน 200 ตัวอักษร').default(''),
  businessType: Yup.string()
    .oneOf(['INDIVIDUAL', 'COMPANY'] as const, 'กรุณาเลือกประเภทธุรกิจ')
    .required('กรุณาเลือกประเภทธุรกิจ'),
})

type FormValues = Yup.InferType<typeof schema>

interface ShopFormProps {
  shop?: {
    id: string
    shopName: string
    description: string | null
    logo: string | null
    category: string | null
    address: string | null
    businessType: string
  } | null
  isExisting: boolean
}

// ข้อมูล step ที่เก็บไว้ใน SafePay MVP (2 step จาก 12 step ของ theme)
const stepData = [
  { icon: 'building-store', title: 'ข้อมูลร้านค้า', subtitle: 'ชื่อ / ติดต่อ / ประเภท' },
  { icon: 'photo', title: 'โลโก้ร้าน', subtitle: 'อัปโหลดภาพ' },
]

export default function ShopForm({ shop, isExisting }: ShopFormProps) {
  const router = useRouter()

  // React state แทน data-hs-stepper (Preline plugin) — ป้องกัน hydration mismatch ใน Next.js 16
  const [activeStep, setActiveStep] = useState(0)

  // logoFileId เก็บ fileId ที่ได้จาก POST /api/upload แยกจาก react-hook-form
  const [logoFileId, setLogoFileId] = useState<string>(shop?.logo ?? '')
  const [logoUploading, setLogoUploading] = useState(false)

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

  // อัปโหลดโลโก้ผ่าน POST /api/upload → ได้ fileId → บันทึกใน state
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        toast.error('อัปโหลดโลโก้ไม่สำเร็จ')
        return
      }
      const data = await res.json()
      setLogoFileId(data.fileId ?? '')
      toast.success('อัปโหลดโลโก้แล้ว')
    } catch {
      toast.error('เกิดข้อผิดพลาดขณะอัปโหลด')
    } finally {
      setLogoUploading(false)
    }
  }

  // submit รวม form values + logoFileId → PATCH (แก้ไข) หรือ POST (สร้างใหม่)
  const onSubmit = async (values: FormValues) => {
    try {
      const url = isExisting ? `/api/shops/${shop!.id}` : '/api/shops'
      const method = isExisting ? 'PATCH' : 'POST'

      const body = {
        shopName: values.shopName,
        description: values.description ?? '',
        category: values.category ?? '',
        address: values.address ?? '',
        businessType: values.businessType,
        ...(logoFileId ? { logo: logoFileId } : {}),
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      toast.success('บันทึกแล้ว')
      router.refresh()
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // สร้าง options สำหรับ category select:
  // ถ้าค่าที่บันทึกไว้ใน DB ไม่อยู่ในลิสต์ canonical → prepend ไว้ก่อน
  // เพื่อให้ select แสดง & รักษาค่าเดิมได้เสมอ ไม่ว่าจะเป็นค่าอะไร
  const savedCategory = shop?.category ?? ''
  const selectOptions =
    savedCategory && !CATEGORIES.includes(savedCategory)
      ? [savedCategory, ...CATEGORIES]
      : CATEGORIES

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="card">
        <div className="card-body">
          {/* Layout: sidebar nav (step list) + content area — จาก Paces settings page */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-base">

            {/* Sidebar: step navigation */}
            <div>
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
              <div className="md:p-7.5 p-4.5 border border-default-300 border-dashed">

                {/* Step 1: ข้อมูลร้านค้า (General Info) — shopName, description, category, address, businessType */}
                {activeStep === 0 && (
                  <div>
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
                          {selectOptions.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        {errors.category && (
                          <p className="text-danger mt-1 text-sm">{errors.category.message}</p>
                        )}
                      </div>

                      {/* ที่อยู่ */}
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
                )}

                {/* Step 2: โลโก้ร้าน — logo field (Shop.logo: String?) */}
                {activeStep === 1 && (
                  <div>
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
                    </div>
                  </div>
                )}

                {/* Navigation: Back / Next / บันทึก */}
                <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="btn bg-secondary text-white hover:bg-secondary-hover disabled:opacity-50"
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                  >
                    <Icon icon="arrow-left" />
                    ย้อนกลับ
                  </button>

                  {activeStep < stepData.length - 1 ? (
                    <button
                      type="button"
                      className="btn bg-primary text-white hover:bg-primary-hover"
                      onClick={() => setActiveStep((s) => Math.min(stepData.length - 1, s + 1))}
                    >
                      ถัดไป
                      <Icon icon="arrow-right" />
                    </button>
                  ) : (
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
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
