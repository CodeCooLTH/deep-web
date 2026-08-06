'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *   (card stack layout: ข้อมูล → รูปภาพ → ราคา → เวลา — 1-col card stack, bottom action bar;
 *   ที่มาของ responsive grid `grid grid-cols-1 lg:grid-cols-3 gap-base` + col-span-2/1 split)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/invoice/create/page.tsx
 *   (sticky rail `lg:sticky lg:top-25` + ปุ่มเรียงแนวตั้ง `flex flex-col gap-2.5` — ที่มาของการ์ด
 *   "เผยแพร่" ฝั่งขวา; offset ปรับเป็น top-24 ให้ตรง in-app convention ProductFormV2.tsx:386-391)
 * Base mockup: docs/mockups/auction/seller-auction-v1.html frame 2 ("สร้างประมูล /seller/auctions/new")
 *   — 4 การ์ด (ข้อมูลพื้นฐาน/รูปภาพ/ราคา/เวลาประมูล) + f-footer sticky [บันทึกร่าง][เผยแพร่]
 *   ("f-" class ใน mockup เป็น demo CSS เท่านั้น — impl จริงแทนด้วย Paces primitive .card, .form-input, .input-group)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent (auction ไม่ใช่ product)
 * ประกอบจาก AuctionBasicCard/AuctionImageCard/AuctionPriceCard/AuctionTimeCard + L2 guard banner
 * + sticky bottom footer (create: บันทึกร่าง/เผยแพร่ · edit: บันทึกการแก้ไข)
 *
 * Responsive ladder (S-A1, 3 breakpoints) — 5 flat grid items + order-* / col-start-* / row-start-*,
 * ไม่ใช้ wrapper-div group (กัน mobile ลำดับเพี้ยน เพราะรูปภาพต้องอยู่ระหว่างข้อมูลพื้นฐาน/ราคา บน mobile
 * เท่านั้น — ถ้า group รูปภาพ+เผยแพร่ไว้ด้วยกัน DOM position ท้ายสุดจะทำให้ mobile ลำดับผิด):
 *   - mobile (<md): ไม่มี order class → DOM order เดิม (Basic→Image→Price→Time), fixed bottom bar เดิม
 *   - tablet (md–lg): `md:order-1..5` เรียง Basic→Price→Time→Image→[การ์ดเผยแพร่] คอลัมน์เดียว ไม่มี fixed bar
 *   - desktop (≥lg): grid 2:1 — ซ้าย col-span-2 แถว 1/2/3 (Basic/Price/Time), ขวา col-span-1 sticky
 *     top-24 แถว 1/2 (รูปภาพ/การ์ดเผยแพร่). ใส่ `lg:row-start-*` คู่กับ `lg:col-start-*` ทุก item เพราะ
 *     auto-placement ของ CSS Grid เดินตาม order-modified sequence แล้ววาง column-only item ต่อจาก
 *     cursor แถวปัจจุบัน (เดินมือตาม spec แล้วพบว่าไม่ pin row จะดันรูปภาพ/การ์ดเผยแพร่ไปแถวผิด/เกิดช่องว่าง) —
 *     เมื่อ pin ครบทั้ง 2 แกน ค่า order จึงไม่มีผลที่ breakpoint นี้ (คงไว้เผื่ออ่านง่าย ไม่กระทบ)
 *
 * รู้ scope: ไม่มี saveFormId ที่ FullscreenPageHeader (คำสั่ง batch นี้ — action อยู่ bottom เสมอ บน mobile;
 * tablet/desktop ใช้การ์ด "เผยแพร่" แทน)
 *
 * known-gap (ไม่แก้ในงานนี้ — นอก scope api/service): SellerAuctionDTO (@/services/auction.service)
 * ไม่มี field `productId` ใน response เลย (มีแค่ตอน create/update input) → edit mode
 * แสดง select "สินค้าในร้าน" เป็นค่าว่างเสมอ (ไม่ auto-select สินค้าที่เชื่อมไว้เดิม) แต่ไม่กระทบข้อมูล
 * เพราะถ้าไม่แตะ select นี้ body.productId จะเป็น undefined → server คงค่าเดิมไว้ (ไม่ล้าง)
 */
