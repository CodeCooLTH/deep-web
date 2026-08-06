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
import { useEffect, useRef, useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { pacesToast } from '@/lib/paces-toast'
import type { OrderVocab } from '@/lib/seller-menu'
import { runAfterOrderCreate, type IShipCreateMode } from '@/lib/iship/after-order-create'
// feature 00033 — ตัวเดียวกับ SSOT ที่ /orders?stage= ใช้กรอง ห้ามคำนวณ "วันไหน" ซ้ำที่นี่
import { thaiDayKey, formatDateTimeTH } from '@/lib/format-date'
import * as Yup from 'yup'
import ProductGrid from './ProductGrid'
import CartPanel from './CartPanel'
// feature 00024 — บล็อกวันเข้าใช้บริการ (render เฉพาะร้านที่ใช้ระบบนัดหมายได้)
import AppointmentBlock, { type ServiceResourceOption } from './AppointmentBlock'
import type { AppointmentGranularity } from '@/lib/appointments'
import QuickForm from './QuickForm'
import SubmitStatusSheet, { type SubmitStatus } from './SubmitStatusSheet'
import { toDatetimeLocalValue } from './OrderDateRow'


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
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — คำนวณที่ RSC */
  vocab: OrderVocab
  shopId: string
  catalog: CatalogProduct[]
  /** สินค้าขายดี (เรียงยอดขาย desc) — โชว์ใน quick create ProductPickerSheet (< lg) */
  bestSellers?: CatalogProduct[]
  /** HTML id assigned to the <form> element so an external submit button can use form="…" */
  formId?: string
  /** ร้านเปิด Inventory Add-on ไหม — ถ้าเปิด แสดงสต็อกคงเหลือ + เตือน qty เกินสต็อก */
  inventoryEnabled?: boolean
  // feature 00018: prefill + callback เมื่อใช้ในโมดัลสร้างคำสั่งซื้อจากหน้าแชท (reuse ฟอร์มเดิม)
  /** prefill ชื่อลูกค้าจากแชท */
  initialBuyerName?: string
  /** prefill เบอร์/ช่องทางติดต่อจากแชท */
  initialBuyerContact?: string
  /** prefill ช่องทางการขาย (STOREFRONT|FACEBOOK|LINE|TIKTOK) จากช่องทางแชท — ชนะ localStorage default */
  initialSalesChannel?: string
  /**
   * ข้อความจากแชทที่จะ "กระจาย" เป็นชื่อ/เบอร์/ที่อยู่ให้ทันทีที่ฟอร์มเปิด (user สั่ง 2026-08-04)
   * ส่งต่อลง CustomerQuickBlock ซึ่งเป็นเจ้าของทั้ง parseOrderMessage และชีตกระจายอยู่แล้ว —
   * ไม่เขียน logic เติมฟอร์มใหม่ที่นี่ (เส้นเดียวกับที่ปุ่มกระจายของ POS ใช้)
   */
  prefillParseText?: string
  /**
   * โหมดสร้างพัสดุ iShip ของร้าน (feature 00022) — ส่งมาจาก server ตอน render
   * เพื่อไม่ต้องยิงถามทุกครั้งที่เปิดหน้า. ไม่ส่งมา = 'OFF' (ร้านที่ไม่ได้เชื่อมต่อ
   * หรือร้านบ้านพัก จะไม่มีอะไรเกิดขึ้นเลย)
   */
  ishipCreateMode?: IShipCreateMode
  /** เรียกเมื่อสร้างสำเร็จ — ถ้ามี จะไม่ router.push (โมดัลจัดการปิด+refresh เอง); ไม่มี = behavior เดิม (/orders/new) */
  onSuccess?: (token: string | null) => void
  /** feature 00018 (user 2026-07-24): เธรดแชทที่สร้างออเดอร์นี้ — ส่งไป API เพื่อผูก ExternalContact
   *  กับ Customer ทันที (แชทเห็นออเดอร์เลยไม่ต้องรอ buyer login) */
  conversationId?: string
  /** feature (user 2026-07-25): แก้ไขคำสั่งซื้อเดิม — โหลดข้อมูล order นี้เข้าฟอร์มแล้ว submit เป็น PATCH
   *  (แทน POST สร้างใหม่). ใช้ในโมดัลแก้ไขคำสั่งซื้อจากแท็บคำสั่งซื้อในแชท */
  editOrderToken?: string
  /** compact = บังคับ layout มือถือ (QuickForm inline) ทุกขนาดจอ — ใช้ในโมดัลสร้างคำสั่งซื้อในแชท
   *  (POS 3-col เดสก์ท็อปแน่นเกินไปในโมดัล user report 2026-07-24); footer submit sticky ในโมดัล */
  compact?: boolean
  /** feature 00024 — ร้านนี้ใช้ระบบนัดหมายได้ไหม (BUSINESS + GENERAL เท่านั้น, BR-RSV-01)
   *  false = ไม่ render บล็อกวันนัดเลย DOM เหมือนก่อนมีฟีเจอร์นี้ทุกจุด */
  serviceResourcesEnabled?: boolean
  /** feature 00024 — คิวงานที่เปิดใช้งานของร้าน (ส่งมาจาก server ตอน render ไม่ยิงถามฝั่ง client) */
  serviceResources?: ServiceResourceOption[]
  /** feature 00024 FR-RSV-13 — ร้านรับนัดเป็นรายวัน (DAY) หรือระบุช่วงเวลา (TIME) */
  appointmentGranularity?: AppointmentGranularity
  /** feature 00033 — เวลาของข้อความในแชทที่กดสร้างออเดอร์ (ISO string) ใช้เป็นวันที่สั่งซื้อ */
  prefillCreatedAt?: string
  /** feature 00033 — เวลาข้อความต้นทางเก่ากว่าเพดานย้อนหลัง จึงไม่ได้เติมให้ (โชว์ชิปบอกเหตุผลใน OrderDateRow) */
  prefillCreatedAtTooOld?: boolean
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
  // feature 00024 — วันเข้าใช้บริการ (ไม่บังคับ) ไม่เลือกทรัพยากร = ไม่ส่ง appointment เลย
  appointment?: {
    resourceId?: string
    date?: string          // "YYYY-MM-DD" ตามเวลาเครื่อง
    startTime?: string     // "HH:mm"
    endTime?: string       // "HH:mm"
    depositAmount?: number | null
  }
  /** feature 00033 — วันที่สั่งซื้อเป็นค่า datetime-local ("YYYY-MM-DDTHH:mm" เวลาเครื่อง)
   *  undefined = ใช้เวลาปัจจุบัน (ไม่ส่งฟิลด์ไป API เลย → เส้นทางเดิมทุกประการ) */
  orderedAt?: string
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
  // feature 00015 (Order Claim & Forced Login) TFR-009: เบอร์โทรบังคับ — mirror CreateOrderSchema (SSOT)
  buyerContact: Yup.string()
    .required('กรุณากรอกเบอร์โทรลูกค้า')
    .matches(/^0[0-9]{9}$/, 'ต้องเป็นเบอร์โทร 10 หลัก ขึ้นต้นด้วย 0'),
  // แถวเปล่าท้ายลิสต์ (spreadsheet pattern — รอเติมสินค้าใหม่เสมอ) ต้องไม่ถูก validate/ส่งไป backend
  // transform กรองแถวเปล่า (ไม่มี productId + ชื่อว่าง) ออกก่อน itemSchema ตรวจแต่ละแถว → itemSchema
  // เจอเฉพาะแถวที่กรอกจริง; ถ้าเหลือ 0 แถว → min(1) เด้ง "ต้องมีสินค้าอย่างน้อย 1 รายการ"
  // (bug user report 2026-07-24: แถวเปล่าโดน validate ห้ามบันทึก + เพิ่มไม่จบ). แถวเปล่าอยู่ท้ายเสมอ
  // → index ของแถวที่กรอกจริงไม่ขยับ error path จึง map กับแถวที่ render ถูก
  items: Yup.array(itemSchema)
    .transform((value) =>
      Array.isArray(value)
        ? value.filter((it) => it?.productId != null || (it?.name ?? '').toString().trim() !== '')
        : value,
    )
    .min(1, 'ต้องมีสินค้าอย่างน้อย 1 รายการ')
    .required(),
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
  // feature 00024 — ทุกช่องไม่บังคับ; ความถูกต้องเชิงความสัมพันธ์ (เลือกทรัพยากรแล้วต้องมี
  // วัน/เวลา, เวลาสิ้นสุดต้องหลังเวลาเริ่ม) ตรวจตอน submit เพราะต้องดูหลายฟิลด์พร้อมกัน
  appointment: Yup.object({
    resourceId: Yup.string().optional(),
    date: Yup.string().optional(),
    startTime: Yup.string().optional(),
    endTime: Yup.string().optional(),
    depositAmount: Yup.number()
      .min(0, 'มัดจำต้องไม่ติดลบ')
      .transform((v) => (isNaN(v) ? undefined : v))
      .nullable()
      .optional(),
  }).optional(),
})

