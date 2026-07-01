'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *   (desktop 2-col grid structure: left = fields stack, right = preview panel)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx
 *   (nav.border-default-300 flex border-b + active = border-primary text-primary
 *    — ใช้เป็นฐานของ mobile tab toggle "แก้ไข / ตัวอย่าง" แต่ control ด้วย React state
 *    แทน data-hs-tab-select เพื่อกัน hydration race)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent โดยตรง
 *   ProductFormV2 รวม RHF + Yup schema + POST/PATCH /api/products + toast feedback
 *   + mobile tab switcher + desktop split layout (3fr/2fr) + ProductPreviewPanel ไว้ใน component เดียว
 *   การเปลี่ยนแปลง layout หรือ validation logic ต้องแก้ที่นี่ ไม่ใช่ที่ page shell
 *   page shell (new-v2/page.tsx) ทำหน้าที่เฉพาะ: auth guard + shop lookup + render form นี้
 *
 * Layout (Direction B — Split Editor + Live Preview):
 *   mobile (<lg): tab switcher [แก้ไข | ตัวอย่าง] ที่หัวฟอร์ม, sticky bottom save bar
 *   desktop (≥lg): grid 3fr_2fr — left = field stack, right = preview panel sticky top-24
 *                  save button ใช้จาก FullscreenPageHeader (sticky top)
 */
import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { pacesToast } from '@/lib/paces-toast'
import * as Yup from 'yup'
import {
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
} from '@/lib/product-types/registry'
import ProductImagesCardV2 from './ProductImagesCardV2'
import ProductBasicCardV2 from './ProductBasicCardV2'
import ProductShortDescCardV2 from './ProductShortDescCardV2'
import ProductPriceCardV2 from './ProductPriceCardV2'
import ProductTypePickerCardV2 from './ProductTypePickerCardV2'
import ProductStockCardV2 from './ProductStockCardV2'
import ProductCapabilityCardV2 from './ProductCapabilityCardV2'
import ProductBillingPeriodCardV2 from './ProductBillingPeriodCardV2'
import ProductTagsCardV2 from './ProductTagsCardV2'
import ProductAttributesCardV2 from './ProductAttributesCardV2'
import ProductDescriptionCardV2 from './ProductDescriptionCardV2'
import ProductPreviewPanel from './ProductPreviewPanel'
import type { ProductFormV2Values } from './ProductFormV2.types'
import type { SerializedProduct } from '@/services/product.service'