import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import * as Yup from 'yup'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import type { SellerAuctionDTO } from '@/services/auction.service'
import AuctionBasicCard from './AuctionBasicCard'
import AuctionImageCard from './AuctionImageCard'
import AuctionPriceCard from './AuctionPriceCard'
import AuctionTimeCard from './AuctionTimeCard'
import type { AuctionFormValues, AuctionFormProductOption } from './AuctionForm.types'

const MIN_END_LEAD_MS = 30 * 60 * 1000 // ตรงกับ MIN_AUCTION_END_LEAD_MS ใน @/lib/validations

// datetime-local value ("YYYY-MM-DDTHH:mm") → epoch ms; parse ไม่ได้ = NaN
function toMs(dtLocal: string): number {
  const t = new Date(dtLocal).getTime()
  return Number.isNaN(t) ? NaN : t
}

// epoch ms → datetime-local value (local browser timezone — round-trip ถูกต้องเพราะ input
// type="datetime-local" ตีความ value เป็น local time เสมอ ไม่ว่า timezone ไหน)
function msToDatetimeLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Yup schema — mirror ของ CreateAuctionSchema/UpdateAuctionSchema (@/lib/validations, Valibot ฝั่ง server) ──
const schema = Yup.object({
  title: Yup.string()
    .trim()
    .min(1, 'ใส่ชื่อประมูลก่อนนะคะ')
    .max(200, 'ชื่อยาวเกินไป (ไม่เกิน 200 ตัวอักษร)')
    .required('ใส่ชื่อประมูลก่อนนะคะ'),
  category: Yup.string()
    .oneOf(SHOP_CATEGORY_KEYS as unknown as string[], 'เลือกหมวดหมู่ก่อนนะคะ')
    .required('เลือกหมวดหมู่ก่อนนะคะ'),
  productId: Yup.string().default(''),
  description: Yup.string().max(5000, 'คำอธิบายยาวเกินไป (ไม่เกิน 5000 ตัวอักษร)').default(''),
  images: Yup.array()
    .of(Yup.string().required().max(300))
    .min(1, 'ใส่รูปอย่างน้อย 1 ใบ')
    .max(10, 'ใส่ได้มากที่สุด 10 รูปค่ะ')
    .default([]),
  startPrice: Yup.number()
    .typeError('ใส่ราคาเริ่มต้นก่อนนะคะ')
    .positive('ราคาเริ่มต้นต้องมากกว่า 0 บาท')
    .required('ใส่ราคาเริ่มต้นก่อนนะคะ'),
  bidIncrement: Yup.number()
    .typeError('ใส่ขั้นบิดก่อนนะคะ')
    .positive('ขั้นบิดต้องมากกว่า 0 บาท')
    .required('ใส่ขั้นบิดก่อนนะคะ'),
  reservePrice: Yup.number()
    .nullable()
    .default(null)
    .positive('ราคาขั้นต่ำต้องมากกว่า 0 บาท')
    .test('reserve-gte-start', 'ราคาขั้นต่ำ (reserve) ต้องไม่ต่ำกว่าราคาเริ่มต้น', function (v) {
      if (v == null) return true
      const startPrice = this.parent.startPrice
      return typeof startPrice !== 'number' || Number.isNaN(startPrice) || v >= startPrice
    }),
  buyNowPrice: Yup.number()
    .nullable()
    .default(null)
    .positive('ราคาซื้อทันทีต้องมากกว่า 0 บาท')
    .test('buynow-gt-floor', 'ราคาซื้อทันทีต้องสูงกว่าราคาขั้นต่ำ/ราคาเริ่มต้น', function (v) {
      if (v == null) return true
      const floor = this.parent.reservePrice ?? this.parent.startPrice
      return typeof floor !== 'number' || Number.isNaN(floor) || v > floor
    }),
  expectedPrice: Yup.number()
    .nullable()
    .default(null)
    .positive('ยอดที่คาดหวังต้องมากกว่า 0 บาท'),
  scheduleType: Yup.string().oneOf(['now', 'schedule']).required().default('now'),
  startTime: Yup.string()
    .default('')
    .test('required-if-schedule', 'ใส่เวลาที่จะเปิดประมูล', function (v) {
      if (this.parent.scheduleType !== 'schedule') return true
      return !!v
    })
    .test('start-future', 'เวลาที่เปิดต้องอยู่ในอนาคต', function (v) {
      if (this.parent.scheduleType !== 'schedule' || !v) return true
      return toMs(v) > Date.now()
    })
    .test('start-before-end', 'เวลาที่เปิดต้องอยู่ก่อนเวลาปิด', function (v) {
      if (this.parent.scheduleType !== 'schedule' || !v || !this.parent.endTime) return true
      return toMs(v) < toMs(this.parent.endTime)
    }),
  endTime: Yup.string()
    .required('ใส่เวลาปิดประมูลก่อนนะคะ')
    .test('end-lead', 'เวลาปิดต้องอยู่ในอนาคตอย่างน้อย 30 นาที', (v) => {
      if (!v) return false
      return toMs(v) >= Date.now() + MIN_END_LEAD_MS
    }),
})

