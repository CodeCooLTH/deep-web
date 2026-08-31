'use client'

/**
 * OrderDetailClient — client shell ของหน้ารายละเอียดคำสั่งซื้อ (seller), T11 wiring
 *
 * ทำไมต้องมี client wrapper: `onAction` ของ StatusHero/OrderActionBar ต้องเป็นฟังก์ชันจริง
 * (fetch/Swal/clipboard/modal state) — page.tsx เป็น RSC ส่งฟังก์ชันข้ามขอบเขต Server→Client
 * ไม่ได้ (ไม่ใช่ Server Action) จึงต้องมี component เดียวที่เป็นเจ้าของ handler ทั้งหมด แล้ว
 * ส่ง `children` (grid เนื้อหา — OrderFactsCard/OrderReviewCard) เข้ามาจาก
 * page.tsx ตรง ๆ เพื่อให้ subtree นั้นยัง render จาก RSC ได้เหมือนเดิม ไม่ลากเข้า client bundle
 * โดยไม่จำเป็น (pattern "server component ผ่าน children เข้า client component")
 *
 * actionSet (T5 contract): คำนวณครั้งเดียวที่นี่ (`getOrderActionSet`) ใช้กับ
 * `OrderActionBar variant="bottom"` ตรง ๆ — ส่วน StatusHero (T7) คำนวณชุดเดียวกันซ้ำภายในตัวเอง
 * จาก props ชุดเดียวกัน (status/fulfillmentMode/shipmentSource) เพราะ StatusHero.tsx ยังไม่มี
 * ช่องรับ `actionSet` จากภายนอก (ดู comment หัวไฟล์ StatusHero.tsx ที่อธิบายเหตุผลไว้แล้ว) —
 * เป็น pure function รับ input เดียวกัน ผลลัพธ์จึงเป็นชุดเดียวกันเป๊ะ ไม่ใช่การตัดสินใจคนละที่
 * (ถ้าจะให้ตรงตัวอักษร "เรียกครั้งเดียว" 100% ต้องแก้ StatusHero ให้รับ actionSet prop — รายงาน
 * ไว้ให้ Controller ตัดสินใจ ไม่ได้แก้ไฟล์ของ T7 เอง)
 *
 * onAction: ยกพฤติกรรมจริงจาก SendSmsButton.tsx / CopyLinkButton.tsx / CancelOrderButton.tsx /
 * OrderCopyLink.tsx เดิม (confirm text, endpoint, toast message เหมือนเดิมทุกตัวอักษร) —
 * ปุ่มเดิมเหล่านี้ไม่ได้ถูกลบ (ยังใช้อยู่ที่อื่น เช่น orders list) แค่ไม่ได้ mount เป็น <button>
 * ในหน้านี้อีกต่อไป (ปุ่มตอนนี้มาจาก OrderActionBar/getOrderActionSet แทน — ActionItem generic
 * ที่ไม่รู้จัก business logic ของแต่ละ key)
 */

import Icon from '@/components/wrappers/Icon'
import { useHidePayments } from '@/components/paces/PaymentRestrictionProvider'
import { insufficientCreditHtml } from '@/lib/payment-copy'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm, pacesConfirmWithReason } from '@/lib/paces-swal'
import { CANCEL_REASONS_BY_VERTICAL } from '@/lib/cancel-reasons'
import type { ShopVertical } from '@/lib/lodging'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { canSellerConfirmPayment, type OrderStatus } from '@/lib/order-display'
import { shouldPromptCloseReturnedOrder, type ShippingStageKey } from '@/lib/order-stage'
import type { OrderVocab } from '@/lib/seller-menu'
import type { ShipmentContextJson } from '@/lib/iship/context'
import OrderActionBar from '@/components/safepay/OrderActionBar'
import CodCard from './CodCard'
import PaymentReceivedCard from './PaymentReceivedCard'
import dynamic from 'next/dynamic'
import OrderSummary, { type OrderSummaryProps } from './OrderSummary'
import type { OrderFactsItem } from './order-detail-shared'
import { getOrderActionSet } from './order-action-set'
// feature 00050 — ปุ่มเรื่องเงินของร้านคิวงาน: **ตัวตัดสินว่าเห็นปุ่มอะไร** อยู่ที่ไลบรารีเดียวกับแชท
// ห้ามเขียนเงื่อนไข `outstanding > 0` ของตัวเองที่นี่ (เหตุผลเต็มอยู่หัวไฟล์ chat-order-actions.ts)
import { chatOrderActions } from '@/lib/chat-order-actions'
import type { OrderMoney } from '@/lib/order-payment'
import RecordPaymentSheet from '@/app/(paces)/seller/(chat)/_components/RecordPaymentSheet'
import ReturnPanel from './ReturnPanel'
import type { ShipmentSource } from './order-action-set'

/**
 * โมดัลแจ้งเลขพัสดุ = โค้ดก้อนใหญ่ที่สุดของหน้านี้ (ฟอร์ม iShip + แผงเลือกพัสดุ + หน้าสถานะ +
 * แผงค้นที่อยู่ + react-select) แต่มันเริ่มต้นด้วยสถานะ "ปิด" เสมอ — Impeccable optimize
 * 2026-08-04 วัดจาก build จริงว่าทั้งทรีนี้เดินทางมากับ first-load ของทุกครั้งที่เปิดหน้า
 * ทั้งที่ร้านจะกดเปิดมันหรือไม่ก็ได้
 *
 * ssr:false ปลอดภัยเพราะเป็นโมดัลที่เปิดจากการกดปุ่มเท่านั้น ไม่มีอะไรใน first paint
 * และต้อง render แบบมีเงื่อนไข (ไม่ใช่ปล่อยให้ตัวมันคืน null เอง) ไม่งั้น chunk จะถูกโหลด
 * ทันทีที่ component เข้า tree ซึ่งเท่ากับไม่ได้แยกอะไรเลย
 */