// ─── Helper ───────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderCreateForm({
  vocab,
  shopId: _shopId,
  catalog,
  bestSellers = [],
  formId,
  inventoryEnabled = false,
  initialBuyerName,
  initialBuyerContact,
  initialSalesChannel,
  prefillParseText,
  onSuccess,
  conversationId,
  editOrderToken,
  compact = false,
  ishipCreateMode = 'OFF',
  serviceResourcesEnabled = false,
  serviceResources = [],
  appointmentGranularity = 'DAY',
  prefillCreatedAt,
  prefillCreatedAtTooOld = false,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Submit status full-bleed sheet (loading/error) — แทน inline loading + toast เดิม ──
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [submitError, setSubmitError] = useState<string>('')

  const {
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: yupResolver(schema) as any,
    defaultValues: {
      buyerName: initialBuyerName ?? '',
      buyerContact: initialBuyerContact ?? '',
      items: [],
      // default ตรงกับ quick create ChannelPaymentSelect (STOREFRONT/CASH); localStorage override ตอน mount ด้านล่าง
      // initialSalesChannel (จากช่องทางแชท) ชนะ default ถ้ามี
      salesChannel: initialSalesChannel ?? 'STOREFRONT',
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
      // feature 00033 — เวลาข้อความในแชท (ถ้ามี) เป็นวันที่สั่งซื้อเริ่มต้น
      orderedAt: prefillCreatedAt ? toDatetimeLocalValue(new Date(prefillCreatedAt)) : undefined,
    },
  })

  // ── แก้ไขคำสั่งซื้อ (user 2026-07-25): โหลดข้อมูล order เดิมเข้าฟอร์ม (reset) เมื่อมี editOrderToken ──
  // editLoaded กันไม่ให้ effect "แถวเปล่ารอเสมอ" เติมแถวก่อน prefill เสร็จ (แล้ว reset ทับ)
  const [editLoaded, setEditLoaded] = useState(!editOrderToken)
  useEffect(() => {
    if (!editOrderToken) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/orders/${editOrderToken}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('load failed')
        const o = await res.json()
        if (cancelled) return
        reset({
          buyerName: o.buyerName ?? '',
          buyerContact: o.buyerContact ?? '',
          items: (o.items ?? []).map((it: { productId: string | null; name: string; description: string | null; qty: number; price: number }) => ({
            productId: it.productId ?? undefined,
            name: it.name,
            description: it.description ?? '',
            qty: it.qty,
            price: it.price,
          })),
          salesChannel: o.salesChannel ?? 'STOREFRONT',
          paymentMethod: o.paymentMethod ?? 'CASH',
          internalNote: o.internalNote ?? '',
          discount: o.discount ?? undefined,
          // DB เก็บ vatRate เป็น decimal 0..1 — ฟอร์มใช้ % → คูณ 100
          vatRate: o.vatRate != null ? Math.round(o.vatRate * 100) : undefined,
          shippingAddress: {
            line1: o.shippingAddress?.line1 ?? '',
            subdistrict: o.shippingAddress?.subdistrict ?? '',
            district: o.shippingAddress?.district ?? '',
            province: o.shippingAddress?.province ?? '',
            postcode: o.shippingAddress?.postcode ?? '',
            note: o.shippingAddress?.note ?? '',
          },
          // feature 00033 — โหลดวันที่สั่งซื้อเดิมเข้าฟอร์ม (ยุบไว้ ไม่ auto-open)
          orderedAt: o.createdAt ? toDatetimeLocalValue(new Date(o.createdAt)) : undefined,
        })
      } catch {
        if (!cancelled) setSubmitError(`โหลดข้อมูล${vocab.noun}ไม่สำเร็จ`)
      } finally {
        if (!cancelled) setEditLoaded(true)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOrderToken])

  // ── prefill เบอร์ + ที่อยู่ล่าสุดของลูกค้า เมื่อสร้างออเดอร์จากแชทที่ผูกลูกค้าแล้ว (user 2026-07-25) ──
  // เฉพาะโหมดสร้างจากแชท (มี conversationId + ไม่ใช่แก้ไข). setValue เฉพาะเบอร์+ที่อยู่ ไม่แตะชื่อ/ช่องทาง
  // (prefill จาก defaultValues แล้ว). guard ด้วย getValues: ทับเฉพาะช่องที่ยังว่าง — ถ้า user พิมพ์แล้ว
  // (fetch ช้า) ไม่ล้างของที่พิมพ์. "ลูกค้าเปลี่ยนค่อยแก้" = ค่าเริ่มเป็นของเดิม แก้ทับได้ปกติ
  useEffect(() => {
    if (!conversationId || editOrderToken) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/customer-prefill`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data?.linked) return
        if (data.phone && !getValues('buyerContact')) setValue('buyerContact', data.phone)
        const a = data.shippingAddress
        if (a && !getValues('shippingAddress.line1')) {
          setValue('shippingAddress', {
            line1: a.line1 ?? '',
            subdistrict: a.subdistrict ?? '',
            district: a.district ?? '',
            province: a.province ?? '',
            postcode: a.postcode ?? '',
            note: a.note ?? '',
          })
        }
      } catch {
        // เงียบ — prefill เป็น nice-to-have ไม่ควรบล็อกการสร้างออเดอร์
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, editOrderToken])

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

  // แถวเปล่ารอเสมอ (spreadsheet pattern — user decision): ถ้าไม่มีแถวเปล่าเลย append 1 แถว
  // แถวเปล่า = ไม่มี productId และ name ว่าง (fresh addCustom row)
  // วางที่นี่ (form owner) ไม่ใช่ QuickForm — เพราะ mobile+desktop render พร้อมกัน กฎใน component
  // เฉพาะ platform จะรั่วข้ามฝั่ง (bug 3, 2026-07-23)
  //
  // pendingAppend guard (bug พบ prod 2026-07-23): useWatch อัปเดต watchedItems แบบ async —
  // ตอน mount append แถวแรกไปแล้ว แต่ effect ยิงซ้ำอีกรอบก่อน watchedItems ทันสะท้อนค่าที่เพิ่ง
  // append (ยังเห็นเป็น stale/ว่าง) → เข้าใจผิดว่ายังไม่มีแถวว่าง → append ซ้ำเป็น 2 แถว.
  // ref นี้กันไม่ให้ effect รอบถัดไป (ที่มาจาก append ของตัวเอง) เติมซ้ำ — ถ้าลบออกจะกลับไปเป็นบั๊ก 2 แถวอีก
  const pendingAppend = useRef(false)
  useEffect(() => {
    if (!editLoaded) return // แก้ไข: รอ prefill (reset) เสร็จก่อน ไม่งั้น append แถวเปล่าก่อนโหลดข้อมูล
    if (pendingAppend.current) {
      // watchedItems สะท้อน append ที่เพิ่งทำแล้ว — เคลียร์ flag ไม่เติมซ้ำ
      pendingAppend.current = false
      return
    }
    const hasEmpty = watchedItems.some((it) => !it.productId && !(it.name ?? '').trim())
    if (!hasEmpty) {
      pendingAppend.current = true
      addCustom()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedItems])

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

  /**
   * feature 00024 — วันที่นัดที่ส่งมาจากปฏิทินคิว (?appointmentDate=YYYY-MM-DD)
   *
   * ปฏิทินเปิดหน้านี้พร้อมวันที่ที่ผู้ใช้กดไว้ เพื่อไม่ต้องกรอกซ้ำ
   * (user สั่ง 2026-07-31: "อยากให้เมื่อ hover วันที่นั้น ๆ สร้างการจองได้จาก Calendar เลย")
   *
   * IMPORTANT: เติมแค่ "วันที่" ไม่เลือกคิวงานให้ — ปฏิทินไม่รู้ว่าผู้ใช้ตั้งใจคิวงานไหน
   * และการเลือกให้เองจะทำให้ผู้ใช้เผลอบันทึกผิดคิวงานโดยไม่ทันสังเกต
   *
   * IMPORTANT: ค่านี้ต้องส่งต่อให้ CartPanel ด้วย ไม่ใช่แค่เขียนลงฟอร์ม —
   * บนเดสก์ท็อปบล็อกนัดอยู่ใน accordion ที่ไม่ถูก render ตอนพับ ถ้าไม่บอกให้กางเอง
   * ผู้ใช้จะไม่มีทางเห็นว่ามีวันที่ถูกพามา แล้วได้ออเดอร์เปล่าโดยไม่มี error
   */
  const appointmentPrefilledDate = (() => {
    const d = searchParams.get('appointmentDate')
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
  })()

  useEffect(() => {
    if (!serviceResourcesEnabled) return
    if (appointmentPrefilledDate) setValue('appointment.date', appointmentPrefilledDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentPrefilledDate, serviceResourcesEnabled])

  // ── ★ default channel/payment ที่ seller ตั้งไว้ (localStorage) → override ตอน mount (client-only) ──
  // key ตรงกับ ChannelPaymentSelect (DEFAULT_CHANNEL_KEY/DEFAULT_PAYMENT_KEY); ใส่ใน useForm defaultValues ไม่ได้ (SSR ไม่มี window)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (editOrderToken) return // แก้ไข: ใช้ค่าจาก order เดิม ไม่ override ด้วย default ของ seller
    const ch = localStorage.getItem('deep.default.salesChannel')
    const pm = localStorage.getItem('deep.default.paymentMethod')
    // ช่องทางจากแชท (initialSalesChannel) ชนะ localStorage default — ไม่ override ทับ
    if (ch && !initialSalesChannel) setValue('salesChannel', ch)
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

  // feature 00024 — ค่าปัจจุบันของบล็อกวันนัด (ส่งเข้า AppointmentBlock เพื่อคำนวณคิว/มัดจำสด)
  const appointmentWatch = useWatch({ control, name: 'appointment' }) as
    | FormValues['appointment']
    | undefined

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    // แถวเปล่าท้ายลิสต์ต้องไม่หลุดเข้าการคำนวณ/payload — กรองซ้ำที่นี่ (defense) เผื่อค่า transform
    // ของ yupResolver ไม่ propagate ถึง handler: แถวเปล่าไม่มี productId ทำให้ derivedType เพี้ยนเป็น
    // PHYSICAL เสมอ (item.productId ว่าง → hasPhysical=true) + needsShipping ผิด
    const items = values.items.filter(
      (it) => it?.productId != null || (it?.name ?? '').toString().trim() !== '',
    )

    // ── คำนวณ subtotal ──────────────────────────────────────────────────────
    const subtotal = items.reduce((sum, item) => {
      return sum + (Number(item.qty) || 0) * (Number(item.price) || 0)
    }, 0)

    // ── derivedType: PHYSICAL > SERVICE > DIGITAL ──────────────────────────
    // ถ้ามี item ที่ไม่มี productId (custom) หรือ catalog type === 'PHYSICAL' → PHYSICAL
    // else ถ้ามี SERVICE → SERVICE; else DIGITAL
    const hasPhysical = items.some((item) => {
      if (!item.productId) return true
      return catalog.find((p) => p.id === item.productId)?.type === 'PHYSICAL'
    })
    const derivedType: string = hasPhysical
      ? 'PHYSICAL'
      : items.some(
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
      items.some((item) => {
        if (!item.productId) return true
        return catalog.find((p) => p.id === item.productId)?.fulfillmentMode === 'SHIPPED'
      })

    // ── FR-6.5: ออเดอร์ที่ต้องจัดส่งต้องมีที่อยู่ครบขั้นต่ำ (ที่อยู่ + จังหวัด + รหัสไปรษณีย์) ──
    // server enforce ซ้ำที่ createOrder (single source) — นี่คือ UX surface ก่อน submit
    if (needsShipping) {
      const a = values.shippingAddress
      let missing = false
      if (!a?.line1?.trim()) { setError('shippingAddress.line1', { message: 'กรอกบ้านเลขที่ / ถนน ก่อนบันทึก' }); missing = true }
      if (!a?.province?.trim()) { setError('shippingAddress.province', { message: 'กรุณากรอกจังหวัด' }); missing = true }
      if (!a?.postcode?.trim()) { setError('shippingAddress.postcode', { message: 'กรุณากรอกรหัสไปรษณีย์' }); missing = true }
      if (missing) {
        pacesToast.error('บันทึกไม่ได้ — ที่อยู่จัดส่งยังไม่ครบ')
        return
      }
    }

    // ── feature 00024: วันเข้าใช้บริการ (ไม่บังคับ) ────────────────────────
    // ไม่เลือกทรัพยากร = ไม่ส่ง appointment เลย → ออเดอร์เดินเส้นทางเดิม 100% (BR-RSV-04)
    // ตรวจความสัมพันธ์ระหว่างฟิลด์ที่นี่เพราะต้องดูหลายช่องพร้อมกัน (Yup แยกช่องทำไม่ได้สะอาด)
    let appointmentPayload: {
      resourceId: string
      start: string
      end: string
      depositAmount?: string
    } | undefined
    const ap = values.appointment
    if (serviceResourcesEnabled && ap?.resourceId) {
      if (!ap.date) {
        setError('appointment.endTime', { message: 'เลือกวันที่นัดก่อน' })
        pacesToast.error('ยังไม่ได้เลือกวันที่นัด')
        return
      }
      let start: Date
      let end: Date
      if (appointmentGranularity === 'DAY') {
        // โหมดรายวัน (FR-RSV-13): ส่งช่วงที่ครอบทั้งวันตามเวลาเครื่อง — ไม่มีฟิลด์ใหม่ใน payload
        // โครงสร้างเดิมรองรับอยู่แล้ว (BR-RSV-54) และ isAllDayAppointment() ตอนแสดงผลจะจับได้เอง
        start = new Date(`${ap.date}T00:00`)
        end = new Date(start.getTime() + 86_400_000)
      } else {
        if (!ap.startTime || !ap.endTime) {
          setError('appointment.endTime', { message: 'กรอกเวลาเริ่มและเวลาสิ้นสุดให้ครบ' })
          pacesToast.error('ระบุวันนัดไม่ครบ — กรอกเวลาเริ่มและเวลาสิ้นสุด')
          return
        }
        start = new Date(`${ap.date}T${ap.startTime}`)
        end = new Date(`${ap.date}T${ap.endTime}`)
      }
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
        setError('appointment.endTime', { message: 'เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม' })
        pacesToast.error('เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม')
        return
      }
      appointmentPayload = {
        resourceId: ap.resourceId,
        start: start.toISOString(),
        end: end.toISOString(),
        // ส่งเป็น string ทศนิยม 2 ตำแหน่งให้ตรงกับ DecimalString ของ Valibot
        ...(ap.depositAmount != null
          ? { depositAmount: Number(ap.depositAmount).toFixed(2) }
          : {}),
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
      items: items.map((item) => ({
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
      ...(appointmentPayload ? { appointment: appointmentPayload } : {}),
      // feature 00018 (user 2026-07-24): สร้างจากแชท → ผูก ExternalContact กับ Customer ทันที
      ...(conversationId ? { conversationId } : {}),
      // feature 00033 — datetime-local เป็นเวลาเครื่อง แปลงเป็น ISO พร้อม offset (Z) ก่อนส่ง
      // ไม่มีค่า = ไม่ส่งคีย์เลย → เส้นทางเดิมทุกประการ (95% ของการคีย์)
      ...(values.orderedAt ? { createdAt: new Date(values.orderedAt).toISOString() } : {}),
    }

    // full-bleed sheet: โชว์ "กำลังสร้างคำสั่งซื้อ" ตั้งแต่เริ่มยิง POST (block ทั้งจอ กันกดซ้ำ)
    setSubmitError('')
    setSubmitStatus('loading')
    try {
      // แก้ไข (user 2026-07-25): PATCH order เดิม; สร้างใหม่: POST. body shape เดียวกัน (CreateOrderSchema)
      const res = editOrderToken
        ? await fetch(`/api/orders/${editOrderToken}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data?.error ?? (editOrderToken ? `แก้ไข${vocab.noun}ไม่สำเร็จ กรุณาลองใหม่` : `${vocab.createLabel}ไม่สำเร็จ กรุณาลองใหม่`))
        setSubmitStatus('error')
        return
      }

      const order = await res.json()
      const token = order?.publicToken ?? order?.order?.publicToken
      // success: คง sheet loading ค้างจน redirect (ไม่ setStatus กลับ — กัน form โผล่แว้บก่อนเปลี่ยนหน้า)
      // toast เฉพาะ desktop POS (≥ lg) — mobile ไม่ต้อง (redirect ไปหน้าออเดอร์อยู่แล้ว, toast ซ้ำซ้อน; user req)
      const isDesktop =
        typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
      if (isDesktop) {
        // feature 00033 — ออเดอร์ที่ลงวันที่ย้อนหลังไม่โผล่หัวรายการ (keyset createdAt DESC)
        // ถ้าไม่บอก คนคีย์จะหาไม่เจอแล้วคีย์ซ้ำ
        const orderedDate = values.orderedAt ? new Date(values.orderedAt) : null
        const isBackdated = orderedDate ? thaiDayKey(orderedDate) !== thaiDayKey(new Date()) : false
        // โหมดแก้ไข (PATCH) ไม่ได้สร้างลิงก์ใหม่ — copy เดิมชวนให้ "แชร์ลิงก์" ผิดบริบท
        pacesToast.success(
          editOrderToken
            ? 'บันทึกการแก้ไขแล้ว'
            : isBackdated
              ? `บันทึกแล้ว ลงวันที่ ${formatDateTimeTH(orderedDate!)} — อยู่ในรายการย้อนหลัง`
              : `${vocab.createLabel}แล้ว แชร์ลิงก์ให้ลูกค้า`,
        )
      }

      // feature 00022 — เปิดพัสดุตามโหมดที่ร้านตั้งไว้ (อัตโนมัติ / ถามก่อน / ปิด)
      // วางไว้ "หลัง" ออเดอร์บันทึกสำเร็จและ "ก่อน" เปลี่ยนหน้าเสมอ:
      // ถ้าเปลี่ยนหน้าไปก่อน component นี้จะถูก unmount แล้วคำถามจะหายกลางอากาศ
      // ฟังก์ชันนี้ไม่โยน error ออกมา ความล้มเหลวของขนส่งจึงไม่กระทบออเดอร์ (BR-ISHIP-21)
      // แก้ไขออเดอร์เดิม (PATCH) ไม่เข้าเงื่อนไข — เปิดพัสดุเฉพาะตอนสร้างใหม่
      if (!editOrderToken) {
        await runAfterOrderCreate(ishipCreateMode, order?.id ?? order?.order?.id ?? null)
      }
      // โมดัลสร้างคำสั่งซื้อจากแชท (feature 00018): ไม่ navigate ออก — ให้ manager ปิด draft + refresh เอง
      if (onSuccess) {
        onSuccess(token ?? null)
        return
      }
      if (token) {
        router.push(`/orders/${token}`)
      } else {
        router.push('/orders')
      }
    } catch {
      setSubmitError('เกิดข้อผิดพลาด กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
      setSubmitStatus('error')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // grid lg:grid-cols-3 ตาม mockup create.html line 52:
  //   left (lg:col-span-2) = BLOCK1 + BLOCK2 + BLOCK3 (stacked in space-y-4 / gap-5)
  //   right (lg:col-span-1) = sticky summary panel
  //
  // M0-b: pb-20 บน form wrapper กัน sticky bottom bar ทับ content ล่างสุด (mobile)
  /**
   * feature 00024 — บล็อกวันเข้าใช้บริการ
   *
   * QuickForm (มือถือ) กับ CartPanel (เดสก์ท็อป) render พร้อมกันเสมอ สลับด้วย CSS
   * ไม่ใช่ React — บล็อกนี้จึงต้องมี "สองใบ" เหมือนที่ลูกค้า/ชำระเงินทำอยู่แล้ว
   * state ไม่แตกเพราะทั้งคู่อ่าน-เขียนผ่าน control ตัวเดียวกันของ RHF
   * แต่ id ของ input ต้องแยก (idPrefix) ไม่งั้น id ซ้ำใน DOM แล้ว label ผูกผิดช่อง
   */
  const renderAppointmentBlock = (idPrefix: string, variant: 'card' | 'embedded') =>
    serviceResourcesEnabled && serviceResources.length > 0 ? (
      <AppointmentBlock
        idPrefix={idPrefix}
        variant={variant}
        control={control}
        errors={errors}
        setValue={setValue}
        resources={serviceResources}
        granularity={appointmentGranularity}
        total={barTotal}
        value={{
          resourceId: appointmentWatch?.resourceId,
          date: appointmentWatch?.date,
          startTime: appointmentWatch?.startTime,
          endTime: appointmentWatch?.endTime,
          depositAmount: appointmentWatch?.depositAmount,
        }}
      />
    ) : null

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit, (formErrors) => {
        /**
         * ต้องมี toast เสมอ — ไม่งั้นเดสก์ท็อปกดบันทึกแล้ว "เงียบสนิท"
         * เพราะ error ของชื่อ/เบอร์อยู่ใน accordion ที่ (เดิม) ไม่ถูก render ตอนพับ
         * (impeccable critique 2026-07-31 P0) ตอนนี้ CartPanel กาง accordion ที่มี error ให้แล้ว
         * แต่ toast ยังจำเป็นเพราะเป็นสัญญาณเดียวที่เห็นได้ทันทีโดยไม่ต้องกวาดตาหา
         */
        pacesToast.error('กรอกข้อมูลไม่ครบ — ดูช่องที่ทำเครื่องหมายสีแดง')

        // scroll ไป field ที่ error แรก — กันคีย์บอร์ดมือถือบัง error ที่มองไม่เห็น
        // ใช้ได้เฉพาะ field ที่ผูกด้วย register() ซึ่ง spread name ให้ (ที่อยู่จัดส่ง/ส่วนลด/VAT)
        // ส่วน buyerName/buyerContact ผูกด้วย useController แบบ destructure จึงไม่มี name —
        // ตรงนั้นพึ่ง toast + accordion ที่กางเองแทน
        const first = Object.keys(formErrors)[0]
        if (first) {
          document.querySelector(`[name="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      })}
      noValidate
      className={compact ? '' : 'pb-24 lg:pb-0 scroll-pb-24'}
    >
      {/* Full-bleed status sheet: loading ระหว่าง submit / error + ปุ่มปิดกลับไปแก้ไข */}
      <SubmitStatusSheet
        createLabel={vocab.createLabel}
        status={submitStatus}
        errorMessage={submitError}
        onDismiss={() => setSubmitStatus('idle')}
      />

      {/* ═══ Render: < lg = QuickForm (inline), ≥ lg = POS split ═══ */}

      {/* < lg (มือถือ+แท็บเล็ต): QuickForm inline scroll (T4-T8 เติมเนื้อ section)
          compact (โมดัลในแชท): บังคับ QuickForm ทุกขนาดจอ — เดสก์ท็อป 3-col แน่นเกินในโมดัล */}
      <div className={compact ? '' : 'lg:hidden'}>
        <QuickForm
          orderNoun={vocab.noun}
          prefillParseText={prefillParseText}
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
          appointmentBlock={renderAppointmentBlock('m', 'card')}
          compact={compact}
          orderDateFromMessage={!!prefillCreatedAt}
          orderDateMessageTooOld={prefillCreatedAtTooOld}
        />
      </div>

      {/* ≥ lg (เดสก์ท็อป): POS split — ซ้าย product grid, ขวา cart panel (เนื้อในไม่แตะ) grid 2-col 50/50 ล็อกสูงเท่าจอ → แต่ละแพน scroll แยก, footer (ปุ่มบันทึก) ตรึงล่างเสมอ. HR7 exception: viewport-lock calc height, Paces ไม่มี token. compact = ซ่อนทุกจอ (ใช้ QuickForm แทน) */}
      {/* HR7 exception: viewport-lock — Paces ไม่มี token สำหรับความสูงเท่า viewport
          `lg:grid-rows-[minmax(0,1fr)]` จำเป็น: grid row ปกติยืดตามเนื้อหา (auto) การล็อก
          ความสูงที่ container อย่างเดียวจึงไม่บีบลูก — row โตทะลุแล้ว overflow-hidden ก็แค่
          "ตัดทิ้ง" ทำให้ยอดรวม+ปุ่มบันทึกในแผงขวาหลุดหายไปเลย (วัดได้: การ์ดสูง 931px
          ในกล่อง 748px) minmax(0,1fr) บังคับให้ row ไม่เกิน container ลูกจึง scroll ในตัวเอง */}
      <div className={compact ? 'hidden' : 'hidden lg:grid lg:h-[calc(100vh-9.5rem)] lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-4 lg:overflow-hidden'}> {/* HR7 exception: viewport-lock + row clamp — Paces ไม่มี token */}
        {/* @container = ประกาศ containment ให้ ProductGrid วัดความกว้าง "แพน" แทน viewport
            (ดูเหตุผลเต็มใน ProductGrid.tsx) — จุดเดียวในโปรเจกต์ที่ใช้ utility นี้ */}
        <div className="@container min-w-0 lg:h-full lg:overflow-y-auto">
          <ProductGrid catalog={catalog} qtyByProduct={itemsCtl.qtyByProduct} inc={itemsCtl.inc} inventoryEnabled={inventoryEnabled} />
        </div>
        <div className="lg:h-full">
          <CartPanel
            orderNoun={vocab.noun}
            control={control}
            catalog={catalog}
            itemsCtl={itemsCtl}
            errors={errors}
            formId={formId}
            inventoryEnabled={inventoryEnabled}
            setValue={setValue}
            appointmentBlock={renderAppointmentBlock('d', 'embedded')}
            appointmentPrefilledDate={appointmentPrefilledDate}
            orderDateFromMessage={!!prefillCreatedAt}
            orderDateMessageTooOld={prefillCreatedAtTooOld}
          />
        </div>
      </div>
    </form>
  )
}