interface AuctionFormProps {
  mode: 'create' | 'edit'
  products: AuctionFormProductOption[]
  /** create เท่านั้น — false = ยังไม่ผ่าน L2 → ฟอร์ม disabled + banner (route/service เช็คซ้ำเสมอ) */
  hasL2?: boolean
  /** edit เท่านั้น — auction ปัจจุบัน (SellerAuctionDTO) สำหรับ prefill */
  auction?: SellerAuctionDTO
}

export default function AuctionForm({ mode, products, hasL2 = true, auction }: AuctionFormProps) {
  const router = useRouter()
  const isEdit = mode === 'edit'
  const formDisabled = !isEdit && !hasL2

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AuctionFormValues>({
    resolver: yupResolver(schema) as any,
    mode: 'onTouched',
    defaultValues: {
      title: auction?.title ?? '',
      category: auction?.category ?? '',
      productId: '', // known-gap — DTO ไม่มี productId (ดู JSDoc บนสุด)
      description: auction?.description ?? '',
      images: auction?.images ?? [],
      // edit prefill: currentPrice ใช้แทน startPrice ได้เพราะ draft/scheduled ยังไม่มี bid
      // (bidCount ต้องเป็น 0 เสมอ — bid เข้าได้เฉพาะ status='live') → currentPrice === startPrice เดิม
      startPrice: auction ? Number(auction.currentPrice) : (undefined as unknown as number),
      bidIncrement: auction ? Number(auction.bidIncrement) : (undefined as unknown as number),
      reservePrice: auction?.reservePrice ?? null,
      buyNowPrice: auction?.buyNowPrice ?? null,
      expectedPrice: auction?.expectedPrice ?? null,
      scheduleType: auction?.startTimeMs ? 'schedule' : 'now',
      startTime: auction?.startTimeMs ? msToDatetimeLocal(auction.startTimeMs) : '',
      endTime: auction?.endTimeMs ? msToDatetimeLocal(auction.endTimeMs) : '',
    },
  })

  const [pendingIntent, setPendingIntent] = useState<'draft' | 'publish' | 'edit' | null>(null)

  const buildCommonBody = (values: AuctionFormValues) => ({
    title: values.title,
    // ค่าว่าง → undefined (ไม่ส่ง key) — ตรง pattern เดียวกับ ProductFormV2 (edit ก็ไม่รองรับล้างค่าว่าง
    // เป็นข้อจำกัดเดิมของระบบ ไม่ใช่ regression ของงานนี้)
    description: values.description ? values.description : undefined,
    images: values.images,
    category: values.category ? values.category : undefined,
    productId: values.productId ? values.productId : undefined,
    startPrice: values.startPrice,
    bidIncrement: values.bidIncrement,
    // reservePrice/buyNowPrice/expectedPrice: schema (Valibot) รับแค่ number หรือไม่ส่ง key เลย
    // (ไม่รองรับส่ง null เพื่อ "ล้างค่า") — ค่าว่างในฟอร์ม → undefined เสมอ ทั้ง create/edit
    reservePrice: values.reservePrice ?? undefined,
    buyNowPrice: values.buyNowPrice ?? undefined,
    expectedPrice: values.expectedPrice ?? undefined,
  })

  const submitCreate = async (values: AuctionFormValues, intent: 'draft' | 'publish') => {
    const auctionMode = intent === 'draft' ? 'draft' : values.scheduleType === 'schedule' ? 'schedule' : 'publishNow'
    const body: Record<string, unknown> = {
      ...buildCommonBody(values),
      mode: auctionMode,
      startTime: auctionMode === 'schedule' ? new Date(values.startTime).toISOString() : undefined,
      endTime: new Date(values.endTime).toISOString(),
    }

    try {
      setPendingIntent(intent)
      const res = await fetch('/api/seller/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'สร้างประมูลไม่สำเร็จ ลองใหม่อีกครั้งนะคะ')
        return
      }
      pacesToast.success(intent === 'draft' ? 'บันทึกร่างแล้ว' : 'เผยแพร่ประมูลแล้ว')
      router.push('/auctions')
      router.refresh()
    } catch {
      pacesToast.error('สร้างประมูลไม่สำเร็จ ลองใหม่อีกครั้งนะคะ')
    } finally {
      setPendingIntent(null)
    }
  }

  const submitEdit = async (values: AuctionFormValues) => {
    if (!auction) return
    const body: Record<string, unknown> = {
      ...buildCommonBody(values),
      endTime: new Date(values.endTime).toISOString(),
      // ไม่ส่ง startTime — UpdateAuctionSchema (@/lib/validations) ไม่มี field นี้ (แก้ไม่ได้หลังสร้าง)
    }

    try {
      setPendingIntent('edit')
      const res = await fetch(`/api/seller/auctions/${auction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'บันทึกการแก้ไขไม่สำเร็จ ลองใหม่อีกครั้งนะคะ')
        return
      }
      pacesToast.success('บันทึกการแก้ไขแล้ว')
      router.push('/auctions')
      router.refresh()
    } catch {
      pacesToast.error('บันทึกการแก้ไขไม่สำเร็จ ลองใหม่อีกครั้งนะคะ')
    } finally {
      setPendingIntent(null)
    }
  }

  return (
    <form noValidate className="mx-auto w-full max-w-2xl pb-28 md:max-w-3xl md:pb-8 lg:max-w-6xl">
      {/* L2 guard banner — create เท่านั้น (server เช็คซ้ำเสมอ นี่แค่ shortcut ฝั่ง client) */}
      {formDisabled && (
        <div className="bg-warning/15 border-warning text-warning mb-4 flex items-center gap-3 rounded-lg border p-4">
          <Icon icon="alert-triangle" className="size-6 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">ต้องยืนยันตัวตนระดับ L2 ก่อนเปิดประมูล</p>
            <p className="text-sm">ยืนยันตัวตนให้เรียบร้อยก่อน ถึงจะสร้างรายการประมูลได้ค่ะ</p>
          </div>
          <Link href="/verification" className="btn bg-warning shrink-0 px-4 py-2 text-sm font-semibold text-white">
            ไปยืนยันตัวตน
          </Link>
        </div>
      )}

      {/* edit mode: auction ไม่ใช่ draft/scheduled แล้ว → banner แจ้งแก้ไม่ได้ (page ควรกันไม่ให้มาถึงตรงนี้
          อยู่แล้ว — เผื่อ defensive แสดงซ้ำถ้ามี prop ผิดคาด) */}
      <fieldset
        disabled={formDisabled || isSubmitting}
        className="grid grid-cols-1 gap-base lg:grid-cols-3 lg:items-start"
      >
        {/* 1. ข้อมูลพื้นฐาน — mobile: ลำดับแรกเสมอ (ไม่มี order) · tablet: order-1 · desktop: ซ้าย col1-2 แถว1 */}
        <div className="md:order-1 lg:order-none lg:col-start-1 lg:col-span-2 lg:row-start-1">
          <AuctionBasicCard register={register} errors={errors} products={products} disabled={formDisabled} />
        </div>

        {/* 2. รูปภาพ — mobile: ลำดับ 2 (ตำแหน่งเดิม ระหว่าง Basic/Price) · tablet: ท้ายสุด (order-4) ·
            desktop: รางขวา sticky แถว 1 (คู่กับการ์ดเผยแพร่ที่ row-start-2) */}
        <div className="md:order-4 lg:order-none lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:sticky lg:top-24 lg:self-start">
          <Controller
            control={control}
            name="images"
            render={({ field }) => (
              <AuctionImageCard value={field.value ?? []} onChange={field.onChange} error={errors.images?.message} />
            )}
          />
        </div>

        {/* 3. ราคา — tablet: order-2 (ต่อจาก Basic) · desktop: ซ้าย col1-2 แถว 2 */}
        <div className="md:order-2 lg:order-none lg:col-start-1 lg:col-span-2 lg:row-start-2">
          <AuctionPriceCard control={control} errors={errors} disabled={formDisabled} />
        </div>

        {/* 4. เวลาประมูล — tablet: order-3 · desktop: ซ้าย col1-2 แถว 3 */}
        <div className="md:order-3 lg:order-none lg:col-start-1 lg:col-span-2 lg:row-start-3">
          <AuctionTimeCard
            mode={mode}
            register={register}
            errors={errors}
            watch={watch}
            disabled={formDisabled}
            scheduledStartLabel={
              isEdit && auction?.startTimeMs ? formatDateTime(new Date(auction.startTimeMs)) : null
            }
          />
        </div>

        {/* 5. การ์ด "เผยแพร่" — mobile: ซ่อน (ใช้ fixed bottom bar แทน) · tablet: ท้ายสุด (order-5) ·
            desktop: รางขวา sticky แถว 2 (ใต้รูปภาพ) — ปุ่ม/handler reuse ของเดิมจาก fixed bottom bar */}
        <div className="hidden md:order-5 md:block lg:order-none lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:sticky lg:top-24 lg:self-start">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title flex items-center gap-2">
                <Icon icon="rocket" className="text-primary size-5" />
                เผยแพร่
              </h4>
            </div>
            <div className="card-body flex flex-col gap-3">
              {!isEdit ? (
                <>
                  <button
                    type="button"
                    disabled={formDisabled || isSubmitting}
                    onClick={handleSubmit((v) => submitCreate(v, 'publish'))}
                    className="btn bg-primary hover:bg-primary-hover inline-flex min-h-12 w-full items-center justify-center gap-2 font-semibold text-white disabled:opacity-60"
                  >
                    {isSubmitting && pendingIntent === 'publish' ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Icon icon="circle-check-filled" className="size-4" />
                    )}
                    เผยแพร่ประมูล
                  </button>
                  <button
                    type="button"
                    disabled={formDisabled || isSubmitting}
                    onClick={handleSubmit((v) => submitCreate(v, 'draft'))}
                    className="btn border-default-300 text-default-700 hover:bg-default-50 inline-flex min-h-12 w-full items-center justify-center gap-2 font-semibold disabled:opacity-60"
                  >
                    {isSubmitting && pendingIntent === 'draft' ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-default-300 border-t-default-700" />
                    ) : null}
                    บันทึกร่าง
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit((v) => submitEdit(v))}
                  className="btn bg-primary hover:bg-primary-hover inline-flex min-h-12 w-full items-center justify-center gap-2 font-semibold text-white disabled:opacity-60"
                >
                  {isSubmitting && pendingIntent === 'edit' ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : null}
                  บันทึกการแก้ไข
                </button>
              )}
            </div>
          </div>
        </div>
      </fieldset>

      {/* Sticky bottom footer — mobile เท่านั้น (md:hidden); tablet/desktop ใช้การ์ด "เผยแพร่" ด้านบนแทน
          (ไม่ใช้ saveFormId ที่ FullscreenPageHeader) */}
      {/* pb = p-3 (0.75rem) + safe-area: fixed bottom-0 → ตั้งแต่เปิด viewportFit:'cover' (2026-08-06)
          ปุ่มจะไปนอนใต้แถบ home indicator ถ้าไม่เว้น inset */}
      <div className="bg-card border-default-100 fixed bottom-0 inset-x-0 z-20 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden"> {/* carve-out: safe-area ไม่มี token */}
        <div className="mx-auto flex w-full max-w-2xl gap-3">
          {!isEdit ? (
            <>
              <button
                type="button"
                disabled={formDisabled || isSubmitting}
                onClick={handleSubmit((v) => submitCreate(v, 'draft'))}
                className="btn border-default-300 text-default-700 hover:bg-default-50 inline-flex min-h-12 flex-1 items-center justify-center gap-2 font-semibold disabled:opacity-60"
              >
                {isSubmitting && pendingIntent === 'draft' ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-default-300 border-t-default-700" />
                ) : null}
                บันทึกร่าง
              </button>
              <button
                type="button"
                disabled={formDisabled || isSubmitting}
                onClick={handleSubmit((v) => submitCreate(v, 'publish'))}
                className="btn bg-primary hover:bg-primary-hover inline-flex min-h-12 flex-1 items-center justify-center gap-2 font-semibold text-white disabled:opacity-60"
              >
                {isSubmitting && pendingIntent === 'publish' ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : null}
                เผยแพร่
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((v) => submitEdit(v))}
              className="btn bg-primary hover:bg-primary-hover inline-flex min-h-12 w-full items-center justify-center gap-2 font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting && pendingIntent === 'edit' ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              บันทึกการแก้ไข
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