// schema — error messages ภาษาคน ตาม Copy deck
// description ขยายเป็น 5000 ตาม validations.ts
const schema = Yup.object({
  name: Yup.string()
    .min(2, 'ชื่อสั้นไป ใส่อย่างน้อย 2 ตัวอักษร')
    .max(200, 'ชื่อยาวเกินไป (ไม่เกิน 200 ตัวอักษร)')
    .required('ใส่ชื่อสินค้าก่อนนะคะ'),
  shortDescription: Yup.string()
    .max(200, 'คำอธิบายสั้นต้องไม่เกิน 200 ตัวอักษร')
    .default(''),
  description: Yup.string()
    .max(5000, 'คำอธิบายยาวเกินไป (ไม่เกิน 5000 ตัวอักษร)')
    .default(''),
  price: Yup.number()
    .typeError('ใส่ราคาก่อนนะคะ')
    .positive('ราคาต้องมากกว่า 0 บาท')
    .test('decimal', 'ราคาทศนิยมได้ไม่เกิน 2 ตำแหน่ง', (v) =>
      v !== undefined ? /^\d+(\.\d{1,2})?$/.test(String(v)) : true,
    )
    .required('ใส่ราคาก่อนนะคะ'),
  type: Yup.string()
    .oneOf(PRODUCT_TYPE_IDS as unknown as string[], 'เลือกประเภทสินค้าก่อนนะคะ')
    .required('เลือกประเภทสินค้าก่อนนะคะ'),
  images: Yup.array()
    .of(Yup.string().required().max(200))
    .max(10, 'ใส่ได้มากที่สุด 10 รูปค่ะ')
    .default([]),
  tags: Yup.array()
    .of(Yup.string().required().max(50, 'แท็กยาวได้ไม่เกิน 50 ตัวอักษร'))
    .max(10, 'แท็กได้สูงสุด 10 รายการ')
    .default([]),
  attributes: Yup.object()
    .default({})
    .test('shape', 'รายละเอียดสินค้าผิดรูปแบบ', (val) => {
      if (val === undefined || val === null) return true
      if (typeof val !== 'object' || Array.isArray(val)) return false
      const entries = Object.entries(val as Record<string, unknown>)
      if (entries.length > 10) return false
      return entries.every(([k, v]) => {
        if (typeof k !== 'string' || typeof v !== 'string') return false
        if (k.length < 1 || k.length > 50) return false
        if (v.length > 200) return false
        return true
      })
    }),
  // capability flags (P2)
  fulfillmentMode: Yup.string()
    .oneOf(FULFILLMENT_MODES as unknown as string[], 'เลือกการจัดส่ง')
    .required(),
  billingMode: Yup.string()
    .oneOf(BILLING_MODES as unknown as string[], 'เลือกการเก็บเงิน')
    .required(),
  billingPeriod: Yup.string()
    .oneOf(BILLING_PERIODS as unknown as string[], 'เลือกรอบเก็บเงิน')
    .nullable()
    .default(null)
    // required เฉพาะถ้า billingMode = RECURRING
    .when('billingMode', {
      is: 'RECURRING',
      then: (s) => s.required('เลือกรอบเก็บเงิน').nonNullable(),
    }),
  billingPeriodDays: Yup.number()
    .integer('ต้องเป็นจำนวนเต็ม')
    .min(1)
    .max(365, 'ไม่เกิน 365 วันต่อรอบ')
    .nullable()
    .default(null)
    .when('billingPeriod', {
      is: 'CUSTOM',
      then: (s) => s.required('ใส่จำนวนวันต่อรอบ').min(1, 'อย่างน้อย 1 วัน'),
    }),
  // stockQty — Inventory Add-on (feature 00003): null=ไม่ติดตาม, ≥0=ติดตาม
  stockQty: Yup.number()
    .integer('ต้องเป็นจำนวนเต็ม')
    .min(0, 'ห้ามติดลบ')
    .nullable()
    .default(null),
})

interface ProductFormV2Props {
  shopId: string
  formId?: string
  product?: SerializedProduct
  shopName?: string
  // entitlementActive — Inventory Add-on (feature 00003): เปิด ProductStockCardV2
  // เฉพาะร้านที่ subscribe active (default false = ยังไม่แสดง)
  entitlementActive?: boolean
}