const ShipmentEntryModal = dynamic(() => import('./ShipmentEntryModal'), { ssr: false })

// map HTTP status → validation message (HTML) — เหมือน smsErrorMessage() ใน SendSmsButton.tsx เป๊ะ
function smsErrorMessage(status: number, orderNoun: string, hidePayments: boolean): string {
  switch (status) {
    case 402:
      // 🛑 ในแอป iOS ห้ามมีลิงก์/คำที่พาไปจ่ายเงิน — ข้อความมาจาก SSOT ที่ lib/payment-copy
      return insufficientCreditHtml(hidePayments, 'เติมเงิน')
    case 429:
      return 'ส่ง SMS บ่อยเกินไป กรุณารอสักครู่'
    case 422:
      return `ยังไม่มีเบอร์ลูกค้าใน${orderNoun}นี้ — ส่ง SMS ไม่ได้ ให้คัดลอกลิงก์ส่งทางแชทแทน`
    default:
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่'
  }
}

export interface OrderDetailClientProps {
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — คำนวณที่ RSC ที่รู้จัก shop.vertical */
  vocab: OrderVocab
  /** ประเภทกิจการของร้านเจ้าของออเดอร์ (feature 00039) — ใช้เลือกชุดเหตุผลตอนยกเลิก
   *  ต้องมาจากออเดอร์ ไม่ใช่จาก context ของ user ที่กด (ทีมงานสลับร้านได้) */
  vertical: ShopVertical
  /**
   * ออเดอร์นี้เคยตัดสต็อกจริงไหม (มี OrderItem.stockDeducted != null อย่างน้อย 1 รายการ)
   * ใช้ตัดสินว่ากล่องยืนยันยกเลิกพูดเรื่องคืนสต็อกได้หรือไม่ — ห้าม derive จาก vertical
   */
  hasDeductedStock: boolean
  // ── StatusHero passthrough (T7 props) ──────────────────────────────────────
  publicToken: string
  shortCode: string | null
  status: string
  /**
   * กองงานตามสถานะพัสดุ (deriveShippingStage ที่ server) — ป้ายหัวหน้าต้องรวมค่านี้เข้ากับ
   * status ไม่งั้นใบ COD ที่ส่งถึงแล้วแต่ยังไม่ได้เงินจะขึ้น "กำลังจัดส่ง" ทั้งที่ของถึงแล้ว
   * undefined = ร้านที่ไม่ใช่ ONLINE_SALES (ไม่มีพัสดุให้ไล่)
   */
  shippingStage?: ShippingStageKey
  type: string
  createdAtISO: string
  fulfillmentMode: string
  isFromAuction: boolean
  /** ช่องทางการขายของออเดอร์ — ส่งต่อให้ StatusHero โชว์โลโก้แบรนด์ในแถวหัว */
  salesChannel: string | null
  /** รูปเพจที่ลูกค้าทักมา — ส่งต่อให้ OrderSummary (user 2026-08-06) */
  pageLogoUrl?: string | null
  totalAmount: number
  paymentMethod: string | null
  slipFileId: string | null
  /**
   * feature 00062 — ISO ของเวลาที่ร้านกด "ได้รับเงินแล้ว" เอง (TRANSFER/PROMPTPAY/CASH)
   * ส่งต่อให้ OrderSummary → getPaymentBadge (SSOT เดียว, SDS TD-003) — null = ยังไม่กด
   */
  paymentConfirmedAtISO: string | null
  shipmentSource: ShipmentSource

  // ── ShipmentEntryModal (T9) ──────────────────────────────────────────────
  ishipContext: ShipmentContextJson | null
  hasIshipShipment: boolean
  /**
   * ขนส่งตีกลับของมาที่ร้านแล้ว (`carrierStatus` ของพัสดุที่มีอยู่จริง ∈ return/return_success)
   *
   * คำนวณที่ server จาก `isReturnedCarrierStatus` ตัวเดียวกับที่ `isRateExcludedCancellation`
   * ใช้ตัดสินเรื่องอัตราความสำเร็จ — ห้าม derive จาก `shippingStage` ที่นี่ เพราะ `PROBLEM`
   * รวม `issue`/`cannot_pickup` (ของยังอยู่กับขนส่ง) ไว้ในกองเดียวกัน ซึ่งเป็นคนละสถานการณ์
   * กับ "ของกลับมาถึงร้านแล้ว" โดยสิ้นเชิง
   */
  parcelReturned?: boolean
  /** เลขพัสดุ/ขนส่งปัจจุบัน (MANUAL) — prefill ตอน mode='edit' + payload ของ copy-tracking */
  trackingNo: string | null
  provider: string | null

  /** ที่อยู่จัดส่งรวมเป็นบรรทัดเดียว (สำหรับ copy-address) — null = ไม่มีที่อยู่ให้คัดลอก */
  addressText: string | null

  /** ออเดอร์เก็บเงินปลายทางที่ร้านยังไม่ได้กดว่าได้เงิน → มีปุ่ม "ได้รับเงินปลายทางแล้ว" */
  isCodUnpaid: boolean
  internalNote: string | null

