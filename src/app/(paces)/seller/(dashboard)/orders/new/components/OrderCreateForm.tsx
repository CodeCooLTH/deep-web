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
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { pacesToast } from '@/lib/paces-toast'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import ProductGrid from './ProductGrid'
import CartPanel from './CartPanel'
import QuickForm from './QuickForm'


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
  /** Product.sku — ใช้ค้นหาใน ProductPickerSheet (ชื่อ + SKU); optional */
  sku?: string | null
  /** Product.stockQty — NULL = untracked (ไม่โชว์สต็อก), number = tracked (โชว์เมื่อ inventoryEnabled) */
  stockQty?: number | null
}

interface Props {
  shopId: string
  catalog: CatalogProduct[]
  /** สินค้าขายดี (เรียงยอดขาย desc) — โชว์ใน quick create ProductPickerSheet (< lg) */
  bestSellers?: CatalogProduct[]
  /** HTML id assigned to the <form> element so an external submit button can use form="…" */
  formId?: string
  /** ร้านเปิด Inventory Add-on ไหม — ถ้าเปิด แสดงสต็อกคงเหลือ + เตือน qty เกินสต็อก */
  inventoryEnabled?: boolean
}

// ─── ItemsController — helper set ที่ OrderCreateForm (form owner) ส่งเป็น prop ให้ POS components ──
// ยก ownership useFieldArray('items') ขึ้นมาที่ form เพื่อให้ ProductGrid + CartPanel/CartLineItem ใช้ร่วมกัน
export interface ItemsController {
  fields: { id: string; productId?: string; name: string; description?: string; qty: number; price: number }[]
  /** เพิ่ม line ถ้ายังไม่มี product นี้, ไม่งั้น +1 qty (ใช้โดย ProductGrid แตะการ์ด) */
  inc: (product: CatalogProduct) => void
  remove: (index: number) => void
  /** append custom item ว่าง (productId undefined) */
  addCustom: () => void
  /** qty ปัจจุบันของ product (0 ถ้าไม่อยู่ในตะกร้า) */
  qtyByProduct: (productId: string) => number
  /** combobox เลือกสินค้า existing → set productId/name/price/description ของ line */
  setLineProduct: (index: number, product: CatalogProduct) => void
  /** combobox พิมพ์ชื่อใหม่ → set name, productId=undefined (custom item) */
  setLineCustom: (index: number, name: string) => void
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

export default function OrderCreateForm({ shopId: _shopId, catalog, bestSellers = [], formId, inventoryEnabled = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: yupResolver(schema) as any,
    defaultValues: {
      buyerName: '',
      buyerContact: '',
      items: [],
      // default ตรงกับ quick create ChannelPaymentSelect (STOREFRONT/CASH); localStorage override ตอน mount ด้านล่าง
      salesChannel: 'STOREFRONT',
      paymentMethod: 'CASH',
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

  // ── Items ownership (POS) — useFieldArray + helpers ที่แชร์ให้ ProductGrid + CartPanel ──
  const { fields, append, update, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = (useWatch({ control, name: 'items' }) ?? []) as FormValues['items']

  const qtyByProduct = (pid: string): number =>
    watchedItems.find((i) => i.productId === pid)?.qty ?? 0

  const inc = (product: CatalogProduct) => {
    const idx = watchedItems.findIndex((i) => i.productId === product.id)
    if (idx >= 0) update(idx, { ...watchedItems[idx], qty: watchedItems[idx].qty + 1 })
    else
      append({
        productId: product.id,
        name: product.name,
        description: product.description ?? '',
        qty: 1,
        price: Number(product.price),
      })
  }

  const addCustom = () =>
    append({ productId: undefined, name: '', description: '', qty: 1, price: 0 })

  const setLineProduct = (index: number, product: CatalogProduct) =>
    update(index, {
      ...watchedItems[index],
      productId: product.id,
      name: product.name,
      description: product.description ?? '',
      price: Number(product.price),
    })

  const setLineCustom = (index: number, name: string) =>
    update(index, { ...watchedItems[index], productId: undefined, name })

  const itemsCtl: ItemsController = {
    fields,
    inc,
    remove,
    addCustom,
    qtyByProduct,
    setLineProduct,
    setLineCustom,
  }

  // ── Pre-add จาก deep-link ?product=<id> (Command Center "สินค้าขายดี") ──
  // เพิ่มสินค้าลงตะกร้าครั้งเดียวตอน mount; guard ref กัน inc ซ้ำเมื่อ re-render
  const didPreAdd = useRef(false)
  useEffect(() => {
    if (didPreAdd.current) return
    const pid = searchParams.get('product')
    if (!pid) return
    const p = catalog.find((c) => c.id === pid)
    if (p) {
      inc(p)
      didPreAdd.current = true
    }
    // inc/catalog อ้างผ่าน closure — guard didPreAdd กัน re-run; ตั้งใจ deps แค่ searchParams
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── ★ default channel/payment ที่ seller ตั้งไว้ (localStorage) → override ตอน mount (client-only) ──
  // key ตรงกับ ChannelPaymentSelect (DEFAULT_CHANNEL_KEY/DEFAULT_PAYMENT_KEY); ใส่ใน useForm defaultValues ไม่ได้ (SSR ไม่มี window)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ch = localStorage.getItem('deep.default.salesChannel')
    const pm = localStorage.getItem('deep.default.paymentMethod')
    if (ch) setValue('salesChannel', ch)
    if (pm) setValue('paymentMethod', pm)
    // รันครั้งเดียวตอน mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── สรุปยอด (ส่งเข้า QuickForm footer < lg + CartPanel ≥ lg) ────────────────
  const barDiscount = useWatch({ control, name: 'discount' }) as number | undefined
  const barVatRate = useWatch({ control, name: 'vatRate' }) as number | undefined
  const barSubtotal = watchedItems.reduce(
    (s, i) => s + (Number(i?.qty) || 0) * (Number(i?.price) || 0),
    0,
  )
  const barTotal = round2((barSubtotal - (barDiscount ?? 0)) * (1 + (barVatRate ?? 0) / 100))

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
    // ยกเว้นช่องทาง "หน้าร้าน" (STOREFRONT) — รับสินค้าที่ร้าน ไม่ต้องมีที่อยู่จัดส่ง
    const needsShipping =
      values.salesChannel !== 'STOREFRONT' &&
      values.items.some((item) => {
        if (!item.productId) return true
        return catalog.find((p) => p.id === item.productId)?.fulfillmentMode === 'SHIPPED'
      })

    // ── FR-6.5: ออเดอร์ที่ต้องจัดส่งต้องมีที่อยู่ครบขั้นต่ำ (ที่อยู่ + จังหวัด + รหัสไปรษณีย์) ──
    // server enforce ซ้ำที่ createOrder (single source) — นี่คือ UX surface ก่อน submit
    if (needsShipping) {
      const a = values.shippingAddress
      let missing = false
      if (!a?.line1?.trim()) { setError('shippingAddress.line1', { message: 'กรุณากรอกที่อยู่' }); missing = true }
      if (!a?.province?.trim()) { setError('shippingAddress.province', { message: 'กรุณากรอกจังหวัด' }); missing = true }
      if (!a?.postcode?.trim()) { setError('shippingAddress.postcode', { message: 'กรุณากรอกรหัสไปรษณีย์' }); missing = true }
      if (missing) {
        pacesToast.error('ออเดอร์ที่ต้องจัดส่งต้องระบุที่อยู่จัดส่ง (ที่อยู่ / จังหวัด / รหัสไปรษณีย์)')
        return
      }
    }

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
        pacesToast.error(data?.error ?? 'สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      const order = await res.json()
      const token = order?.publicToken ?? order?.order?.publicToken
      pacesToast.success('สร้างออเดอร์แล้ว แชร์ลิงก์ให้ผู้ซื้อ')
      if (token) {
        router.push(`/orders/${token}`)
      } else {
        router.push('/orders')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // grid lg:grid-cols-3 ตาม mockup create.html line 52:
  //   left (lg:col-span-2) = BLOCK1 + BLOCK2 + BLOCK3 (stacked in space-y-4 / gap-5)
  //   right (lg:col-span-1) = sticky summary panel
  //
  // M0-b: pb-20 บน form wrapper กัน sticky bottom bar ทับ content ล่างสุด (mobile)
  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit, (formErrors) => {
        // scroll ไป field ที่ error แรก — กันคีย์บอร์ดมือถือบัง error ที่มองไม่เห็น
        const first = Object.keys(formErrors)[0]
        if (first) {
          document.querySelector(`[name="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      })}
      noValidate
      className="pb-24 lg:pb-0 scroll-pb-24"
    >
      {/* Loading indicator ระหว่าง submit */}
      {isSubmitting && (
        <div className="mb-4 flex items-center gap-2 text-sm text-default-500">
          <Icon icon="loader-2" className="animate-spin" width={16} height={16} />
          กำลังสร้างออเดอร์...
        </div>
      )}

      {/* ═══ Render: < lg = QuickForm (inline), ≥ lg = POS split ═══ */}

      {/* < lg (มือถือ+แท็บเล็ต): QuickForm inline scroll (T4-T8 เติมเนื้อ section) */}
      <div className="lg:hidden">
        <QuickForm
          control={control}
          errors={errors}
          setValue={setValue}
          catalog={catalog}
          bestSellers={bestSellers}
          itemsCtl={itemsCtl}
          formId={formId}
          inventoryEnabled={inventoryEnabled}
          subtotal={barSubtotal}
          total={barTotal}
        />
      </div>

      {/* ≥ lg (เดสก์ท็อป): POS split — ซ้าย product grid, ขวา cart panel (เนื้อในไม่แตะ)
          grid 2-col 50/50 ล็อกสูงเท่าจอ → แต่ละแพน scroll แยก, footer (ปุ่มบันทึก) ตรึงล่างเสมอ.
          h-[calc(100vh-9.5rem)] = HR7 exception (viewport-lock: 100vh − header ~68px − margin; Paces ไม่มี token) */}
      <div className="hidden lg:grid lg:h-[calc(100vh-9.5rem)] lg:grid-cols-2 lg:gap-4 lg:overflow-hidden">
        <div className="min-w-0 lg:h-full lg:overflow-y-auto">
          <ProductGrid catalog={catalog} qtyByProduct={itemsCtl.qtyByProduct} inc={itemsCtl.inc} inventoryEnabled={inventoryEnabled} />
        </div>
        <div className="lg:h-full">
          <CartPanel control={control} catalog={catalog} itemsCtl={itemsCtl} errors={errors} formId={formId} inventoryEnabled={inventoryEnabled} />
        </div>
      </div>
    </form>
  )
}