export default function ProductFormV2({
  shopId,
  formId,
  product,
  shopName,
  entitlementActive = false,
}: ProductFormV2Props) {
  const router = useRouter()
  const isEdit = !!product

  // mobile tab — desktop จะ override ด้วย lg:!block ทั้งสอง panel
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormV2Values>({
    resolver: yupResolver(schema) as any,
    mode: 'onTouched',
    defaultValues: {
      name: product?.name ?? '',
      shortDescription: product?.shortDescription ?? '',
      description: product?.description ?? '',
      price:
        product?.price !== undefined
          ? Number(product.price)
          : (undefined as unknown as number),
      type: ((product?.type as ProductFormV2Values['type']) ?? 'PHYSICAL'),
      images: product?.images ?? [],
      tags: product?.tags?.map((t) => t.name) ?? [],
      attributes:
        product?.attributes &&
        typeof product.attributes === 'object' &&
        !Array.isArray(product.attributes)
          ? (product.attributes as Record<string, string>)
          : {},
      // capability defaults — edit mode อ่านจาก product, create mode = SHIPPED+ONE_TIME
      fulfillmentMode: (product?.fulfillmentMode as ProductFormV2Values['fulfillmentMode']) ?? 'SHIPPED',
      billingMode: (product?.billingMode as ProductFormV2Values['billingMode']) ?? 'ONE_TIME',
      billingPeriod: (product?.billingPeriod as ProductFormV2Values['billingPeriod']) ?? null,
      billingPeriodDays: product?.billingPeriodDays ?? null,
      stockQty: product?.stockQty ?? null,
    },
  })

  // watch() returns full form values object — ใช้ feed live preview
  // RHF จะ re-render เมื่อ subscribed value เปลี่ยน ดังนั้น preview update
  // เรียลไทม์ตามที่ผู้ใช้พิมพ์
  const watched = watch()

  // Reset billingPeriod fields เมื่อไม่ใช่ RECURRING — กัน stale value submit
  // (ถ้า user เปลี่ยน billingMode ใน CapabilityCard manually หลัง pick SUBSCRIPTION)
  const billingMode = watch('billingMode')
  useEffect(() => {
    if (billingMode !== 'RECURRING') {
      setValue('billingPeriod', null)
      setValue('billingPeriodDays', null)
    }
  }, [billingMode, setValue])

  const onSubmit = async (values: ProductFormV2Values) => {
    try {
      // body ใช้ร่วมระหว่าง create + edit — server-side schema (Valibot)
      // ยอมรับ optional shortDescription/description/tags/attributes อยู่แล้ว
      // ส่ง undefined แทน '' เพื่อให้ DB เก็บ null ตอน clear ออก
      const body: Record<string, unknown> = {
        name: values.name,
        description: values.description ? values.description : undefined,
        shortDescription: values.shortDescription ? values.shortDescription : undefined,
        price: values.price,
        type: values.type,
        images: values.images ?? [],
        tags: values.tags ?? [],
        attributes: values.attributes ?? {},
        // capability fields
        fulfillmentMode: values.fulfillmentMode,
        billingMode: values.billingMode,
        billingPeriod: values.billingPeriod,
        billingPeriodDays: values.billingPeriodDays,
        // stockQty ส่งเฉพาะ PHYSICAL + entitlement active — ประเภทอื่น/ไม่ active ส่ง undefined (server ไม่แตะ)
        stockQty:
          values.type === 'PHYSICAL' && entitlementActive ? (values.stockQty ?? null) : undefined,
      }

      const url = isEdit ? `/api/products/${product!.id}` : '/api/products'
      const method = isEdit ? 'PATCH' : 'POST'
      // create ต้องส่ง shopId; edit ไม่ต้อง (server ผูก product → shop อยู่แล้ว)
      if (!isEdit) body.shopId = shopId

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ')
        return
      }

      pacesToast.success('บันทึกแล้ว')
      router.push('/products')
      router.refresh()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ')
    }
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="bg-card mx-auto w-full max-w-xl overflow-hidden rounded-2xl pb-20 lg:max-w-6xl lg:border lg:border-default-100 lg:p-6 lg:shadow-sm lg:pb-0"
    >
      <fieldset disabled={isSubmitting}>
        {/* Mobile tab switcher — desktop hidden (lg:hidden)
            Pattern: theme/paces tabs ui — flex border-b + active border-primary text-primary
            แต่ control ด้วย state (React) แทน data-hs-tab-select กัน hydration race */}
        <nav
          className="border-default-200 mb-3 flex border-b lg:hidden"
          role="tablist"
          aria-label="โหมดดูฟอร์ม"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'edit'}
            onClick={() => setMobileTab('edit')}
            className={`min-h-11 flex-1 px-4 py-2 text-sm font-semibold ${
              mobileTab === 'edit'
                ? 'border-primary text-primary -mb-px border-b-2'
                : 'text-default-400 hover:text-default-700'
            }`}
          >
            แก้ไข
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'preview'}
            onClick={() => setMobileTab('preview')}
            className={`min-h-11 flex-1 px-4 py-2 text-sm font-semibold ${
              mobileTab === 'preview'
                ? 'border-primary text-primary -mb-px border-b-2'
                : 'text-default-400 hover:text-default-700'
            }`}
          >
            ตัวอย่าง
          </button>
        </nav>

        {/* Split layout — desktop ≥lg: grid 3fr_2fr; mobile: stacked.
            mobile single column ใช้ tab state สลับ panel; desktop force ทั้งสอง */}
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-6">
          {/* LEFT: editor (form fields stacked) */}
          <div className={`${mobileTab === 'edit' ? 'block' : 'hidden'} lg:!block`}>
            {/* Image hero — top of editor; remove sticky on desktop เพราะ split layout
                ต้องการให้ทุก field scroll ไปพร้อมๆ กัน ส่วน preview ฝั่งขวาเท่านั้นที่ sticky */}
            <Controller
              control={control}
              name="images"
              render={({ field }) => (
                <ProductImagesCardV2
                  value={field.value ?? []}
                  onChange={field.onChange}
                  formId={formId}
                />
              )}
            />
            {errors.images?.message && (
              <p className="text-danger px-3 -mt-1 text-sm">{errors.images.message}</p>
            )}

            <div className="border-default-100 border-t" />
            <ProductBasicCardV2 register={register} errors={errors} />

            <div className="border-default-100 border-t" />
            <ProductShortDescCardV2 register={register} errors={errors} />

            <div className="border-default-100 border-t" />
            <ProductPriceCardV2 register={register} errors={errors} setValue={setValue} watch={watch} />

            <div className="border-default-100 border-t" />
            <ProductTypePickerCardV2
              register={register}
              errors={errors}
              setValue={setValue}
              watch={watch}
            />

            {/* ProductStockCardV2 — เฉพาะสินค้าจับต้องได้ + ร้าน subscribe Inventory Add-on active
                (feature 00003; entitlementActive wire จาก new-v2/[id]/edit page แล้ว — S-14) */}
            {watch('type') === 'PHYSICAL' && entitlementActive && (
              <>
                <div className="border-default-100 border-t" />
                <ProductStockCardV2 register={register} errors={errors} setValue={setValue} watch={watch} />
              </>
            )}

            <div className="border-default-100 border-t" />
            <ProductCapabilityCardV2 register={register} errors={errors} />

            {/* BillingPeriodCardV2 self-renders null ถ้า billingMode !== RECURRING */}
            <ProductBillingPeriodCardV2
              register={register}
              errors={errors}
              watch={watch}
            />

            <div className="border-default-100 border-t" />
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <ProductTagsCardV2
                  value={field.value ?? []}
                  onChange={field.onChange}
                  error={errors.tags?.message}
                />
              )}
            />

            {/* Attributes — desktop only (component gates ด้วย hidden lg:block ตัวเอง)
                เลย skip border-t บน mobile เพื่อไม่ให้เห็นเส้นซ้อนกัน */}
            <div className="border-default-100 hidden border-t lg:block" />
            <Controller
              control={control}
              name="attributes"
              render={({ field }) => (
                <ProductAttributesCardV2
                  value={field.value ?? {}}
                  onChange={field.onChange}
                  error={errors.attributes?.message as string | undefined}
                />
              )}
            />

            <div className="border-default-100 border-t" />
            <ProductDescriptionCardV2 register={register} errors={errors} />
          </div>

          {/* RIGHT: live preview panel
              desktop sticky top-24 ตามขอบบน FullscreenPageHeader (h ~3rem + spacing)
              mobile: เลือกผ่าน tab state */}
          <div
            className={`${mobileTab === 'preview' ? 'block' : 'hidden'} lg:!block`}
          >
            <div className="lg:sticky lg:top-24 lg:self-start">
              <ProductPreviewPanel
                name={watched.name ?? ''}
                shortDescription={watched.shortDescription}
                description={watched.description}
                price={watched.price}
                type={watched.type ?? 'PHYSICAL'}
                images={watched.images ?? []}
                tags={watched.tags ?? []}
                attributes={watched.attributes ?? {}}
                shopName={shopName}
                fulfillmentMode={watched.fulfillmentMode}
                billingMode={watched.billingMode}
                billingPeriod={watched.billingPeriod}
              />
            </div>
          </div>
        </div>
      </fieldset>

      {/* Sticky bottom save bar — mobile only (desktop ใช้ FullscreenPageHeader)
          แสดงเฉพาะตอน edit tab; preview tab ไม่ต้องมีเพราะไม่ใช่จุดบันทึก */}
      <div
        className={`bg-card border-default-100 fixed bottom-0 inset-x-0 z-20 border-t p-3 lg:hidden ${
          mobileTab === 'edit' ? 'block' : 'hidden'
        }`}
      >
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn bg-primary hover:bg-primary-hover inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              กำลังบันทึก…
            </>
          ) : (
            'บันทึก'
          )}
        </button>
      </div>
    </form>
  )
}
