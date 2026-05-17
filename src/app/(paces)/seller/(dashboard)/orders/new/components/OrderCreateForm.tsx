/**
 * OrderCreateForm — ฟอร์มสร้างออเดอร์ (B7 rewrite)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx
 * Layout grid lg:grid-cols-3 (left col-span-2 = 3 blocks, right col-span-1 = summary panel) ได้จาก mockup create.html.
 * เนื้อหาแต่ละ block แยก component: CustomerSelectBlock / PaymentChannelBlock / CartBlock / OrderSummaryPanel.
 * onSubmit mapping รวม vatRate/100 + computed vatAmount + derivedType + conditional shippingAddress.
 *
 * B7: ลบ type select + flat SECTION 1/2/3 เดิมออกทั้งหมด — แทนด้วย 4 blocks.
 * CartBlock เป็น owner ของ useFieldArray('items') + ProductPickerModal — ไม่ render ซ้ำที่นี่.
 */
'use client'

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import CustomerSelectBlock from './CustomerSelectBlock'
import PaymentChannelBlock from './PaymentChannelBlock'
import CartBlock from './CartBlock'
import OrderSummaryPanel from './OrderSummaryPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogProduct {
  id: string
  name: string
  description?: string | null
  price: number
  type: string
  /** Product.fulfillmentMode (SHIPPED | NO_SHIPPING) — ใช้ derive ที่อยู่จัดส่ง + indicator */
  fulfillmentMode: string
  image?: string | null
}

interface Props {
  shopId: string
  catalog: CatalogProduct[]
  /** HTML id assigned to the <form> element so an external submit button can use form="…" */
  formId?: string
}

// ─── Locked FormValues (exported — 4 block files import CatalogProduct; B7 exports FormValues ด้วย) ──

export interface FormValues {
  buyerName: string
  buyerContact?: string
  items: { productId?: string; name: string; description?: string; qty: number; price: number }[]
  salesChannel?: string        // STOREFRONT|FACEBOOK|LINE|TIKTOK|OTHER
  paymentMethod?: string       // CASH|TRANSFER|PROMPTPAY|CARD|COD|OTHER
  internalNote?: string
  discount?: number            // baht ≥0
  vatRate?: number             // PERCENT as typed (e.g. 7); convert to 0..1 at submit
  shippingAddress?: {
    line1?: string
    subdistrict?: string
    district?: string
    province?: string
    postcode?: string
    note?: string
  }
}

// ─── itemSchema — ใช้ใน Yup schema + ยืม pattern ของ OrderCreateForm เดิม ────

const itemSchema = Yup.object({
  productId: Yup.string().optional(),
  name: Yup.string().min(1, 'กรุณากรอกชื่อสินค้า').required('กรุณากรอกชื่อสินค้า'),
  description: Yup.string().optional(),
  qty: Yup.number()
    .typeError('กรุณากรอกจำนวน')
    .integer('จำนวนต้องเป็นจำนวนเต็ม')
    .min(1, 'จำนวนอย่างน้อย 1')
    .required('กรุณากรอกจำนวน'),
  price: Yup.number()
    .typeError('กรุณากรอกราคา')
    .min(0.01, 'ราคาต้องมากกว่า 0')
    .required('กรุณากรอกราคา'),
})

// ─── Yup schema สำหรับ FormValues ───────────────────────────────────────────

