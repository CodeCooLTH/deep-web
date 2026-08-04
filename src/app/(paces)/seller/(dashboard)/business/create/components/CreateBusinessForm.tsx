'use client'

/**
 * CreateBusinessForm — ฟอร์มสร้าง Business ใหม่ (single card, ไม่มี wizard)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx (field group
 *   input-text/select/textarea markup) — chase ผ่าน src/app/(paces)/seller/(dashboard)/shop/components/ShopForm.tsx
 *   Step-1 "ข้อมูลร้านค้า" (บรรทัด 217-331): copy 4 field เป๊ะ (ชื่อ/หมวดหมู่/ประเภทธุรกิจ radio/คำอธิบาย)
 * Strip vs ShopForm: sidebar step-nav (stepData), Step 2 (โลโก้ — ไม่มีใน CreateBusinessShopSchema),
 *   ที่อยู่ field (ไม่มีใน schema) — เหลือ single `card > card-header + card-body + card-footer`
 *
 * Yup schema mirror CreateBusinessShopSchema (SRS §9 / API.md §4.7):
 *   shopName 1-100 required, businessType INDIVIDUAL|COMPANY required (radio),
 *   category optional (SHOP_CATEGORY_KEYS, HR6 form-select native), description optional ≤500
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import * as Yup from 'yup'
import VerticalTaxonomyPicker, { VERTICAL_LOCK_NOTICE } from '@/components/safepay/VerticalTaxonomyPicker'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import { SHOP_VERTICAL_KEYS, type ShopVertical } from '@/lib/lodging'

const schema = Yup.object({
  shopName: Yup.string()
    .min(1, 'กรุณากรอกชื่อธุรกิจ')
    .max(100, 'ชื่อธุรกิจต้องไม่เกิน 100 ตัวอักษร')
    .required('กรุณากรอกชื่อธุรกิจ'),
  category: Yup.string().oneOf(['', ...(SHOP_CATEGORY_KEYS as string[])]).default(''),
  businessType: Yup.string()
    .oneOf(['INDIVIDUAL', 'COMPANY'] as const, 'กรุณาเลือกประเภทผู้ประกอบการ')
    .required('กรุณาเลือกประเภทผู้ประกอบการ'),
  // feature 00017 — ประเภทกิจการ ตั้งได้ครั้งเดียวตอนสร้าง เปลี่ยนภายหลังไม่ได้ (BR-LODG-30)
  vertical: Yup.string()
    .oneOf(SHOP_VERTICAL_KEYS, 'กรุณาเลือกประเภทกิจการ')
    .required('กรุณาเลือกประเภทกิจการ'),
  description: Yup.string().max(500, 'คำอธิบายต้องไม่เกิน 500 ตัวอักษร').default(''),
})

type FormValues = Yup.InferType<typeof schema>

// error code จาก API.md §4.7 → ข้อความไทย
const ERROR_MESSAGE: Record<string, string> = {
  NO_ACTIVE_PACKAGE: 'ยังไม่มีแพ็กเกจ ACTIVE กรุณาสมัครแพ็กเกจก่อน',
  BUSINESS_QUOTA_EXCEEDED: 'ครบโควตาจำนวนธุรกิจของแพ็กเกจนี้แล้ว',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  SHOP_CREATE_BLOCKED_PENDING_PHASE2: 'ยังไม่รองรับขั้นตอนนี้ในเวอร์ชันปัจจุบัน',
}

export default function CreateBusinessForm() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    // feature 00028 (BR-SBT-07) — ค่าเริ่มต้นเปลี่ยนจากค่าเก่า GENERAL เป็น ONLINE_SALES ให้ sync กับ DB default ใหม่
    defaultValues: { shopName: '', category: '', businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES', description: '' },
  })


  const onSubmit = async (values: FormValues) => {
    try {
      const body = {
        shopName: values.shopName,
        businessType: values.businessType,
        vertical: values.vertical,
        ...(values.category ? { category: values.category } : {}),
        ...(values.description ? { description: values.description } : {}),
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
      // ไป onboarding ทันที (P4-5/D4) — business ใหม่ต้อง setup slug/ข้อมูลร้านก่อนใช้งาน
      router.push(`/business/${data.shopId}/onboarding`)
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="card mx-auto max-w-2xl">
        <div className="card-header">
          <h4 className="card-title">ข้อมูลธุรกิจใหม่</h4>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            {/* ชื่อธุรกิจ */}
            <div>
              <label className="form-label">
                ชื่อธุรกิจ<span className="text-danger ms-0.5">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="เช่น สาขา 2"
                {...register('shopName')}
              />
              {errors.shopName && (
                <p className="text-danger mt-1 text-sm">{errors.shopName.message}</p>
              )}
            </div>

            {/* หมวดหมู่ — HR6 form-select native (bind RHF), ไม่ใช่ hs-dropdown */}
            <div>
              <label className="form-label">
                หมวดหมู่ <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
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

            {/* ประเภทกิจการ — feature 00030 ใช้ VerticalTaxonomyPicker ตัวเดียวกับ Personal
                onboarding (เดิมเป็นการ์ด 3 ใบเขียนซ้ำที่นี่อีกชุด แก้ที่เดียวอีกที่ไม่ตาม) */}
            <div className="lg:col-span-2">
              <label className="form-label">
                ประเภทกิจการ<span className="text-danger ms-0.5">*</span>
              </label>
              {/* คำเตือนอยู่ "ก่อน" การ์ด — ของเดิมอยู่ใต้การ์ด คือเตือนหลังคนตัดสินใจไปแล้ว
                  และเป็นคนละประโยคกับฝั่ง onboarding ทั้งที่พูดเรื่องเดียวกัน */}
              <p className="text-default-500 mt-0.5 mb-2 flex items-start gap-1 text-xs">
                <Icon icon="tabler:info-circle" className="mt-0.5 size-3.5 shrink-0" />
                {VERTICAL_LOCK_NOTICE}
              </p>
              <Controller
                name="vertical"
                control={control}
                render={({ field }) => (
                  <VerticalTaxonomyPicker
                    columns={2}
                    value={(field.value as ShopVertical | '') || null}
                    /* null (เลือกหมวดใหญ่แล้วยังไม่เลือกย่อย) → '' เพื่อให้ Yup ตกที่
                       oneOf(SHOP_VERTICAL_KEYS) แล้วขึ้นข้อความ "กรุณาเลือกประเภทกิจการ"
                       ตามกลไก validation เดิม ไม่ต้องเขียนกฎซ้ำที่นี่ */
                    onChange={(v) => field.onChange(v ?? '')}
                  />
                )}
              />
              {errors.vertical && (
                <p className="text-danger mt-2 text-sm">{errors.vertical.message}</p>
              )}
            </div>

            {/* ประเภทผู้ประกอบการ — เดิมชื่อ "ประเภทธุรกิจ" เปลี่ยนป้ายเพื่อไม่ให้สับสนกับ
                "ประเภทกิจการ" (Shop.vertical) ที่เพิ่มด้านบน — คนละเรื่องกันคนละ field (BR-LODG-04)
                เปลี่ยนเฉพาะข้อความ ชื่อ field และค่าที่ส่งยังเป็น businessType/INDIVIDUAL|COMPANY เหมือนเดิม */}
            <div className="lg:col-span-2">
              <label className="form-label">
                ประเภทผู้ประกอบการ<span className="text-danger ms-0.5">*</span>
              </label>
              <p className="text-default-400 mb-1 text-xs">ใช้สำหรับการยืนยันตัวตนระดับ 3</p>
              <div className="mt-1 flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    value="INDIVIDUAL"
                    className="mt-0.5 shrink-0"
                    {...register('businessType')}
                  />
                  <div>
                    <span className="text-dark text-sm font-medium">บุคคลธรรมดา</span>
                    <p className="text-default-400 mt-0.5 text-xs">
                      ขายในนามบุคคล ไม่มีการจดทะเบียน
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    value="COMPANY"
                    className="mt-0.5 shrink-0"
                    {...register('businessType')}
                  />
                  <div>
                    <span className="text-dark text-sm font-medium">นิติบุคคล</span>
                    <p className="text-default-400 mt-0.5 text-xs">
                      บริษัท ห้างหุ้นส่วน หรือกิจการที่จดทะเบียน
                    </p>
                  </div>
                </label>
              </div>
              {errors.businessType && (
                <p className="text-danger mt-2 text-sm">{errors.businessType.message}</p>
              )}
            </div>

            {/* คำอธิบาย */}
            <div className="lg:col-span-2">
              <label className="form-label">
                คำอธิบาย <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="แนะนำธุรกิจนี้ เช่น ขายอะไร มีบริการอะไรบ้าง"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-danger mt-1 text-sm">{errors.description.message}</p>
              )}
            </div>
          </div>
        </div>
        <div className="card-footer flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Icon icon="refresh" className="animate-spin" aria-hidden="true" />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Icon icon="plus" aria-hidden="true" />
                สร้างธุรกิจ
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