  // ── OrderSummary (การ์ดหัวตามโครงธีม: หัว + ปุ่ม + ตารางสินค้า + ยอดรวม) ──────
  items: OrderFactsItem[]
  discount: unknown
  vatRate: unknown
  vatAmount: unknown
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) */
  orderNoun?: string
  /** ป้ายสถานะของร้านบริการ (คำนวณที่ server) — null = ใช้ป้ายเดิม */
  serviceBadge?: OrderSummaryProps['serviceBadge']

  /**
   * feature 00050 — เงินของบิลนี้แบบเต็มรูป · null = ไม่ใช่ร้านคิวงาน (ปุ่มเรื่องเงินหายทั้งชุด)
   *
   * 🛑 ต้องเป็นชุดที่ **ไม่ผ่าน `hasMoneyStory()`** — ดูเหตุผลที่ page.tsx (`serviceMoney`)
   */
  serviceMoney?: OrderMoney | null
  /** สถานะนัด — ป้อน `chatOrderActions()` (จบงานแล้วไม่ต้องมีปุ่มอะไร) */
  appointmentStatus?: string | null
  /** ใบนี้มีนัดผูกอยู่ไหม (`serviceStart != null`) — false = walk-in */
  hasAppointment?: boolean
  /** ป้ายที่ผู้ใช้เห็นบนชีตรับเงิน — กันกดผิดใบ */
  orderLabel?: string

  /** การ์ดที่ยัง server-render ได้ — ส่งมาจาก page.tsx เป็น ReactNode ไม่ลากเข้า client bundle */
  shippingActivity: React.ReactNode
  /** การ์ดผู้ซื้อ — แยกจาก sideCards เพราะการ์ด COD ต้องแทรก "หลังผู้ซื้อ ก่อนที่อยู่" */
  customerCard: React.ReactNode
  /** การ์ดกำไรของใบนี้ — null เมื่อผู้ใช้ไม่มีสิทธิ์ดูข้อมูลการเงิน (ตัดสินที่ RSC ไม่ใช่ที่นี่) */
  profitCard?: React.ReactNode
  sideCards: React.ReactNode
  /** ISO — มีค่า = ร้านยืนยันรับเงินปลายทางแล้ว (null = ยังไม่ได้รับ / ไม่ใช่ออเดอร์ COD) */
  codReceivedAtISO: string | null
  codReceivedByLabel: string | null
  /** true = ออเดอร์นี้เก็บเงินปลายทาง (แสดงการ์ดเงินแทนการ์ดการชำระเงิน) */
  isCod: boolean
  /**
   * feature 00062 (U17) — ชื่อคนที่กด "ได้รับเงินแล้ว" (โอน/พร้อมเพย์/เงินสด) — null เสมอตอนนี้
   * (getOrderForShop ยังไม่ include ความสัมพันธ์ paymentConfirmedBy — นอกขอบเขตไฟล์ที่แตะได้ของ
   * งานนี้ ดู PaymentReceivedCard ที่รองรับ null ได้อยู่แล้ว เหมือน codReceivedByLabel)
   */
  paymentConfirmedByLabel: string | null
  /**
   * feature 00062 (U16) — ISO ของเวลาที่ร้านกด "มอบสินค้าแล้ว" ในออเดอร์นัดรับ — null = ยังไม่กด/
   * ไม่ใช่ออเดอร์นัดรับ ใช้คำนวณ flag isPickupHandedOver ให้ order-action-set.ts (แถบล่าง <1024)
   */
  handedOverAtISO: string | null
}