const schema = Yup.object({
  buyerName: Yup.string().required('กรุณากรอกชื่อลูกค้า'),
  buyerContact: Yup.string()
    .optional()
    .test('phone-or-email', 'ต้องเป็นเบอร์ไทย (0xxxxxxxxx) หรืออีเมล', (val) => {
      if (!val || val.trim() === '') return true
      const phoneOk = /^0[0-9]{9}$/.test(val.trim())
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())
      return phoneOk || emailOk
    }),
  items: Yup.array(itemSchema).min(1, 'ต้องมีสินค้าอย่างน้อย 1 รายการ').required(),
  salesChannel: Yup.string()
    .oneOf(['STOREFRONT', 'FACEBOOK', 'LINE', 'TIKTOK', 'OTHER'])
    .optional(),
  paymentMethod: Yup.string()
    .oneOf(['CASH', 'TRANSFER', 'PROMPTPAY', 'CARD', 'COD', 'OTHER'])
    .optional(),
  internalNote: Yup.string().optional(),
  discount: Yup.number()
    .min(0, 'ส่วนลดต้องไม่ติดลบ')
    .transform((v) => (isNaN(v) ? undefined : v))
    .nullable()
    .optional(),
  vatRate: Yup.number()
    .min(0, 'VAT ต้องไม่ติดลบ')
    .max(100, 'VAT ต้องไม่เกิน 100%')
    .transform((v) => (isNaN(v) ? undefined : v))
    .nullable()
    .optional(),
  shippingAddress: Yup.object({
    line1: Yup.string().optional(),
    subdistrict: Yup.string().optional(),
    district: Yup.string().optional(),
    province: Yup.string().optional(),
    postcode: Yup.string().optional(),
    note: Yup.string().optional(),
  }).optional(),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderCreateForm({ shopId: _shopId, catalog, formId }: Props) {
  const router = useRouter()

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: yupResolver(schema) as any,
    defaultValues: {
      buyerName: '',
      buyerContact: '',
      items: [],
      salesChannel: undefined,
      paymentMethod: undefined,
      internalNote: '',
      discount: undefined,
      vatRate: undefined,
      shippingAddress: {
        line1: '',
        subdistrict: '',
        district: '',
        province: '',
        postcode: '',
        note: '',
      },
    },
  })

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    // ── คำนวณ subtotal ──────────────────────────────────────────────────────
    const subtotal = values.items.reduce((sum, item) => {
      return sum + (Number(item.qty) || 0) * (Number(item.price) || 0)
    }, 0)

    // ── derivedType: PHYSICAL > SERVICE > DIGITAL ──────────────────────────
    // ถ้ามี item ที่ไม่มี productId (custom) หรือ catalog type === 'PHYSICAL' → PHYSICAL
    // else ถ้ามี SERVICE → SERVICE; else DIGITAL
    const hasPhysical = values.items.some((item) => {
      if (!item.productId) return true
      return catalog.find((p) => p.id === item.productId)?.type === 'PHYSICAL'
    })
    const derivedType: string = hasPhysical
      ? 'PHYSICAL'
      : values.items.some(
            (item) =>
              item.productId &&
              catalog.find((p) => p.id === item.productId)?.type === 'SERVICE',
          )
        ? 'SERVICE'
        : 'DIGITAL'

    // ── needsShipping: มี item ที่ fulfillmentMode === 'SHIPPED' หรือ custom item ──
    const needsShipping = values.items.some((item) => {
      if (!item.productId) return true
      return catalog.find((p) => p.id === item.productId)?.fulfillmentMode === 'SHIPPED'
    })

    // ── vatAmount (ส่ง undefined ถ้าไม่มี VAT) ─────────────────────────────
    const vatAmount =
      values.vatRate != null && values.vatRate > 0
        ? round2((subtotal - (values.discount ?? 0)) * (values.vatRate / 100))
        : undefined

    // ── Body — mirror CreateOrderSchema field names (validated against validations.ts) ─
    // buyerName, buyerContact, salesChannel, internalNote, discount,
    // vatRate (0..1), vatAmount, shippingAddress (new keys: subdistrict/district/postcode)
    const { buyerContact, buyerName, salesChannel, paymentMethod, internalNote, discount, vatRate, shippingAddress } = values

    // ตัด subfield ที่เป็น '' ออกก่อนส่ง — กัน JSON column shippingAddress มี key ว่างเปล่า
    const cleanShipping = shippingAddress
      ? Object.fromEntries(
          Object.entries(shippingAddress).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
        )
      : {}
    const hasShippingData = Object.keys(cleanShipping).length > 0
    const body = {
      type: derivedType,
      items: values.items.map((item) => ({
        ...(item.productId ? { productId: item.productId } : {}),
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        qty: item.qty,
        price: item.price,
      })),
      ...(buyerContact ? { buyerContact } : {}),
      ...(buyerName ? { buyerName } : {}),
      ...(salesChannel ? { salesChannel } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(internalNote ? { internalNote } : {}),
      ...(discount != null ? { discount } : {}),
      // vatRate ส่ง API เป็น decimal (0..1) ตาม CreateOrderSchema vatRate maxValue(1)
      ...(vatRate != null && vatRate > 0 ? { vatRate: vatRate / 100 } : {}),
      ...(vatAmount != null ? { vatAmount } : {}),
      ...(needsShipping && hasShippingData ? { shippingAddress: cleanShipping } : {}),
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      const order = await res.json()
      const token = order?.publicToken ?? order?.order?.publicToken
      toast.success('สร้างออเดอร์แล้ว แชร์ลิงก์ให้ผู้ซื้อ')
      if (token) {
        router.push(`/orders/${token}`)
      } else {
        router.push('/orders')
      }
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // grid lg:grid-cols-3 ตาม mockup create.html line 52:
  //   left (lg:col-span-2) = BLOCK1 + BLOCK2 + BLOCK3 (stacked in space-y-4 / gap-5)
  //   right (lg:col-span-1) = sticky summary panel
  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {/* Loading indicator ระหว่าง submit */}
      {isSubmitting && (
        <div className="mb-4 flex items-center gap-2 text-sm text-default-500">
          <Icon icon="loader-2" className="animate-spin" width={16} height={16} />
          กำลังสร้างออเดอร์...
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* grid 3 cols: left col-span-2 = 3 blocks, right col-span-1 = summary */}
      {/* (mockup create.html line 52-55)                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* ── LEFT COLUMN: 3 blocks stacked ────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:col-span-2">

          {/* BLOCK 1 — ข้อมูลลูกค้า */}
          <CustomerSelectBlock control={control} errors={errors} />

          {/* BLOCK 2 — การชำระเงิน & ช่องทาง (+ ส่วนลด / VAT / หมายเหตุ) */}
          <PaymentChannelBlock control={control} errors={errors} />

          {/* BLOCK 3 — รายการสินค้า + auto shipping sub-block + ProductPickerModal */}
          {/* CartBlock เป็น owner ของ useFieldArray('items') + ProductPickerModal */}
          <CartBlock control={control} catalog={catalog} errors={errors} />

        </div>

        {/* ── RIGHT COLUMN: sticky summary panel ───────────────────────── */}
        <div className="lg:col-span-1">
          <OrderSummaryPanel control={control} catalog={catalog} />
        </div>

      </div>
    </form>
  )
}