export default function OrderDetailClient({
  vocab,
  vertical,
  hasDeductedStock,
  publicToken,
  shortCode,
  status,
  shippingStage,
  type,
  createdAtISO,
  fulfillmentMode,
  isFromAuction,
  salesChannel,
  pageLogoUrl = null,
  totalAmount,
  paymentMethod,
  slipFileId,
  paymentConfirmedAtISO,
  shipmentSource,
  ishipContext,
  hasIshipShipment,
  parcelReturned = false,
  trackingNo,
  provider,
  addressText,
  isCodUnpaid,
  internalNote,
  items,
  discount,
  vatRate,
  vatAmount,
  orderNoun,
  serviceBadge,
  serviceMoney = null,
  appointmentStatus = null,
  hasAppointment = false,
  orderLabel,
  shippingActivity,
  customerCard,
  profitCard,
  sideCards,
  codReceivedAtISO,
  codReceivedByLabel,
  isCod,
  paymentConfirmedByLabel,
  handedOverAtISO,
}: OrderDetailClientProps) {
  // ห้ามแสดงคำ/ลิงก์ที่พาไปจ่ายเงินเมื่ออยู่ในแอป iOS (Guideline 3.1.1)
  const hidePayments = useHidePayments()
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  // ชีตคืนของ (feature 00056) — เปิดจากเมนู ⋮ ไม่ใช่การ์ดเดี่ยวในหน้า
  const [returnOpen, setReturnOpen] = useState(false)
  const isOnlineSales = vertical === 'ONLINE_SALES'
  /** ร้านคิวงาน — เจ้าของคำถาม "ได้เงินยัง" คือบัญชี `OrderPayment` ไม่ใช่ธงใบเดียวของ 00062 */
  const isServiceQueue = vertical === 'SERVICE_QUEUE'

  // feature 00062 — flag ที่ order-action-set.ts ห้ามคำนวณเอง (pure module ห้ามรู้จักรูปแบบ
  // ข้อความวิธีชำระ) มีผลเฉพาะ fulfillmentMode==='PICKUP' + status==='PENDING' เท่านั้น
  const isPickupOrder = fulfillmentMode === 'PICKUP'
  const isPickupPaymentUnpaid =
    isPickupOrder && canSellerConfirmPayment(paymentMethod) && !paymentConfirmedAtISO
  const isPickupHandedOver = isPickupOrder && Boolean(handedOverAtISO)

  // T5 — ชุดเดียวสำหรับแถบล่าง <1024 (ดู comment หัวไฟล์: StatusHero คำนวณชุดเดียวกันซ้ำภายในตัวเอง)
  const baseActionSet = getOrderActionSet({
    status: status as OrderStatus,
    fulfillmentMode,
    shipmentSource,
    orderNoun: vocab.noun,
    isCodUnpaid,
    isPickupPaymentUnpaid,
    isPickupHandedOver,
  })

  /**
   * feature 00050 — **ปุ่ม "รับเงินแล้ว" บนหน้านี้** (เดิมมีที่แชทที่เดียว)
   *
   * 🛑 ทำไมต้องมีที่นี่ด้วย — ปุ่มเดิมอยู่บนการ์ดงานในแชท ซึ่งหาบิลด้วย `Order.customerId`
   * ที่ระบบ derive จาก **เบอร์โทร** ตอน `createOrder` ⇒ บิลที่เปิดจากปฏิทิน/ตารางงานโดยไม่กรอกเบอร์
   * ไม่ผูก `Customer` ⇒ **ไม่โผล่ในเธรดไหนเลย ⇒ บันทึกรับเงินไม่ได้ตลอดกาล** และไม่มีหน้าจอ
   * ให้แก้ `conversationId` ทีหลัง (schema เขียนห้ามไว้เอง — backfill = เดาจากเบอร์)
   * การ์ด "เงินที่รับแล้ว" บนจอนี้ถึงกับต้องเขียนบอกผู้ใช้ว่า "กดได้ที่การ์ดงานในแชท"
   *
   * 🛑 เอาเฉพาะ `RECORD_PAYMENT` — อีก 3 ตัวที่ `chatOrderActions()` คืนมาไม่เอา และไม่ใช่เพราะลืม:
   *   - `REQUEST_DEPOSIT` / `MARK_SERVED` — `AppointmentCard` บนหน้านี้มีปุ่มเดียวกันอยู่แล้ว
   *     (ส่งการ์ดสรุปนัด / เข้ารับบริการ-ไม่มาตามนัด) ใส่อีกชุด = ปุ่มคำเดียวกัน 2 ใบในจอเดียว
   *   - `START_WALK_IN` — **หัวหน้าสั่งให้คงไว้ในแชทเท่านั้น** (2026-08-31)
   * ตัวตัดสิน *ว่าเห็นปุ่มไหม* ยังมาจากไลบรารีตัวเดียวกับแชทเสมอ ไม่ได้เขียนเงื่อนไขใหม่ที่นี่
   */
  const recordPaymentAction = serviceMoney
    ? chatOrderActions({
        orderStatus: status,
        appointmentStatus,
        hasAppointment,
        money: serviceMoney,
      }).find((a) => a.key === 'RECORD_PAYMENT')
    : undefined
  const [payOpen, setPayOpen] = useState(false)

  /**
   * "คืนของ" (feature 00056) เข้าเมนู `⋮` ของออเดอร์ — **ไม่ใช่การ์ดเดี่ยวในหน้า**
   *
   * 🛑 เดิมเป็นการ์ดของตัวเองต่อท้ายการ์ดการจัดส่ง/หลักฐาน ⇒ หน้ารายละเอียดกลายเป็นกอง
   * การ์ดที่ผู้ใช้ต้องเลื่อนผ่านทุกครั้ง ทั้งที่การคืนของเป็น **การกระทำ** ไม่ใช่ข้อมูล
   * user ทักเองทั้งฝั่งแชทและฝั่งนี้ (2026-08-24) — ตำแหน่งที่ถูกคือเมนูของออเดอร์
   * (`docs/conventions/seller-action-placement.md`: destructive/รอง อยู่ใน `⋯`)
   *
   * ไม่ซ่อนตามเกณฑ์ที่จอเดาเอง — แสดงเสมอ (ยกเว้นใบยกเลิก/ร้านที่ไม่ขายของ) แล้วให้ชีต
   * บอกเหตุผลจาก `canCreateReturn()` ตัวเดียว ไม่งั้นสองที่ตัดสินไม่ตรงกันวันที่เกณฑ์เปลี่ยน
   */
  const withReturn =
    isOnlineSales && status !== 'CANCELLED'
      ? {
          ...baseActionSet,
          menu: [
            { key: 'return-order', label: 'คืนของ', icon: 'arrow-back-up' },
            ...baseActionSet.menu,
          ],
        }
      : baseActionSet

  /**
   * "รับเงินแล้ว" ขึ้นเป็น **ปุ่มหลัก** และดันตัวเดิมลงไปเป็นปุ่มรอง (ไม่ทิ้ง)
   *
   * ท่าเดียวกับที่ `codReceived` ทำอยู่แล้วในสถานะ SHIPPED/CONFIRMED (`order-action-set.ts`)
   * เหตุผลเดียวกันด้วย: ในบิลที่ยังค้างเงิน มันเป็น action เดียวบนจอนี้ที่ทำให้บิลเดินหน้าจริง
   * ส่วนปุ่มหลักเดิมของร้านคิวงานคือ "ส่งลิงก์ทาง SMS (฿1)" ซึ่งเสียเงินและไม่ได้ใช้ทุกใบ
   *
   * key เป็น kebab-case ตามธรรมเนียมของหน้านี้ (`cod-received`, `copy-link`) ไม่ใช่
   * `RECORD_PAYMENT` ของไลบรารีแชท — แปลงที่จุดเดียวตรงนี้ แล้ว `handleAction` รับคีย์เดียว
   */
  const actionSet = recordPaymentAction
    ? {
        primary: { key: 'record-payment', label: recordPaymentAction.label, icon: recordPaymentAction.icon },
        ghosts: withReturn.primary ? [withReturn.primary, ...withReturn.ghosts] : withReturn.ghosts,
        menu: withReturn.menu,
      }
    : withReturn

  // คัดลอกข้อความ/ลิงก์ — Base: CopyLinkButton.tsx handleCopy (fallback execCommand สำหรับ HTTP context)
  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    pacesToast.success(successMessage)
  }

  // Base: SendSmsButton.tsx handleOpenDialog — confirm+fetch ใน flow เดียว (Swal preConfirm),
  // error ค้าง dialog ผ่าน showValidationMessage. RC-8: ไม่ส่ง buyerContact ใด ๆ จาก client
  const handleSendSms = async () => {
    // โหลดตรงนี้แทน import บนหัวไฟล์ — ปุ่มนี้อยู่ใน ⋮ ผู้ใช้ส่วนใหญ่ไม่ได้กดทุกครั้งที่เปิดหน้า
    const Swal = (await import('sweetalert2')).default
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'ส่งลิงก์ทาง SMS?',
      text: `ระบบจะส่งลิงก์${vocab.noun}ทาง SMS ให้ลูกค้า และหัก ฿1 จากกระเป๋าเงินของคุณ`,
      showCancelButton: true,
      confirmButtonText: 'ส่ง SMS',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch(`/api/orders/${publicToken}/send-sms`, { method: 'POST' })
          if (res.ok) return true
          Swal.showValidationMessage(smsErrorMessage(res.status, vocab.noun, hidePayments))
          return false
        } catch {
          Swal.showValidationMessage('ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
      },
    })
    if (result.isConfirmed && result.value === true) {
      pacesToast.success('ส่ง SMS แล้ว ฿1 ถูกหักจากยอดเงิน')
    }
  }

  // Base: CancelOrderButton.tsx handleCancel — confirm → POST → toast → refresh
  // T14 (เพิ่ม): ของเดิมใช้ข้อความ "สินค้าจะถูกคืนเข้าสต็อก" ชุดเดียวทุกสถานะ — ไม่จริงเมื่อ
  // status==='SHIPPED' (ของออกจากร้านไปแล้ว จะคืนสต็อกไม่ได้จริง ๆ) แยกข้อความตามสถานะแทน
  const handleCancelOrder = async () => {
    /**
     * 00030 D-1 — ข้อความต้องตรงกับสิ่งที่ระบบทำจริง
     *
     * เดิมแยกด้วย `status === 'SHIPPED'` แล้วบอกว่า "ระบบจะไม่คืนเข้าสต็อกอัตโนมัติ" ซึ่งเป็นเท็จ:
     * `cancelOrder` (order.service.ts) เรียก `restockFromCancelledOrder` **โดยไม่ดูสถานะเลย** และ
     * ตัวมันเองกรองด้วย `stockDeducted != null` อย่างเดียว (inventory-stock.service.ts) — ออเดอร์
     * ที่ส่งไปแล้วแต่เคยตัดสต็อกจึงถูกคืนสต็อกจริง ตรงข้ามกับที่ข้อความบอก
     *
     * เงื่อนไขที่ถูกคือ hasDeductedStock ตัวเดียว ไม่เกี่ยวกับ status
     * (ว่าการคืนสต็อกให้ออเดอร์ที่ส่งของออกไปแล้ว *ควร* เกิดขึ้นไหม เป็นคำถามเชิงธุรกิจคนละเรื่อง
     *  — ยังไม่แก้ในรอบนี้ บันทึกไว้เป็นหนี้)
     */
    const linkClause = 'ลิงก์ที่ส่งให้ลูกค้าจะใช้ไม่ได้ · ย้อนกลับไม่ได้'
    const cancelDetail = hasDeductedStock
      ? `สินค้าจะถูกคืนเข้าสต็อก · ${linkClause}`
      : linkClause
    // feature 00039 — บังคับเลือกเหตุผล (API คืน 400 ถ้าไม่ส่ง)
    // เหตุผลเก็บเป็นประวัติเท่านั้น ไม่มีผลต่ออัตราความสำเร็จ — บอกผู้ใช้ตรง ๆ ในโมดัล
    // เพื่อไม่ให้ร้านเข้าใจผิดว่าเลือกคำไหนแล้วตัวเลขจะดีขึ้น
    const reason = await pacesConfirmWithReason({
      title: `ยกเลิก${vocab.noun}นี้?`,
      html: `${cancelDetail}<div class="text-xs text-default-500 mt-2">เหตุผลที่เลือกเก็บไว้เป็นบันทึกประวัติ ไม่มีผลต่ออัตราความสำเร็จของร้าน</div>`,
      options: CANCEL_REASONS_BY_VERTICAL[vertical],
      validationMessage: `เลือกเหตุผลก่อนยกเลิก${vocab.noun}`,
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!reason) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `ยกเลิก${vocab.noun}ไม่สำเร็จ กรุณาลองใหม่`)
      }
      pacesToast.success(`ยกเลิก${vocab.noun}แล้ว`)
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `ยกเลิก${vocab.noun}ไม่สำเร็จ กรุณาลองใหม่`
      pacesToast.error(message)
    }
  }

  /**
   * ยืนยันก่อนกด เพราะมันคือการบันทึกข้อเท็จจริงทางการเงิน — กดพลาดแล้วใบนั้นจะหลุดออกจาก
   * กอง "รอเงิน COD" ไปเงียบ ๆ ทั้งที่ยังไม่ได้เงิน ซึ่งเป็นความผิดพลาดที่ตามเก็บยากที่สุด
   * (ย้อนได้ผ่าน DELETE ของ endpoint เดียวกัน แต่ต้องรู้ตัวก่อนว่ากดผิด)
   */
  const handleCodReceived = async () => {
    const ok = await pacesConfirm.question(
      'ยืนยันว่าได้รับเงินปลายทางแล้ว?',
      'ระบบจะบันทึกว่าร้านได้รับเงินของคำสั่งซื้อนี้แล้ว และใบนี้จะออกจากกอง "รอเงิน COD" บนหน้าแรก',
      { confirmButtonText: 'ได้รับเงินแล้ว', cancelButtonText: 'ยังไม่ได้รับ' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/cod-received`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกแล้วว่าได้รับเงินปลายทาง')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  /** ย้อนการยืนยัน — กดผิดแล้วต้องแก้ได้ ไม่งั้นตัวเลขเงินในระบบผิดถาวรโดยไม่มีทางกลับ */
  const handleCodUndo = async () => {
    const ok = await pacesConfirm.question(
      'ยกเลิกการยืนยันรับเงิน?',
      'ใบนี้จะกลับไปอยู่ในกอง "รอเงิน COD" บนหน้าแรกอีกครั้ง',
      { confirmButtonText: 'ยกเลิกการยืนยัน', cancelButtonText: 'ไม่ใช่' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/cod-received`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('ยกเลิกการยืนยันแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  /**
   * feature 00062 (U17) — ยืนยันได้รับเงินโอน/พร้อมเพย์/เงินสด
   *
   * 🛑 **มี confirm เหมือน `handleCodReceived` ข้างบน** — UX-Design-Spec §A3 เดิมเขียนว่า
   * "ไม่ต้องมี confirm (mirror CodCard ซึ่งไม่มีเช่นกัน)" แต่**คำอ้างนั้นผิด**: เปิดโค้ดดูแล้ว
   * `handleCodReceived`/`handleCodUndo` มี `pacesConfirm.question` ทั้งคู่ (ตรวจ 2026-08-29)
   * — เป็นกรณีที่เอกสารอ้างพฤติกรรมโค้ดผิดแล้วถูกใช้เป็นเหตุผลในการออกแบบ
   * (`docs/conventions/docs-claimed-constraint-verify-in-code.md`)
   *
   * เมื่อเหตุผลที่อ้างไม่จริง จึงยึดตามความเสี่ยงจริงแทน: ปุ่มนี้เป็น **คำยืนยันเรื่องเงิน**
   * กดพลาดแล้วตัวเลขในระบบผิด และการ์ดสองใบที่นั่งข้างกันในคอลัมน์เดียวกันไม่ควรมีพฤติกรรม
   * ต่างกันโดยไม่มีเหตุผลที่ผู้ใช้เดาได้ (`docs/conventions/sibling-surface-parity.md`)
   */
  const handlePaymentReceived = async () => {
    const ok = await pacesConfirm.question(
      'ยืนยันว่าได้รับเงินแล้ว?',
      'ระบบจะบันทึกว่าร้านได้รับเงินของคำสั่งซื้อนี้แล้ว — ยกเลิกภายหลังได้ถ้ากดผิด',
      { confirmButtonText: 'ได้รับเงินแล้ว', cancelButtonText: 'ยังไม่ได้รับ' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/payment-confirm`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  /** ย้อนการยืนยัน — เหตุผลเดียวกับ `handleCodUndo`: กดผิดแล้วต้องแก้ได้ ไม่งั้นตัวเลขเงินผิดถาวร */
  const handlePaymentUndo = async () => {
    const ok = await pacesConfirm.question(
      'ยกเลิกการยืนยันรับเงิน?',
      'ป้ายสถานะจะกลับไปเป็น "รอชำระ" — กดยืนยันใหม่ได้ทุกเมื่อ',
      { confirmButtonText: 'ยกเลิกการยืนยัน', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/payment-confirm`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('ยกเลิกการยืนยันแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  /**
   * impeccable critique P0-1 (2026-08-29) — "ยกเลิกการยืนยันมอบสินค้า" จากเมนู ⋮ (key=
   * 'pickup-handover-undo') คนละจุดกับปุ่ม undo บนการ์ด "การนัดรับ" (ShippingAddress.tsx —
   * self-contained ด้วยเหตุผลเดียวกับ handlePickupHandedOver ด้านล่าง) มิเรอร์
   * `ShippingAddress.handleUndoHandover` ทุกตัวอักษร (ข้อความ/endpoint) ตาม sibling-surface-parity
   */
  const handlePickupHandoverUndo = async () => {
    const ok = await pacesConfirm.question(
      'ยกเลิกการยืนยันว่ามอบสินค้าแล้ว?',
      'นาฬิกาปิดงานอัตโนมัติจะหยุดนับ — กดยืนยันใหม่ได้ทุกเมื่อ',
      { confirmButtonText: 'ยกเลิกการยืนยัน', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/handover`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('ยกเลิกการยืนยันแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  /**
   * feature 00062 (U16) — "มอบสินค้าแล้ว" จากแถบ action ล่างจอ (<1024, order-action-set.ts
   * key='pickup-handed-over') คนละจุดกับปุ่มบนการ์ด "การนัดรับ" (ShippingAddress.tsx — self
   * -contained เพราะการ์ดนั้นถูก page.tsx render ตรงใน sideCards ไม่ผ่าน OrderDetailClient)
   * ต้อง fetch เดียวกันซ้ำ 2 จุดโดยสถาปัตยกรรม — ไม่มีจุดกลางให้เรียกร่วมโดยไม่แตะไฟล์นอกขอบเขต
   */
  const handlePickupHandedOver = async () => {
    /**
     * 🛑 ต้อง confirm เพราะปุ่มนี้ **เริ่มนับนาฬิกาปิดงานอัตโนมัติ 48 ชม.** — กดพลาดแล้วออเดอร์
     * จะถูกปิดเองโดยที่ลูกค้ายังไม่ได้รับของ ซึ่งไปนับเป็นออเดอร์สำเร็จของร้าน (Trust Score)
     * ไม่ใช่แค่ป้ายบนจอเปลี่ยน
     */
    const ok = await pacesConfirm.question(
      'ยืนยันว่ามอบสินค้าให้ลูกค้าแล้ว?',
      'ระบบจะปิดงานให้อัตโนมัติเมื่อครบ 48 ชั่วโมง หากลูกค้าไม่ทักท้วง — ยกเลิกได้ก่อนครบกำหนด',
      { confirmButtonText: 'มอบสินค้าแล้ว', cancelButtonText: 'ยังไม่ได้มอบ' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/handover`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  // ปุ่ม action ทั้งหมดของหน้านี้ (StatusHero inline/stuck + OrderActionBar variant="bottom") วิ่งเข้า
  // handler เดียวนี้ผ่าน key จาก order-action-set.ts — ดูตาราง key → พฤติกรรมในรายงาน T11
  const handleAction = (key: string) => {
    switch (key) {
      case 'return-order':
        setReturnOpen(true)
        return
      case 'record-payment':
        setPayOpen(true)
        return
      case 'send-sms':
        void handleSendSms()
        return
      case 'report-tracking':
        setModalMode('create')
        setModalOpen(true)
        return
      case 'edit-tracking':
        setModalMode('edit')
        setModalOpen(true)
        return
      case 'copy-link': {
        // Base: OrderCopyLink.tsx — shortCode (สั้น) ก่อน fallback publicToken
        const url = `${resolveBuyerBaseUrl()}/o/${shortCode || publicToken}`
        void copyText(url, 'คัดลอกลิงก์แล้ว')
        return
      }
      case 'copy-tracking':
        if (trackingNo) void copyText(trackingNo, 'คัดลอกเลขพัสดุแล้ว')
        return
      case 'copy-address':
        if (addressText) void copyText(addressText, 'คัดลอกที่อยู่จัดส่งแล้ว')
        return
      case 'edit-order':
        router.push(`/orders/${publicToken}/edit`)
        return
      case 'cod-received':
        void handleCodReceived()
        return
      case 'pickup-payment-received':
        void handlePaymentReceived()
        return
      case 'pickup-handed-over':
        void handlePickupHandedOver()
        return
      case 'pickup-handover-undo':
        void handlePickupHandoverUndo()
        return
      case 'cancel-order':
        void handleCancelOrder()
        return
      default:
        return
    }
  }

  return (
    <>
      {/* โครงตามธีม Paces order-details เป๊ะ: grid 75/25 · ซ้าย = สรุปคำสั่งซื้อ + ประวัติ ·
          ขวา = ผู้ซื้อ / ที่อยู่ / การชำระเงิน / รีวิว
          Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx */}
      <div className="grid grid-cols-1 gap-base lg:grid-cols-4">
        <div className="space-y-base lg:col-span-3">
          {/* ── ของตีกลับถึงร้านแล้ว: บอกว่าจบงานยังไง ──────────────────────────────
              วางเหนือการ์ดสรุปเพราะเป็น "สิ่งที่ต้องทำต่อ" ไม่ใช่ข้อมูลประกอบ

              🛑 ปุ่มเป็นปุ่มขอบ ไม่ใช่ปุ่มทึบ — การยกเลิกเป็น action ที่ถอนคืนไม่ได้
              (docs/conventions/seller-action-placement.md) ตัวเต็มยังอยู่ใน ⋯ ตามเดิม
              ตรงนี้แค่ทำให้มัน "หาเจอ" ในจังหวะที่ร้านต้องใช้จริง

              ประโยคเรื่องอัตราความสำเร็จไม่ใช่คำปลอบใจ — ยืนยันกับโค้ดแล้วว่าจริง:
              shop.service.ts:381 หักใบที่ `carrierStatus` เป็นตีกลับออกจากตัวหารเสมอ
              (BR-OSM-04) ร้านที่กลัวเสีย % แล้วปล่อยใบค้างไว้คือสิ่งที่ประโยคนี้แก้ */}
          {shouldPromptCloseReturnedOrder({ status, parcelReturned }) && (
            <div className="bg-warning/15 text-default-800 flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Icon
                  icon="tabler:package-off"
                  className="text-warning-ink mt-0.5 shrink-0 text-lg"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-default-900 mb-0.5 text-sm font-semibold">
                    พัสดุถูกตีกลับมาที่ร้าน
                  </p>
                  <p className="mb-0 text-xs">
                    ลูกค้าไม่ได้รับของ — ปิดงานด้วยการยกเลิก{vocab.noun}นี้ได้เลย
                    การยกเลิกเพราะของตีกลับ <span className="font-semibold">ไม่ถูกนับ</span>
                    เป็นความผิดของร้านในอัตราความสำเร็จ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCancelOrder()}
                className="btn border-default-300 text-default-700 shrink-0 justify-center border text-sm font-medium"
              >
                ยกเลิก{vocab.noun}
              </button>
            </div>
          )}
          <OrderSummary
            /* ร้านบริการได้ป้ายจากเงินที่รับจริง (จอง/รอชำระ/ชำระเงินแล้ว) —
               `serviceBadge` เป็น null สำหรับ vertical อื่นเสมอ ⇒ ป้ายเดิมไม่ขยับ (AC-SQ-07) */
            serviceBadge={serviceBadge}
            /* ป้ายการชำระเงินต้องอ่านบัญชีเงินก่อน `Order.status` เสมอเมื่อร้านมีบัญชี */
            serviceMoney={serviceMoney}
            actionSet={actionSet}
            createdAtISO={createdAtISO}
            internalNote={internalNote}
            isCod={isCod}
            discount={discount}
            isFromAuction={isFromAuction}
            items={items}
            onAction={handleAction}
            orderNoun={orderNoun}
            paymentMethod={paymentMethod}
            publicToken={publicToken}
            salesChannel={salesChannel}
            pageLogoUrl={pageLogoUrl}
            slipFileId={slipFileId}
            paymentConfirmedAt={paymentConfirmedAtISO}
            status={status}
            shippingStage={shippingStage}
            totalAmount={totalAmount}
            vatAmount={vatAmount}
            vatRate={vatRate}
          />
          {shippingActivity}
        </div>
        <div className="space-y-base">
          {customerCard}
          {/* การ์ดเงินอยู่ใต้ผู้ซื้อ = ลำดับที่ร้านอ่านจริง (ใครซื้อ → ได้เงินหรือยัง → ส่งที่ไหน) */}
          {isCod ? (
            <CodCard
              codReceivedAtISO={codReceivedAtISO}
              onMarkReceived={handleCodReceived}
              onUndo={handleCodUndo}
              receivedByLabel={codReceivedByLabel}
              totalAmount={totalAmount}
            />
          ) : (
            // feature 00062 (U17) — mutually exclusive กับ CodCard (paymentMethod มีค่าเดียว)
            // แสดงทุกสถานะที่ไม่ใช่ CANCELLED โดยไม่สนใจ order.status (UX §A3 — ต่างจาก COD ที่
            // ผูก SHIPPED/CONFIRMED เพราะเงินโอน/พร้อมเพย์/เงินสดรับได้ตั้งแต่ PENDING)
            //
            // 🛑 `!isServiceQueue` — ร้านบริการมีเจ้าของคำถาม "ได้เงินยัง" อยู่แล้วคือ **บัญชีเงิน**
            // (`OrderPayment`, feature 00050) การ์ดนี้เป็นของ **ธงใบเดียว** (`paymentConfirmedAt`)
            // ซึ่ง `00062/PRD.md` D-2 เขียนเองว่าไม่เอา concept มัดจำของ 00050 มาปน — แต่ **ไม่เคยมี
            // ด่าน vertical จริง** มีแต่ `canSellerConfirmPayment()` ที่ตัดสินจาก *วิธีชำระ*
            // ⇒ การ์ดไหลเข้าร้านบริการทั้งที่ PRD ของตัวเองบอกว่าอยู่นอกขอบเขต
            //
            // วัดจอจริง 2026-08-31 (บิลบริการ PENDING ฿900 มัดจำ 900): ปุ่ม "รับเงินแล้ว" (บัญชี)
            // กับ "ได้รับเงินแล้ว" (ธง) โผล่พร้อมกัน และการ์ดชื่อ **"การชำระเงิน" ซ้ำกัน 2 ใบ**
            // ในหน้าเดียว — สองระบบไม่รู้จักกันเลย (`recordPayment` ไม่แตะธง · `setPaymentConfirmed`
            // ไม่สร้างแถวบัญชี) กดคนละปุ่มได้ผลคนละอย่างโดยไม่มีอะไรฟ้อง
            //
            // 🛑 กันเฉพาะ SERVICE_QUEUE ไม่ใช่ allow-list — `LODGING` ยังไม่มีร้านจริงสักร้าน
            // (ตรวจฐาน 2026-08-31: 0 ร้าน 0 ออเดอร์) และธงใบเดียวคือกลไกเงินเดียวที่มันมี
            // ค่า vertical ใหม่ในอนาคตต้องได้พฤติกรรมเดิมไว้ก่อน ไม่ใช่ถูกตัดเงียบ ๆ
            !isServiceQueue &&
            canSellerConfirmPayment(paymentMethod) &&
            status !== 'CANCELLED' && (
              <PaymentReceivedCard
                confirmedByLabel={paymentConfirmedByLabel}
                onMarkReceived={handlePaymentReceived}
                onUndo={handlePaymentUndo}
                paymentConfirmedAtISO={paymentConfirmedAtISO}
                paymentMethod={paymentMethod}
                slipFileId={slipFileId}
                status={status}
                totalAmount={totalAmount}
              />
            )
          )}
          {/* กำไรอยู่ในกลุ่ม "ข้อมูลการเงินของใบนี้" ต่อจาก COD — ไม่ใช่แถวในการ์ดสรุปยอด
              เพราะยอดที่ลูกค้าจ่ายกับกำไรที่ร้านได้หน้าตาเหมือนกันจนอ่านสลับกันได้ */}
          {profitCard}
          {sideCards}
        </div>
      </div>

      {/* <1024 เท่านั้น (className ภายในมี lg:hidden) — CANCELLED คืน null เอง (design §3) */}
      <OrderActionBar variant="bottom" actionSet={actionSet} onAction={handleAction} />

      {/* ชีตคืนของ (feature 00056) — component ตัวเดียวกับที่ห้องแชทใช้ ต่างแค่จุดที่เปิด
          `initialCount={0}` เพราะจำนวนจริงมาตอนโหลดในชีต (หน้านี้ไม่ query ล่วงหน้าแล้ว —
          ออเดอร์ส่วนใหญ่ไม่มีการคืนของ การนับทุกครั้งที่เปิดหน้าคือคิวรีที่แทบไม่มีใครได้ใช้) */}
      {isOnlineSales && (
        <ReturnPanel
          orderToken={publicToken}
          sheetOpen={returnOpen}
          onCloseSheet={() => setReturnOpen(false)}
        />
      )}

      {/* ชีตรับเงิน (feature 00050) — **component ตัวเดียวกับที่แชทใช้** ไม่ได้เขียนตัวที่สอง
          `shopId={null}` ถูกต้องที่นี่: หน้านี้สโคปอยู่ที่ร้านที่ active อยู่แล้ว ต่างจากกล่องแชท
          ที่เปิดเธรดของร้าน B ได้ขณะ active ร้าน A (BR-UNI-07) จึงต้องระบุร้านชัด ๆ ที่นั่น
          onChanged → refresh: ตัวเลขบนการ์ด "เงินที่รับแล้ว" กับป้ายสถานะ render ที่ server */}
      {serviceMoney && payOpen && (
        <RecordPaymentSheet
          open={payOpen}
          onClose={() => setPayOpen(false)}
          orderToken={publicToken}
          orderLabel={orderLabel ?? publicToken.slice(0, 8).toUpperCase()}
          shopId={null}
          money={serviceMoney}
          onChanged={() => router.refresh()}
        />
      )}

      {/* mount เฉพาะตอนเปิด — ถ้าปล่อยไว้ใน tree ตลอดแล้วให้ตัวมันคืน null เอง
          chunk ที่แยกออกไปจะถูกโหลดทันทีที่หน้า mount = ไม่ได้แยกอะไรเลย */}
      {modalOpen && (
        <ShipmentEntryModal
          open
          onClose={() => setModalOpen(false)}
          // โมดัลไม่ router.refresh() เอง (ยกเว้น branch iShip ที่มีของตัวเองอยู่ก่อนแล้ว) — หน้าเป็นคนสั่ง
          onSuccess={() => router.refresh()}
          orderToken={publicToken}
          mode={modalMode}
          ishipContext={ishipContext}
          hasIshipShipment={hasIshipShipment}
          initialTrackingNo={trackingNo}
          initialProvider={provider}
        />
      )}
    </>
  )
}
