'use client'

/**
 * CustomerPanel — แผงขวาของ /inbox/[conversationId] (feat 00018 T5, ภาคผนวก A-1)
 *
 * ไม่พบ theme "contact info sidebar" ตรง (Paces ไม่มี component นี้) — closest primitive:
 *   Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (`.card`) — การ์ดเดี่ยว
 *   ดู docs/system/ui-guideline/paces-component-reference.md §7
 * Tab bar: Base theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx:677-689 (`.nav-tabs`/`.nav-link`
 * class) แต่ขับ active state ด้วย React state เอง ไม่ใช้ `data-hs-tab` ของ Preline — เหตุผลเดียวกับ
 * channel tabs ใน InboxList.tsx (parent re-render บ่อยจาก fetch ทำให้ Preline inline-state พัง)
 * ดู docs/superpowers/specs/2026-07-22-facebook-chat-ui-design.md ตาราง "Theme Source Mapping"
 * แถว "Customer Panel shell (desktop)"
 *
 * A-1: CTA + tab ที่ 2 เปลี่ยนตาม Shop.vertical — ONLINE_SALES/SERVICE_QUEUE→"สร้างออเดอร์"/"คำสั่งซื้อ",
 * LODGING→"เปิดการจอง"/"การจอง" (feature 00028 ขยายจาก 2→3 ทาง). `vertical` ถูก resolve (fallback ONLINE_SALES เมื่อค่าไม่รู้จัก)
 * ที่ page.tsx (server, อ่านจาก Conversation.shopId → Shop.vertical) ก่อนส่งลงมาเป็น prop —
 * component นี้ไม่เดาเองจาก path/session (ข้อกำหนดของ Controller)
 *
 * CTA ลิงก์ไปหน้าเดิม (/orders/new, /bookings/new) แบบไม่มี query param prefill — ทั้งสอง route
 * ปลายทาง (อ่านแล้วตอน implement) ยังไม่มี `searchParams` handling ใด ๆ เลย จึงลิงก์เฉย ๆ ตามคำสั่ง
 * Controller ("ถ้ายังไม่รองรับ ให้ลิงก์ไปหน้านั้นเฉย ๆ ห้ามแก้หน้าปลายทาง — นอกขอบเขต") ดู t45-report.md
 *
 * icon ปุ่ม LODGING (`calendar-check`) reuse จาก _seller-menu.ts (nav item "การจอง" — verified มีจริง
 * ใน tabler แล้ว) — สเปกหลัก (ตาราง icon ท้ายเอกสาร) ไม่ครอบ CTA นี้เพราะภาคผนวก A-1 เพิ่มมาทีหลัง
 * ตารางนั้น จึงเลือก icon ที่ verify แล้วจากที่อื่นในโปรเจกต์แทนการเดาใหม่
 *
 * ไม่มีปุ่ม "ยกเลิกการผูกลูกค้า" (BRD ไม่มี FR ครอบ — spec Design decisions #5)
 * ไม่มี tab "แท็ก"/"Note"/"ใบเสนอราคา" (นอก scope phase นี้ — ไม่มีตาราง DB/ยังไม่ปิด OQ)
 * ✅ ลิงก์ "ดูโปรไฟล์เต็ม" → `/customers/c-{customerId}` มีแล้วตั้งแต่ feature 00057 (2026-08-24)
 * — คอมเมนต์เดิมตรงนี้เขียนไว้ว่าหน้าปลายทาง "ยังไม่มีอยู่จริง" ซึ่งเป็นจริง ณ ตอนนั้น
 * แสดงเฉพาะเมื่อเธรดผูกกับ Customer กลางแล้ว (`data.customer != null`) เพราะ key แบบ `c-`
 * เป็นแบบเดียวที่ประกอบจากข้อมูลในแผงนี้ได้โดยไม่ต้องเดา
 *
 * เบอร์โทร (`customer.phone`) ส่งมาเต็มตั้งแต่ 2026-08-24 (D-13) — ดู lib/seller-contact-display.ts
 * ก่อนส่งลง prop นี้ — RSC PII rule: หน้า seller อยู่ใต้ client VerticalLayout ทุก prop ที่ผ่านลงมา
 * ถูก serialize เข้า flight payload หมด ไม่ว่าจะ render จริงหรือไม่
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import CustomerFileLibrarySection from './CustomerFileLibrarySection'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { ORDER_VOCAB, resolveOrderVocab } from '@/lib/seller-menu'
import { type OrderStatus } from '@/lib/order-display'
import type { ShopVertical } from '@/lib/lodging'
import {
  completionWarning,
  computeOrderMoneyFromSerialized,
  type SerializedPaymentRow,
} from '@/lib/order-payment'
import { chatOrderActions } from '@/lib/chat-order-actions'
import RecordPaymentSheet from '../../../_components/RecordPaymentSheet'
import StartWalkInSheet from '../../../_components/StartWalkInSheet'
import { markServedFlow } from '../../../_components/mark-served'
// import ข้ามกลุ่มโฟลเดอร์ตาม precedent ใน OrderActionBar.tsx — reuse ⋮ + SSOT ของ action
// เดียวกับหน้า order detail แทนประดิษฐ์ dropdown/เงื่อนไขสถานะใหม่ (sibling-surface-parity)
import OrderOverflowMenu from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderOverflowMenu'
import type { ActionItem } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set'
import { getOrderActionSet } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set'
import { ChannelBadge } from '../../components/ChannelBadge'
// SSOT ของป้ายพฤติกรรมลูกค้า — ป้ายท้ายชื่อลูกค้าในตาราง /orders ใช้ตัวเดียวกัน (HR16)
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { Dictionary } from '@/i18n/dictionaries/th'
import CustomerCrmSection, { type ConversationCrm } from './CustomerCrmSection'
import { useDraftOrders } from '../../../_components/DraftOrderProvider'
import OrderCardView from '../../../_components/OrderCardView'
import ReturnPanel from '../../../../(dashboard)/orders/[token]/components/ReturnPanel'
import AppointmentSummarySheet from '../../../_components/AppointmentSummarySheet'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm, pacesConfirmWithReason } from '@/lib/paces-swal'
import { CANCEL_REASONS_BY_VERTICAL } from '@/lib/cancel-reasons'
import { toFileUrl } from '@/lib/file-url'

export type CustomerPanelOrder = {
  id: string
  token: string
  orderNo?: string | null // เลขคำสั่งซื้อ DP… (user 2026-07-25)
  status: string
  fulfillmentMode: string
  totalAmount: string // "1234.00" — Decimal serialize เป็น string ก่อนข้าม RSC boundary
  createdAt: string // ISO
  checkIn: string | null // ISO date — เฉพาะออเดอร์ vertical=LODGING (type=BOOKING)
  checkOut: string | null
  /** ช่วงเวลาเข้าใช้บริการ (feature 00024) — เฉพาะออเดอร์ที่มีนัด null = walk-in
   *  เพิ่ม 2026-08-08: ห้องแชทต้องไล่แกน "นัดถึงขั้นไหน" ได้ ไม่ใช่แกนขนส่งอย่างเดียว */
  serviceStart?: string | null // ISO
  serviceEnd?: string | null // ISO
  /** SCHEDULED | CONFIRMED_BY_BUYER | RESCHEDULE_REQUESTED | COMPLETED | NO_SHOW */
  appointmentStatus?: string | null
  /** ยอดมัดจำที่ตกลงกันไว้ "300.00" — snapshot ตอนสร้าง ไม่ใช่สูตรสด (BR-RSV-46/47)
   *  IMPORTANT: ค่านี้คือ **ข้อตกลง** ไม่ใช่เงินที่เข้าแล้ว — ห้ามแสดงเป็นสถานะที่สื่อว่า
   *  "เก็บแล้ว" (BR-SQ-02) · เงินที่รับจริงอยู่ที่ตาราง `OrderPayment` ตั้งแต่ feature 00050
   *  ใช้ `computeOrderMoney()` เป็นตัวรวม อย่าบวกลบเองในคอมโพเนนต์ (Hard Rule 16) */
  depositAmount?: string | null
  /** เงินที่ **ได้รับจริง** ของออเดอร์ใบนี้ (feature 00050) — คนละเรื่องกับ depositAmount ข้างบน
   *  แปลงเป็นตัวเลขด้วย `computeOrderMoneyFromSerialized()` เท่านั้น ห้ามบวกเองในคอมโพเนนต์ */
  payments?: SerializedPaymentRow[]
  // รายการสินค้า (user 2026-07-25: การ์ด right panel แสดงเหมือนในแชท — ชื่อ/จำนวน/ราคา/รูป)
  items: { name: string; qty: number; price: string; imageFileId: string | null }[]
  /** พัสดุ iShip ที่ยังใช้งานอยู่ (feature 00022) — null = ยังไม่เปิดพัสดุ
   *  status/carrierStatus/courierCode เพิ่ม 2026-08-05 (Order Progress): ให้ stepper 4 ขั้น +
   *  โลโก้ขนส่ง render ได้จาก data ที่มากับลิสต์ ไม่ต้องยิง API ต่อใบ */
  shipment?: {
    trackingNo: string | null
    courierName: string | null
    courierCode: string | null
    status: string
    carrierStatus: string | null
    /** เวลาของ "ขากลับ" — แถวที่ 2 ของ stepper อ่านจากสองช่องนี้ (null = ขนส่งไม่ได้แจ้ง) */
    returnStartedAt?: string | null
    returnedAt?: string | null
  } | null
  /** วิธีชำระ + เวลากดรับเงิน COD — ให้ deriveShippingStage แยก AWAITING_COD ได้ (Order Progress) */
  paymentMethod?: string | null
  codReceivedAt?: string | null
  /** Order.updatedAt ISO — ให้การ์ดเรียก deriveOrderStage แบบปิด age-decay (ชิปไม่หมดอายุ) */
  statusAt?: string
}

export type CustomerPanelData = {
  conversationId: string // feature 00018 CRM — ใช้เรียก /api/chat/conversations/[id]/crm
  contactName: string
  /** รูปโปรไฟล์ลูกค้า (user report 2026-07-24: right panel ไม่มีรูป) — http URL (IG profile_pic)
   *  หรือ storage fileId (avatar buyer Deep); null → fallback initials. ค่าเดียวกับ buyerAvatar
   *  ที่ ChatThread header ใช้ (page.tsx ส่งชุดเดียวกัน) */
  avatar: string | null
  channel: string // 'DEEP' | 'MESSENGER' | 'INSTAGRAM'
  /** ชื่อเพจที่เธรดผูกอยู่ — badge แสดงชื่อเพจแทนชื่อช่องทาง (ให้ตรงกับ header เธรด) null = Deep */
  channelName: string | null
  /** รูปเพจที่เธรดผูกอยู่ (ShopChannel.avatarUrl) — badge มุม avatar ของหน้าต่างร่าง/ชิปที่ย่อไว้
   *  (user สั่ง 2026-08-07 "ถ้า page มี logo ให้ใช้ logo page แทน") null = Deep/เพจไม่มีรูป */
  channelAvatarUrl: string | null
  vertical: ShopVertical
  /**
   * ร้านของเธรดนี้ (feature 00050) — ส่งต่อเป็น `?shopId=` ให้ API ที่ปุ่มบนการ์ดยิง
   *
   * 🛑 ต้องมาจาก `Conversation.shopId` ไม่ใช่ `activeShopId`: เธรดของร้าน B เปิดได้ขณะ
   * active อยู่ร้าน A (BR-UNI-07) ⇒ ปุ่มจะหาออเดอร์ไม่เจอแล้วกดกี่ครั้งก็ไม่ผ่าน
   */
  shopId: string
  /**
   * null = ยังไม่ผูก Customer
   *
   * 🛑 เดิมฟิลด์นี้ชื่อ `phoneMasked` และคอมเมนต์ตรงนี้เขียนว่า "ห้ามส่งเบอร์เต็ม" —
   * มติ D-13 (2026-08-24) กลับข้อนั้น: ผู้ขายเป็นเจ้าของข้อมูลลูกค้าตัวเอง และการปิดบัง
   * ทำให้ค้นหาไม่เจอโดยไม่ได้ปกป้องใคร (เหตุผลเต็มใน lib/seller-contact-display.ts)
   * เปลี่ยนชื่อฟิลด์ตามความจริงด้วย — ฟิลด์ชื่อ `phoneMasked` ที่ถือค่าเต็มคือกับดัก
   * ที่รอให้คนถัดไปเชื่อชื่อแล้วเอาไปโชว์ในที่ที่ไม่ควรโชว์
   */
  customer: { id: string; phone: string } | null
  /** สถิติลูกค้า (aggregate จริงทั้งหมด ไม่ใช่แค่ orders 20 แถวที่ list ใช้) — null = ยังไม่ผูก Customer
   *  orderCount = ทุกออเดอร์; totalSpent = ผลรวมที่ไม่ยกเลิก (Decimal→string); since = วันเป็นลูกค้า (ISO) */
  customerStats: { orderCount: number; totalSpent: string; since: string } | null
  /** feature 00018 E5 — รหัสโฆษณาที่พาลูกค้าคนนี้เข้ามา (null = ไม่ได้มาจากโฆษณา)
   *  ใช้ทำป้ายกำกับอัตโนมัติ `ad_id.…` / `messenger_ads` แบบ Business Suite */
  adReferralId: string | null
  orders: CustomerPanelOrder[]
}

/** avatar หัวแผงลูกค้า — รูปจริง (http URL หรือ storage fileId) + fallback initials ถ้าไม่มี/โหลดพลาด
 *  (user report 2026-07-24: right panel ไม่มีรูป). ตรรกะ src เดียวกับ ChatAvatar ใน ChatThread.tsx */
function PanelAvatar({ avatar, name }: { avatar: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (toFileUrl(avatar)) : null
  if (!src || failed) {
    return (
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="bg-default-100 size-10 shrink-0 rounded-full object-cover"
    />
  )
}

type VerticalCta = { label: string; href: string; icon: string; tabLabel: string; emptyLabel: string }

// feature 00028 — GENERAL เดิมแยกเป็น ONLINE_SALES/SERVICE_QUEUE; ทั้งคู่ใช้ CTA "สร้างออเดอร์"
// เหมือนกัน (POS ใช้ได้ทั้ง 2 ประเภทตาม BRD §8.1 matrix — SERVICE_QUEUE ไม่มี booking แยกต่างหาก
// การจองคิวยังจบที่ฟอร์มสร้างออเดอร์ตัวเดียวกัน ไม่ใช่ CTA คนละใบในแผงนี้)
//
// 🛑 2026-08-10: บรรทัดข้างบนเคยเขียนว่า "การจองคิวเป็นคนละหน้าจอ /queues" ซึ่งไม่จริงอีกแล้ว —
// แถบเครื่องมือแชทมีปุ่มปฏิทินที่เปิดตารางว่างแล้วส่งวัน/เวลาเข้าฟอร์มนี้ได้เลย (user สั่ง)
// ยังไม่ใช่ CTA ของแผงลูกค้า (ปุ่มอยู่ในแถบเครื่องมือ) แต่ "ต้องออกไป /queues" ไม่เป็นความจริงแล้ว
// gap ที่ SDS ไม่ครอบ: object key (ไม่ใช่ string literal ในเครื่องหมายคำพูด) grep `'GENERAL'` มองไม่เห็น
/**
 * export เพราะ ChatThread ใช้ตารางเดียวกันทำปุ่ม "สร้างออเดอร์" ในแถวเครื่องมือบนมือถือ
 * (user สั่ง 2026-08-04) — ถ้าต่างคนต่างเขียน label/icon เอง วันที่เพิ่ม vertical ใหม่หรือเปลี่ยน
 * คำเรียก จะเพี้ยนจากกันทันทีโดยไม่มีอะไรเตือน (ร้านบ้านพักต้องได้ "เปิดการจอง" ทั้งสองที่)
 */
export const VERTICAL_CTA: Record<ShopVertical, VerticalCta> = {
  // ONLINE_SALES / SERVICE_QUEUE → /orders/new จึงใช้คำจาก SSOT ของ order (feature 00030 BR-BKU-10b)
  // เดิมไฟล์นี้ประกาศคำเองจนขัดกับ ORDER_VOCAB ตรง ๆ (SERVICE_QUEUE เคยได้ "คำสั่งซื้อ" ทั้งที่
  // sidebar เรียก "ใบสั่งงาน") — ตอนนี้เหลือแค่ href/icon ที่เป็นเรื่องของ routing ไม่ใช่เรื่องของคำ
  ONLINE_SALES: {
    label: ORDER_VOCAB.ONLINE_SALES.createLabelShort,
    href: '/orders/new',
    icon: 'shopping-cart-plus',
    tabLabel: ORDER_VOCAB.ONLINE_SALES.noun,
    emptyLabel: `ยังไม่มีประวัติ${ORDER_VOCAB.ONLINE_SALES.noun}`,
  },
  SERVICE_QUEUE: {
    label: ORDER_VOCAB.SERVICE_QUEUE.createLabelShort,
    href: '/orders/new',
    icon: 'shopping-cart-plus',
    tabLabel: ORDER_VOCAB.SERVICE_QUEUE.noun,
    emptyLabel: `ยังไม่มีประวัติ${ORDER_VOCAB.SERVICE_QUEUE.noun}`,
  },
  /**
   * LODGING ไม่ได้อ่านจาก ORDER_VOCAB โดยตั้งใจ — CTA นี้ชี้ /bookings/new ซึ่งเป็น "การจอง"
   * (วันเข้าพัก + ห้องที่กันไว้) คนละ entity กับ "บิลเข้าพัก" (ยอดเงิน/การชำระ) ที่อยู่ /orders
   * ร้านบ้านพักเห็นทั้งสองเมนูพร้อมกันและเป็นคนละของจริง — ห้ามยุบเป็นคำเดียวกัน
   * (user เคาะ 2026-08-04; docs/20 - Features/00030 .../UX-Copy.md §1 C-3, §6)
   */
  LODGING: {
    label: 'เปิดการจอง',
    href: '/bookings/new',
    icon: 'calendar-check',
    tabLabel: 'การจอง',
    emptyLabel: 'ยังไม่มีประวัติการจอง',
  },
}

/** แถวสถิติลูกค้า — label ซ้าย ค่าขวา (ตามภาพที่ user ส่ง 2026-07-24) เส้นคั่นบาง ๆ ระหว่างแถว
 *  ค่าใช้ font-semibold ให้เด่นกว่า label (ค่าคือสิ่งที่ผู้ขายอยากอ่าน) — token Paces ล้วน (HR7) */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-default-200 py-2.5 text-sm last:border-0">
      <span className="text-default-700">{label}</span>
      <span className="text-default-900 font-semibold">{value}</span>
    </div>
  )
}

export type Tab = 'customer' | 'orders' | 'files' | 'note'

/**
 * คำนามของแท็บที่สอง ผันตาม vertical — ดึงจากคีย์ที่มีอยู่แล้วใน dictionary ไม่ตั้งคำชุดใหม่
 * (`menu.orders[vertical]` / `menu.bookings` มีค่าตรงกับ `VERTICAL_CTA.tabLabel` ทุกตัวอักษร)
 *
 * 🛑 LODGING ตั้งใจให้ tabLabel ("การจอง") ต่างจาก noun ของ /orders ("บิลเข้าพัก") — ห้ามยุบรวม
 */
export function resolveTabNoun(t: Dictionary, vertical: ShopVertical): string {
  return vertical === 'LODGING' ? t.menu.bookings : t.menu.orders[vertical]
}

/** แท็บของ right panel — เคยเป็นค่าคงที่ระดับ module จึงค้างเป็นไทยตลอดไป (feature 00047) */
function buildTabs(t: Dictionary, vertical: ShopVertical): { key: Tab; label: string; icon: string }[] {
  return [
    { key: 'customer', label: t.inbox.customerPanel.tabCustomer, icon: 'user-circle' },
    { key: 'orders', label: resolveTabNoun(t, vertical), icon: 'shopping-cart' },
    /**
     * แท็บคลังไฟล์ (2026-08-14) — user: "เวลาอยู่ใน Mobile จะเข้าไปดูไฟล์ที่ใช้ร่วมกันยากมาก"
     * เดิมคลังไฟล์อยู่ล่างสุดของแท็บ 'customer' ⇒ ทางไปไฟล์บนมือถือคือ 4 ชั้น
     *
     * 🛑 คำบนแท็บสั้นกว่าหัวข้อในตัว section โดยตั้งใจ ("ไฟล์" vs "คลังไฟล์") — แผงกว้าง 384px
     * มี 4 แท็บ ใช้คำเต็มแล้วแถบตกบรรทัด (user เจอเองบน prod 2026-08-14). เก็บเป็นคีย์แยกใน
     * `customerPanel.tab*` ซึ่งเป็นกลุ่มของ "คำบนแถบแท็บ" ทั้งชุด ไม่ใช่คีย์ลอยที่ไม่มีใครรู้ที่มา
     */
    { key: 'files', label: t.inbox.customerPanel.tabFiles, icon: 'folder' },
    { key: 'note', label: t.inbox.customerPanel.tabNote, icon: 'notes' },
  ]
}


/** การ์ดออเดอร์ 1 ใบ (user request 2026-07-24: ข้อมูลเบื้องต้น = ชื่อสินค้า/จำนวนรายการ/ยอด/สถานะ)
 *  + ปุ่ม hover "ส่งเข้าแชท": DEEP → ส่งการ์ดออเดอร์ (type=ORDER); ช่องทางนอก → ส่งลิงก์ /o/{token} (TEXT)
 *  ถามยืนยันก่อนส่ง (Swal) เพราะปุ่มนี้ **แตะพลาดได้** — มันซ้อนอยู่บนการ์ดที่ affordance หลักคือ
 *  "แตะแล้วเปิดโมดัลแก้ไข" และเป็น 1 แตะจากรายการที่ลอยอยู่ ไม่ใช่ขั้นสุดท้ายของ flow ที่ตั้งใจเดินเข้ามา
 *  🛑 เหตุผลไม่ใช่ "outward-facing" (เกณฑ์นั้นพาไปถึงปุ่มส่งของช่องพิมพ์เองซึ่งไม่มีใครใส่ Swal) —
 *  ตารางตัดสินอยู่ที่ `docs/conventions/seller-action-placement.md` §3.1 */
function OrderCard({
  o,
  conversationId,
  contactName,
  channel,
  customerAvatar,
  pageAvatarUrl,
  vertical,
  shopId,
  onCancelled,
}: {
  o: CustomerPanelOrder
  conversationId: string
  contactName: string
  channel: string
  customerAvatar: string | null
  pageAvatarUrl: string | null
  vertical: ShopVertical
  /** ร้านของเธรด — ดูเหตุผลที่ `CustomerPanelData.shopId` */
  shopId: string
  /** แจ้ง OrdersList อัปเดต status ใน local state — ไม่ router.refresh() เพราะจะรบกวน
   *  scroll/​state ของห้องแชทที่เปิดค้างอยู่ (pattern เดียวกับ CRM section ในไฟล์นี้) */
  onCancelled: (id: string) => void
}) {
  const { openDraft } = useDraftOrders()
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  /** ชีต "ส่งสรุปนัด" (ส่วนขยาย 00024 2026-08-11) — ชีตขอข้อมูลเองจาก token ไม่รับ prop
   *  (สรุปนัดมีเบอร์ลูกค้า การส่งเป็น prop = โยน PII ลง flight payload ทุกครั้งที่เปิดห้อง) */
  const [apptOpen, setApptOpen] = useState(false)
  const hasShipment = !!o.shipment
  /**
   * ร้านคิวงานที่ออเดอร์ใบนี้มีนัดจริง → ปุ่มแรกกลายเป็น "ส่งสรุปนัด" **แทนที่** ไม่ใช่เพิ่มปุ่มที่ 3
   *
   * ร้าน SERVICE_QUEUE ได้ `fulfillmentMode = NO_SHIPPING` จึงไม่มีปุ่ม "สร้างพัสดุ" อยู่แล้ว
   * footer จึงเหลือปุ่มเดียวเต็มความกว้าง + ⋮ เหมือนเดิม — ไม่ต้องกางเลขงบพื้นที่ใหม่
   *
   * เกณฑ์คือ "ใบนี้มีนัดไหม" (`serviceStart`) ไม่ใช่แค่ประเภทร้าน — ออเดอร์ walk-in ของร้าน
   * คิวงานไม่มีนัดผูก (BR-RSV-04) ส่งสรุปนัดของสิ่งที่ไม่มีนัดไม่ได้
   */
  const isAppointment = vertical === 'SERVICE_QUEUE' && !!o.serviceStart
  /** ชีตรับเงิน (feature 00050) — ใบนี้ใบเดียว จึงเป็น boolean ไม่ใช่ token เหมือนแถบมือถือ */
  const [payOpen, setPayOpen] = useState(false)
  /** ชีต "เริ่มงานเลย" (feature 00050) — ใบที่ยังไม่มีเวลาเริ่ม */
  const [walkInOpen, setWalkInOpen] = useState(false)
  // ชีตคืนของของออเดอร์ใบนี้ (feature 00056) — เปิดจากเมนู ⋮
  const [returnOpen, setReturnOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  /**
   * เงินของใบนี้ — คำนวณจาก SSOT ตัวเดียวกับแถบมือถือ (HR16)
   * เฉพาะร้านบริการ: ร้านอื่นยังไม่มีปุ่มเรื่องเงินในแชท (AC-SQ-07)
   */
  const money =
    vertical === 'SERVICE_QUEUE'
      ? computeOrderMoneyFromSerialized({
          totalAmount: o.totalAmount,
          depositAmount: o.depositAmount ?? null,
          payments: o.payments,
        })
      : null
  const payActions = money
    ? chatOrderActions({
        orderStatus: o.status,
        appointmentStatus: o.appointmentStatus ?? null,
        hasAppointment: Boolean(o.serviceStart),
        money,
      })
    : []
  // IMPORTANT: ใช้ noun ไม่ใช่ cta.tabLabel — LODGING สองค่านี้ตั้งใจไม่เท่ากัน (tabLabel="การจอง" เรียกลิสต์,
  // noun="บิลเข้าพัก" คือ Order entity ที่ confirm/toast ต้องพูดถึงให้ตรงกับหน้า order detail)
  const noun = resolveOrderVocab(vertical).noun

  // เงื่อนไข "สถานะไหนยกเลิกได้" (PENDING/SHIPPED) มาจาก SSOT เดียวกับหน้า order detail —
  // ไม่ hardcode status ที่นี่ กัน rule drift. ดึงเฉพาะ item ยกเลิก (action อื่นการ์ดนี้มีปุ่มของ
  // ตัวเองอยู่แล้ว ใส่ซ้ำ = scope creep). shipmentSource ไม่กระทบการมี/ไม่มี cancel item
  //
  // LODGING ไม่เสนอ action ยกเลิกที่นี่ (fail-closed): ออเดอร์ในลิสต์นี้ของร้านบ้านพักเป็น
  // type=BOOKING ซึ่ง cancelOrder บังคับเลือกเหตุผล (BR-LODG-36/37) — UI เลือกเหตุผลอยู่ที่
  // /bookings/[token] (BookingDetail) ถ้าโชว์ปุ่มที่นี่จะกดแล้วเจอ error ทางตัน
  // ("เลือกเหตุผลก่อนยกเลิกการจอง" โดยไม่มีที่ให้เลือก)
  const cancelItems =
    vertical === 'LODGING'
      ? []
      : getOrderActionSet({
          status: o.status as OrderStatus,
          fulfillmentMode: o.fulfillmentMode,
          shipmentSource: null,
          orderNoun: noun,
        }).menu.filter((i) => i.key === 'cancel-order')

  /**
   * "คืนของ" ในเมนูของออเดอร์ใบนี้ (feature 00056)
   *
   * เฉพาะร้านขายออนไลน์และใบที่ยังไม่ยกเลิก — ใบ `PENDING` ก็ยังเห็นเมนูได้ แล้วชีตจะบอกเอง
   * ว่า "คืนของได้เมื่อของถึงมือลูกค้าแล้วเท่านั้น" (เกณฑ์จริงอยู่ที่ service ตัวเดียว —
   * ซ่อนเมนูตามเกณฑ์ที่เดาเองจะทำให้สองที่ตัดสินไม่ตรงกันเมื่อเกณฑ์เปลี่ยน)
   */
  const returnItems: ActionItem[] =
    vertical === 'ONLINE_SALES' && o.status !== 'CANCELLED'
      ? [{ key: 'return-order', label: 'คืนของ', icon: 'arrow-back-up' }]
      : []

  // Base: OrderDetailClient.tsx handleCancelOrder — confirm → POST → toast; ตัดประโยค
  // "สินค้าจะถูกคืนเข้าสต็อก" ออกโดยตั้งใจ: การ์ดนี้ไม่รู้ hasDeductedStock ห้ามพูดเกินจริง (00030 D-1)
  async function handleCancelOrder() {
    if (cancelling) return
    // feature 00039 — บังคับเลือกเหตุผล (API คืน 400 ถ้าไม่ส่ง)
    // จุดนี้ตกสำรวจในสเปกของ ux (ระบุไว้ 2 จุดเรียก แต่จริง ๆ มี 3) — เจอตอนไล่ rg เอง
    const reason = await pacesConfirmWithReason({
      title: `ยกเลิก${noun}นี้?`,
      html: 'ลิงก์ที่ส่งให้ลูกค้าจะใช้ไม่ได้ · ย้อนกลับไม่ได้<div class="text-xs text-default-500 mt-2">เหตุผลที่เลือกเก็บไว้เป็นบันทึกประวัติ ไม่มีผลต่ออัตราความสำเร็จของร้าน</div>',
      options: CANCEL_REASONS_BY_VERTICAL[vertical],
      validationMessage: `เลือกเหตุผลก่อนยกเลิก${noun}`,
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!reason) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/orders/${o.token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error || `ยกเลิก${noun}ไม่สำเร็จ ลองใหม่อีกครั้ง`)
      }
      pacesToast.success(`ยกเลิก${noun}แล้ว`)
      onCancelled(o.id)
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : `ยกเลิก${noun}ไม่สำเร็จ ลองใหม่อีกครั้ง`)
    } finally {
      setCancelling(false)
    }
  }

  /**
   * เปิดหน้าต่างพัสดุ (feature 00022, user request 2026-07-27)
   *
   * เดิมปุ่มนี้ยิงสร้างพัสดุตรง ๆ ด้วยค่าตั้งต้นของร้านล้วน — ร้านที่เพิ่งตกลงเรื่องที่อยู่
   * กับลูกค้าในห้องนี้แก้อะไรไม่ได้เลย ต้องออกไปหน้าคำสั่งซื้อแล้วเดินกลับมา
   * ตอนนี้เปิดเป็นหน้าต่างเดียวกับโมดัลคำสั่งซื้อ (ย่อได้ ค้างข้ามห้อง) แล้วแก้ที่อยู่/ขนาด/
   * ขนส่ง/COD ได้ก่อนกดสร้าง — กล่องยืนยันย้ายไปอยู่ตอนกดสร้างในหน้าต่างนั้น
   */
  function openShipment(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    openDraft({
      conversationId,
      customerName: contactName,
      channel,
      customerAvatar,
      pageAvatarUrl,
      kind: 'SHIPMENT',
      shipmentOrderToken: o.token,
    })
  }

  // แตะการ์ด → เปิดโมดัลแก้ไขคำสั่งซื้อ (user 2026-07-25: ไม่เปิด tab ใหม่ ให้แก้ในโมดัลเดิม ไม่ต้องสลับจอ)
  function openEdit() {
    openDraft({ conversationId, customerName: contactName, channel, customerAvatar, pageAvatarUrl, editOrderToken: o.token })
  }

  async function sendToChat(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (sending) return
    // ใช้ noun เดียวกับที่การ์ดนี้ใช้อยู่แล้ว (บรรทัดบน) — ร้านบริการ/บ้านพักไม่เรียกรายการของ
    // ตัวเองว่า "คำสั่งซื้อ" และกล่องยืนยันนี้เด้งทับหน้าจอที่ใช้คำอีกแบบอยู่
    const ok = await pacesConfirm.question(`ส่ง${noun}นี้เข้าแชท?`, `ลูกค้าจะได้รับข้อมูล${noun}นี้ในแชท`, {
      confirmButtonText: 'ส่งเลย',
    })
    if (!ok) return
    setSending(true)
    try {
      // ส่ง type=ORDER เสมอ — route ตัดสินตามช่องทาง: DEEP ลูกค้าเห็นการ์ด; Messenger/IG ลูกค้าได้ลิงก์
      // แต่ "ร้าน" เห็นเป็นการ์ดทั้งสองกรณี (user 2026-07-25: ร้านอยู่ในระบบเรา = การ์ด)
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ORDER', orderRefToken: o.token }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        pacesToast.error(d?.error ?? 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success('ส่งเข้าแชทแล้ว')
    } catch {
      pacesToast.error('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  // การ์ดเดียวกับในแชท (user 2026-07-25) — OrderCardView shared; แตะ = เปิดโมดัลแก้ไข; footer = ส่งเข้าแชท
  return (
    <>
    <OrderCardView
      data={{
        // ตัวผันคำทั้งการ์ด (noun/ชิปสถานะ) — เดิมส่ง noun เข้ามาเป็น prop แยก แล้วชิปสถานะ
        // ในการ์ดยังพูดว่า "สั่งซื้อแล้ว" อยู่ดี เพราะคนละทาง (user report 2026-08-12)
        vertical,
        token: o.token,
        orderNo: o.orderNo,
        status: o.status,
        totalAmount: o.totalAmount,
        items: o.items,
        shipment: o.shipment ?? null,
        // Order Progress (2026-08-05) — section พัสดุในการ์ดใช้ตัดสิน stepper/ชิป/notice COD
        fulfillmentMode: o.fulfillmentMode,
        paymentMethod: o.paymentMethod,
        codReceivedAt: o.codReceivedAt,
        statusAt: o.statusAt,
        // feature 00024 (2026-08-08) — ให้การ์ดแสดงวันนัด/มัดจำแทนสถานะกว้าง ๆ
        // ขาด 4 ค่านี้เมื่อไหร่ การ์ดจะตกไปสาขา NO_SHIPPING แล้วขึ้นแค่ "สถานะ: สั่งซื้อแล้ว"
        // โดยไม่มีอะไรฟ้อง (ทุก prop เป็น optional — tsc/build เขียวหมด)
        serviceStart: o.serviceStart,
        serviceEnd: o.serviceEnd,
        appointmentStatus: o.appointmentStatus,
        depositAmount: o.depositAmount,
      }}
      onEdit={openEdit}
      className="w-full"
      footer={
        o.status === 'CANCELLED' ? (
          // CANCELLED — ไม่มี footer เลย (ปุ่มส่งเข้าแชท/สร้างพัสดุกับใบที่ยกเลิกแล้ว = กดแล้วพัง)
          // เดิมแทนด้วย badge "ยกเลิก" แต่ตั้งแต่การ์ดมี Order Progress (2026-08-05) ชิป
          // "ยกเลิกแล้ว" ขึ้นในตัวการ์ดอยู่แล้ว badge ที่ footer เลยกลายเป็นสถานะเบิ้ลสองป้าย
          // (user report 2026-08-06 "มันเบิ้ล")
          undefined
        ) : (
          /* flex-wrap: แผงขวากว้าง ~300px ปุ่มเรื่องเงินสูงสุด 3 ใบ + ปุ่มเดิม + ⋮ ใส่แถวเดียว
             ไม่พอ — ตัวหนังสือจะถูกบีบจนอ่านไม่ออกแทนที่จะตกลงบรรทัดใหม่
             (บทเรียน 00038: action row ที่คอมเมนต์อ้างว่า wrap ได้ แต่ไม่มี `flex-wrap` จริง) */
          <div className="border-default-200 flex flex-wrap gap-2 border-t p-2">
            {/* ปุ่มเรื่องเงิน — รายการมาจาก `chatOrderActions()` ที่เดียว ตรงกับแถบมือถือเป๊ะ
                `HANDLER` เป็น Record ⇒ เพิ่มปุ่มในไลบรารีแล้วลืมต่อสายที่นี่ = tsc แดง */}
            {payActions.map((a) => {
              const HANDLER: Record<typeof a.key, () => void> = {
                START_WALK_IN: () => setWalkInOpen(true),
                REQUEST_DEPOSIT: () => setApptOpen(true),
                RECORD_PAYMENT: () => setPayOpen(true),
                MARK_SERVED: () => {
                  setMarking(true)
                  void markServedFlow({
                    orderToken: o.token,
                    shopId,
                    label: o.orderNo || o.token.slice(0, 8).toUpperCase(),
                    outstandingWarning: money ? completionWarning(money) : null,
                  })
                    .then((done) => {
                      if (done) router.refresh()
                    })
                    .finally(() => setMarking(false))
                },
              }
              const busy = a.key === 'MARK_SERVED' && marking
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={(e) => {
                    // การ์ดทั้งใบเป็นพื้นที่กด "แก้ไข" อยู่แล้ว — ปุ่มในนั้นต้องหยุด bubble
                    e.preventDefault()
                    e.stopPropagation()
                    HANDLER[a.key]()
                  }}
                  disabled={busy || cancelling}
                  aria-label={`${a.label} — ${o.orderNo || o.token.slice(0, 8).toUpperCase()}`}
                  className={`btn btn-sm min-h-11 flex-1 basis-28 items-center justify-center gap-1 disabled:opacity-60 ${
                    a.primary
                      ? 'bg-primary hover:bg-primary-hover text-white'
                      : 'bg-primary/10 text-primary-ink hover:bg-primary/20'
                  }`}
                >
                  <Icon
                    icon={busy ? 'loader-2' : a.icon}
                    className={`text-sm ${busy ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {a.label}
                </button>
              )
            })}
            {/* "ส่งสรุปนัด" ถูกกลืนเข้าแถวบนเมื่อมีปุ่ม "แจ้งมัดจำ" — ปุ่มเดียวกัน คำเดียวกัน
                ไม่ใช่สองใบบนการ์ดเดียว (เหตุผลเดียวกับแถบมือถือ) */}
            {isAppointment && payActions.some((a) => a.key === 'REQUEST_DEPOSIT') ? null : isAppointment ? (
              /* ไม่มี pacesConfirm ตรงนี้ — ชีตพรีวิว **คือ** ขั้นยืนยันแล้ว (มติ D-B3)
                 ซ้อน Swal ทับอีกชั้นคือการถามคำถามเดิมสองครั้ง */
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setApptOpen(true)
                }}
                disabled={cancelling}
                aria-label="ส่งสรุปนัดเข้าแชท"
                className="btn btn-sm bg-primary/10 text-primary-ink hover:bg-primary/20 min-h-11 flex-1 gap-1 disabled:opacity-60"
              >
                <Icon icon="calendar-check" className="text-sm" />
                ส่งสรุปนัด
              </button>
            ) : (
            <button
              type="button"
              onClick={sendToChat}
              disabled={sending || cancelling}
              aria-label={`ส่ง${noun}นี้เข้าแชท`}
              className="btn btn-sm bg-primary/10 text-primary hover:bg-primary/20 flex-1 gap-1 disabled:opacity-60"
            >
              <Icon icon={sending ? 'loader-2' : 'send'} className={`text-sm ${sending ? 'animate-spin' : ''}`} />
              ส่งเข้าแชท
            </button>
            )}
            {/* feature 00022 — เปิดหน้าต่างพัสดุในห้องนี้เลย ไม่ต้องสลับหน้า
                คำบนปุ่มบอกล่วงหน้าว่ากดแล้วเจอฟอร์มหรือเจอเลขติดตาม

                2026-08-08: ปุ่มนี้เคยโผล่ **ทุกร้านทุกประเภท** โดยไม่มีเงื่อนไขอะไรเลย —
                ร้านบริการและบ้านพักที่ไม่มีวันส่งของก็เห็น "สร้างพัสดุ" ค้างอยู่ตลอด
                กั้นด้วย fulfillmentMode ไม่ใช่ vertical เพราะ resolveFulfillmentMode คือ SSOT
                ของ "ใบนี้ต้องส่งของไหม" (มติ 2026-08-07) — และกันเผื่อสินค้าดิจิทัลของร้าน
                ขายออนไลน์ไปด้วยในตัว ซึ่งมีปัญหาเดียวกันมาตลอดโดยไม่มีใครรายงาน */}
            {o.fulfillmentMode !== 'NO_SHIPPING' && (
            <button
              type="button"
              onClick={openShipment}
              disabled={cancelling}
              aria-label={hasShipment ? `ดูพัสดุของ${noun}นี้` : `สร้างพัสดุสำหรับ${noun}นี้`}
              className="btn btn-sm bg-primary/10 text-primary hover:bg-primary/20 flex-1 gap-1 disabled:opacity-60"
            >
              <Icon icon="truck-delivery" className="text-sm" />
              {hasShipment ? 'ดูพัสดุ' : 'สร้างพัสดุ'}
            </button>
            )}
            {/* ⋮ ยกเลิก (user 2026-08-05) — PENDING/SHIPPED เท่านั้น (cancelItems ว่าง →
                OrderOverflowMenu คืน null เอง). กางขึ้นเพราะ OrderCardView ครอบ overflow-hidden
                — เมนูที่กางลงพ้นขอบล่างการ์ดจะโดนตัดหาย ส่วนกางขึ้นทับเนื้อการ์ดซึ่งอยู่ในขอบเขต.
                INVARIANT: เมนูของ instance นี้ต้องสั้นกว่าความสูง body ของการ์ดเตี้ยสุด (~127px)
                — วันนี้มี 1 รายการ (~48px) พอดี; ห้ามส่ง menu เต็มของ getOrderActionSet เข้ามา
                ไม่งั้นเมนูทะลุหัวการ์ดแล้วโดน clip ยอดแบบเงียบ ๆ (บั๊กคลาส first-paint วัดย้อนหลังไม่เจอ).
                ระหว่างยิง API แสดง spinner แทน ⋮ + disable ปุ่มข้างเคียง — กัน race ส่งการ์ดเข้าแชท
                ระหว่างออเดอร์กำลังถูกยกเลิก (Impeccable critique P1) */}
            {cancelling ? (
              <span className="flex size-9.25 items-center justify-center" aria-label="กำลังยกเลิก" role="status">
                <span className="border-danger size-4 animate-spin rounded-full border-2 border-t-transparent" />
              </span>
            ) : (
              <OrderOverflowMenu
                items={[...returnItems, ...cancelItems]}
                onAction={(key) => {
                  if (key === 'cancel-order') void handleCancelOrder()
                  if (key === 'return-order') setReturnOpen(true)
                }}
                size="sm"
                dropDirection="up"
              />
            )}
          </div>
        )
      }
    />
    {/* ส่งสรุปนัด (ส่วนขยาย 00024) — ชีตเดียวกับอีก 2 จุดเรียก ทั้งหมดเปิดตัวนี้ ไม่มีจุดไหน
        "ส่งเลย" ข้ามชีต (ทางลัดที่มีแค่บางจุดคือกฎที่ผู้ใช้เดาไม่ถูก) */}
    {/* ชีตรับเงิน (feature 00050) — ตัวเดียวกับที่แถบมือถือเรียก ไม่มีชีตคู่ขนาน
        เปิดเมื่อ money มีค่าเท่านั้น (ร้านที่ไม่ใช่ SERVICE_QUEUE ไม่มีปุ่มให้กดอยู่แล้ว) */}
    {money && (
      <StartWalkInSheet
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        orderToken={o.token}
        orderLabel={o.orderNo || o.token.slice(0, 8).toUpperCase()}
        shopId={shopId}
        onStarted={() => router.refresh()}
      />
    )}
    {money && (
      <RecordPaymentSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        orderToken={o.token}
        orderLabel={o.orderNo || o.token.slice(0, 8).toUpperCase()}
        shopId={shopId}
        money={money}
        onChanged={() => router.refresh()}
      />
    )}
    {isAppointment && (
      <AppointmentSummarySheet
        open={apptOpen}
        onClose={() => setApptOpen(false)}
        orderToken={o.token}
      />
    )}
    {/* ระบบคืนของ (feature 00056) — เปิดจากเมนู `⋮` ของออเดอร์ใบนี้
        🛑 เคยวางเป็นการ์ดคงที่ห้อยใต้ทุกใบ (user ทักเอง 2026-08-24): ในรายการที่มีออเดอร์
        หลายใบมันกลายเป็น N การ์ดที่กินพื้นที่เท่ากับรายการจริง และขึ้นแม้ใบนั้นคืนไม่ได้
        = เสียงรบกวนล้วน · ที่ถูกคือเป็น action ของออเดอร์ใบนั้นในเมนู
        (docs/conventions/seller-action-placement.md) */}
    {vertical === 'ONLINE_SALES' && (
      <ReturnPanel
        orderToken={o.token}
        sheetOpen={returnOpen}
        onCloseSheet={() => setReturnOpen(false)}
      />
    )}
    </>
  )
}

/**
 * OrdersList — card list + lazy load (feature 00018). เริ่มจากออเดอร์ที่ SSR ส่งมา (≤20) แล้ว
 * lazy-load เพิ่มเมื่อ scroll ถึง sentinel ผ่าน GET /api/chat/conversations/[id]/orders?cursor=
 * (keyset createdAt). ถ้า SSR ส่งมาครบ 20 ถือว่า "อาจมีเพิ่ม" → ตั้ง cursor เริ่มจากตัวสุดท้าย
 */
function OrdersList({
  conversationId,
  initial,
  contactName,
  channel,
  customerAvatar,
  pageAvatarUrl,
  vertical,
  shopId,
}: {
  conversationId: string
  initial: CustomerPanelOrder[]
  contactName: string
  channel: string
  customerAvatar: string | null
  pageAvatarUrl: string | null
  vertical: ShopVertical
  /** ร้านของเธรด — ดูเหตุผลที่ `CustomerPanelData.shopId` */
  shopId: string
}) {
  const [orders, setOrders] = useState<CustomerPanelOrder[]>(initial)

  // ยกเลิกสำเร็จ → เปลี่ยน status ใน local state (การ์ดใบนั้น re-render เป็น badge "ยกเลิก" ทันที)
  // ไม่ refetch/refresh — ไม่รบกวน scroll ของเธรดและ state อื่นในหน้าแชทที่เปิดค้างอยู่
  const markCancelled = useCallback((id: string) => {
    setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'CANCELLED' } : x)))
  }, [])
  const [cursor, setCursor] = useState<string | null>(
    initial.length >= 20 ? initial[initial.length - 1].createdAt : null,
  )
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/orders?cursor=${encodeURIComponent(cursor)}`)
      if (res.ok) {
        const data: { items: CustomerPanelOrder[]; nextCursor: string | null } = await res.json()
        setOrders((prev) => [...prev, ...data.items])
        setCursor(data.nextCursor)
      }
    } catch {
      // เงียบ — sentinel ยังอยู่ ลอง observe รอบถัดไปได้
    } finally {
      setLoading(false)
    }
  }, [cursor, loading, conversationId])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const ob = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: '120px' })
    ob.observe(el)
    return () => ob.disconnect()
  }, [loadMore])

  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <OrderCard key={o.id} o={o} conversationId={conversationId} contactName={contactName} channel={channel} customerAvatar={customerAvatar} pageAvatarUrl={pageAvatarUrl} vertical={vertical} shopId={shopId} onCancelled={markCancelled} />
      ))}
      {cursor && (
        <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-3">
          <span className="border-primary size-4 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="text-default-700 text-xs">กำลังโหลด...</span>
        </div>
      )}
    </div>
  )
}

/**
 * CustomerPanelBody — เนื้อหาจริง (header + tabs + tab content) แชร์ระหว่าง CustomerPanel
 * (desktop persistent column) และ CustomerPanelSheet (มือถือ/tablet <1024px) กันโค้ดซ้ำ 2 จุด
 *
 * สถิติลูกค้า (count/total/since) มาจาก page.tsx aggregate แล้ว (data.customerStats) ไม่คำนวณ
 * ฝั่ง client อีกต่อไป — เดิม summarize() นับจาก orders 20 แถวที่ list ใช้ ซึ่งเพี้ยนถ้าลูกค้าซื้อเกิน 20
 */
export function CustomerPanelBody({ data, initialTab }: { data: CustomerPanelData; initialTab?: Tab }) {
  const t = useT()
  // user request 2026-07-25 — เปิดจากไอคอนตะกร้าใน inbox (?panel=orders) → เด้งแท็บออเดอร์ทันที
  // ใช้ useEffect sync ตาม param (ไม่พึ่ง useState initializer อย่างเดียว) เพราะ App Router อาจ reuse
  // component ตอนสลับเธรด (ไม่ remount) — initializer จะไม่ถูกเรียกซ้ำ. effect ยิงเมื่อ param เปลี่ยน:
  // มี panel=orders → orders, ไม่มี → customer (การกดแท็บเองไม่ทำ param เปลี่ยน จึงไม่โดน effect ทับ)
  const searchParams = useSearchParams()
  const wantOrders = searchParams.get('panel') === 'orders'
  /**
   * `initialTab` (2026-08-14) — ผู้เรียกสั่งได้ว่าเปิดมาให้ลงแท็บไหน ใช้โดยชีตบนมือถือซึ่ง mount
   * ใหม่ทุกครั้งที่เปิด ⇒ ปุ่ม "คลังไฟล์" ในหัวเธรดเปิดมาเจอไฟล์ทันที ส่วนเมนู ⋯ เปิดมาเจอข้อมูลลูกค้า
   * ชนะ `?panel=orders` เพราะเป็นเจตนาที่เพิ่งกดเดี๋ยวนี้ ส่วน query param คือของที่ค้างอยู่ใน URL
   */
  const [tab, setTab] = useState<Tab>(initialTab ?? (wantOrders ? 'orders' : 'customer'))
  useEffect(() => {
    setTab(initialTab ?? (wantOrders ? 'orders' : 'customer'))
  }, [wantOrders, initialTab])
  const cta = VERTICAL_CTA[data.vertical]
  /** คำนามที่ผันตาม vertical — ใช้แทน `cta.tabLabel` ทุกจุดที่เป็นข้อความบนจอ */
  const tabNoun = resolveTabNoun(t, data.vertical)
  const TABS = buildTabs(t, data.vertical)
  const { openDraft } = useDraftOrders()
  // เปิดโมดัลสร้างคำสั่งซื้อ (พับได้/ค้างข้ามแชท) แทนการ navigate ไป /orders/new (user request 2026-07-24)
  const startCreateOrder = () =>
    openDraft({
      conversationId: data.conversationId,
      customerName: data.contactName,
      channel: data.channel,
      customerAvatar: data.avatar,
      pageAvatarUrl: data.channelAvatarUrl,
    })
  // orderHref ย้ายไป module-level (ใช้ใน OrderCard) — CustomerPanelBody ไม่อ้างตรง ๆ แล้ว
  const uid = useId() // prefix id ของ tab/panel — desktop panel กับ sheet มือถืออยู่ใน DOM พร้อมกันได้

  // ── CRM: fetch ครั้งเดียวที่นี่ แล้วส่งลงทั้งแท็บ "ข้อมูลลูกค้า" และ "โน้ต" ──
  // (เดิมแต่ละแท็บ fetch เอง + unmount ทุกครั้งที่สลับ → draft หาย, skeleton กระพริบ, fail แล้วเงียบ)
  const [crm, setCrm] = useState<ConversationCrm | null>(null)
  const [crmLoading, setCrmLoading] = useState(true)
  const [crmFailed, setCrmFailed] = useState(false)

  const loadCrm = useCallback(async () => {
    setCrmLoading(true)
    setCrmFailed(false)
    try {
      const res = await fetch(`/api/chat/conversations/${data.conversationId}/crm`, { cache: 'no-store' })
      if (!res.ok) {
        setCrmFailed(true)
        return
      }
      setCrm(await res.json())
    } catch {
      setCrmFailed(true)
    } finally {
      setCrmLoading(false)
    }
  }, [data.conversationId])

  useEffect(() => {
    loadCrm()
  }, [loadCrm])

  /** เนื้อหา CRM ของแต่ละแท็บ — กันเคส "แท็บว่างเปล่าสนิท" ตอนโหลดไม่สำเร็จ (critique P0-1) */
  const crmSlot = (variant: 'profile' | 'note') => {
    if (crmLoading) return <div className="bg-default-100 h-40 animate-pulse rounded-lg" role="status" aria-label="กำลังโหลดข้อมูลลูกค้า" />
    if (crmFailed || !crm)
      return (
        <div className="space-y-3 py-2 text-center">
          <p className="text-default-700 mb-0 text-sm">โหลดข้อมูลลูกค้าไม่สำเร็จ</p>
          <button type="button" onClick={loadCrm} className="btn border-default-300 min-h-11">
            <Icon icon="refresh" className="me-1" /> ลองใหม่
          </button>
        </div>
      )
    return (
      <CustomerCrmSection
        conversationId={data.conversationId}
        variant={variant}
        crm={crm}
        onSaved={setCrm}
      />
    )
  }

  /** arrow-key navigation ของ tablist ตาม ARIA tabs pattern (critique P2 — เดิมประกาศ role ไว้
   *  แต่ไม่มี keyboard support และไม่มี roving tabIndex) */
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((x) => x.key === tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
      setTab(next.key)
      document.getElementById(`${uid}-tab-${next.key}`)?.focus()
    }
  }

  return (
    <>
      {/* หัวแผง = ตัวตนของคู่สนทนาอย่างเดียว (user สั่ง 2026-08-27)
          เดิมใต้หัวมีอีก 3 แถวเรียงกัน — ป้ายพฤติกรรม ("ลูกค้าใหม่") · แถบ "ทั้งระบบ" (สั่ง/รับของ) ·
          ลิงก์ "ดูโปรไฟล์เต็ม" — ถอดออกทั้งหมดตามคำสั่ง แล้วออกแบบหัวใหม่ให้กระชับ:
          🛑 เลิกใช้เส้นประคั่นใต้หัว — เส้นนั้นเคยคั่นหัวออกจาก "แถวสัญญาณ" ที่ตามมา พอไม่มีแถวพวกนั้น
          แล้ว มันจะไปอยู่ห่างจากเส้นทึบของแถบแท็บแค่บรรทัดเดียว = เส้น 2 ชั้นติดกันที่ไม่ได้คั่นอะไรเลย
          ระยะ pt-4/pb-3 ให้หัวหายใจเท่า .card-body ด้านบน แล้วชิดแถบแท็บลงมาเล็กน้อย
          (ป้าย/สถิติของ 00055 + 00057 ยังอยู่ครบที่ /customers และหน้าโปรไฟล์ลูกค้า — ถอดเฉพาะแผงนี้) */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <PanelAvatar avatar={data.avatar} name={data.contactName} />
        <div className="min-w-0">
          <p className="text-default-900 mb-1 truncate text-sm font-semibold" title={data.contactName}>
            {data.contactName}
          </p>
          <ChannelBadge channel={data.channel} label={data.channelName} />
        </div>
      </div>

      {/* แถบสรุป 1 บรรทัดเหนือแท็บถูกย้ายลงไปเป็น "แถวสถิติ" ในแท็บข้อมูลลูกค้าแทน (user สั่ง 2026-07-24
          ส่งภาพรูปแบบ label-ซ้าย/ค่า-ขวามาให้) — เดิมโชว์ count+total เหนือแท็บ ซึ่งจะซ้ำกับแถวใหม่
          ถ้าเก็บไว้ทั้งคู่ (ตัวเลขเดียวกันโผล่ 2 ที่ในกรอบ 384px = สิ่งที่ critique เคยเตือน) */}

      {/* tabs — 3 ตัว (user สั่ง 2026-07-23): ข้อมูลลูกค้า / คำสั่งซื้อ|การจอง / โน๊ต พร้อมไอคอน
          (ไอคอน user เลือกเอง: user-circle / shopping-cart / notes — ไม่ได้เดา ตาม convention
          docs/conventions/no-emoji-use-icons.md ที่ห้าม emoji และห้ามเดา icon ที่ spec ไม่ระบุ)
          px-4 ให้ tab แรกเริ่มตรงกับ padding ของหัวการ์ดและเนื้อหา ไม่ชิดขอบซ้าย
          text-sm + gap-1.5: 3 แท็บพร้อมไอคอนต้องพอดีความกว้าง 384px ของคอลัมน์นี้โดยไม่ตกบรรทัด */}
      {/* `.nav-tabs` ของ Paces ถูกออกแบบมาให้ฝังใน `.card-header` (สูงคงที่ py-3.75) จึงมี 3 อย่าง
          ที่พังทันทีเมื่อเอามาใช้เป็นแถบเดี่ยวในการ์ดที่สูงเต็มคอลัมน์ — ต้องล้างทั้งสาม:
          1) `-my-3.75 -me-3` margin ติดลบ ดันแถบขึ้นจนเส้น border-b ของแท็บ active ไปตกในพื้นที่
             เนื้อหา (เห็นเป็นเส้นลอยเหนือหัวข้อ) → `my-0 me-0`
          2) `h-full` (!) — พออยู่ใน flex column ที่มีความสูงจริง แถบแท็บจะยืดกินความสูงทั้งการ์ด
             ดันแท็บไปลอยกลางจอและดันเนื้อหาตกไปล่างสุด (user เจอจริง 2026-07-23) → `h-auto`
          3) ไม่มีเส้น rail ของตัวเอง → ใส่ border-b ที่ nav แล้วให้แท็บ active วางทับด้วย -mb-px */}
      <nav
        /* 🛑 `flex-nowrap` + `px-2` (2026-08-14): แท็บที่ 4 ทำให้แถบตกบรรทัดบนแผงกว้าง 384px
            `.nav-tabs` ของ Paces เป็น flex-wrap — และ **flex ตัดสินว่าจะ wrap ไหมจากขนาดเนื้อหา
            เต็มก่อนหด** (docs/conventions/flex-header-truncation.md) การใส่ truncate/min-w-0
            อย่างเดียวจึงไม่มีผลเลย ต้องปิด wrap ก่อนกลไกอื่นถึงจะทำงาน
            user สั่งเองว่า "ไม่อยากให้ slide ได้ด้วย ต้อง fit พอดี" ⇒ ห้ามใส่ overflow-x-auto
            งบที่ 384px: px-4 นอก 32 → เหลือ 352 · ต่อแท็บ = px-2(16) + ไอคอน 16 + gap 6 + คำ
            คำสั้น 4 ตัว (ข้อมูล/คำสั่งซื้อ+badge/ไฟล์/โน้ต) รวม ~310px ⇒ เหลือที่ว่าง ไม่ตกบรรทัด */
        className="nav-tabs border-default-200 my-0 me-0 h-auto flex-nowrap border-b px-4"
        role="tablist"
        aria-label={t.inbox.customerInfo}
      >
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            type="button"
            role="tab"
            id={`${uid}-tab-${tabDef.key}`}
            aria-selected={tab === tabDef.key}
            aria-controls={`${uid}-panel-${tabDef.key}`}
            tabIndex={tab === tabDef.key ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab(tabDef.key)}
            className={`nav-link -mb-px inline-flex min-w-0 items-center gap-1.5 px-2 py-3 text-sm ${
              tab === tabDef.key ? 'border-b-2 border-primary text-primary' : 'border-b-2 border-transparent'
            }`}
          >
            <Icon icon={tabDef.icon} className="shrink-0 text-base" />
            {/* truncate = ตาข่ายกันเหนียวสำหรับภาษาที่คำยาวกว่านี้ในอนาคต — ไม่ใช่ตัวแก้หลัก
                (ตัวแก้หลักคือ flex-nowrap ที่ nav + คำสั้นใน dictionary) */}
            <span className="truncate">{tabDef.label}</span>
            {/* จำนวนออเดอร์บนแท็บ — เดิมต้องคลิกเข้าไปถึงจะรู้ว่ามี 0 (critique P1-C)
                ใช้ customerStats (aggregate จริง) แทน summary.count (cap 20) ให้ตรงกับแถวสถิติในแท็บ */}
            {tabDef.key === 'orders' && (data.customerStats?.orderCount ?? 0) > 0 && (
              <span className="badge bg-default-100 text-default-700 text-2xs">{data.customerStats!.orderCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* min-h-0 + flex-1 + overflow-y-auto: การ์ดสูงเต็มคอลัมน์ (ดู shell ด้านล่าง) แล้วให้ "เนื้อหา"
          เป็นส่วนที่เลื่อน ไม่ใช่ทั้งการ์ด — หัวการ์ด (ชื่อ+ช่องทาง) กับแถบแท็บจึงค้างอยู่เสมอ
          เหมือนแผงข้อมูลของแอปแชทจริง. ในโหมด sheet (มือถือ) parent เป็น block + scroll เองอยู่แล้ว
          flex-1 จึงไม่มีผลและไม่เกิด scroll ซ้อน */}
      {/* ทุกแท็บ mount ค้างไว้ ซ่อนด้วย `hidden` (ไม่ใช่ conditional render) — ไม่งั้นสลับแท็บแล้ว
          CustomerCrmSection ถูก unmount: โน้ตที่พิมพ์ค้างหายเงียบ ๆ + re-fetch + skeleton กระพริบ
          ทุกครั้ง (critique P0-1) */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div
          role="tabpanel"
          id={`${uid}-panel-customer`}
          aria-labelledby={`${uid}-tab-customer`}
          className={tab === 'customer' ? 'space-y-4' : 'hidden'}
        >
          {/* feature 00018 CRM — แก้ไข tag/สถานะ/เบอร์/ที่อยู่/ชื่อในแชท ต่อผู้ติดต่อ */}
          {crmSlot('profile')}

          {/* feature 00018 E5 (user request 2026-07-26) — ป้ายกำกับอัตโนมัติจาก Meta แบบ Business
              Suite: บอกว่าลูกค้าคนนี้มาจากโฆษณาไหน. แยกจาก tag ของ CRM ด้านบนชัดเจนเพราะอันนี้
              **ระบบเติมให้เอง แก้ไม่ได้** — ไม่มีปุ่ม X เหมือน tag ที่ร้านตั้งเอง */}
          {data.adReferralId && (
            <div>
              <p className="text-default-700 mb-1 text-xs">{t.inbox.customerPanel.adBadgeLabel}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="badge bg-default-100 text-default-700 text-2xs inline-flex max-w-full items-center gap-1"
                  title={`ad_id.${data.adReferralId}`}
                >
                  <Icon icon="brand-meta" className="size-3.5 shrink-0" />
                  <span className="truncate">ad_id.{data.adReferralId}</span>
                </span>
                <span className="badge bg-default-100 text-default-700 text-2xs inline-flex items-center gap-1">
                  <Icon icon="brand-meta" className="size-3.5 shrink-0" />
                  {data.channel === 'INSTAGRAM' ? 'instagram_ads' : 'messenger_ads'}
                </span>
              </div>
            </div>
          )}

          {/* สถิติลูกค้า (user สั่ง 2026-07-24) — label-ซ้าย/ค่า-ขวา ตามภาพที่ส่งมา; เฉพาะลูกค้าที่ผูก
              ในระบบแล้ว (มี customerStats) — คนที่ยังไม่ผูก แถว "การเชื่อมกับลูกค้าในระบบ" ด้านล่าง
              อธิบายอยู่แล้ว ตัวเลขมาจาก aggregate จริงทั้งหมด (ไม่ใช่ 20 แถวของ list) — show don't tell */}
          {data.customerStats && (
            <div>
              <StatRow label={t.inbox.customerPanel.statOrderCount} value={data.customerStats.orderCount.toLocaleString('th-TH')} />
              <StatRow
                label={t.inbox.customerPanel.statTotalSpent}
                value={`฿${Number(data.customerStats.totalSpent).toLocaleString('th-TH')}`}
              />
              <StatRow
                label={t.inbox.customerPanel.statCustomerSince}
                value={relativeTimeTh(new Date(data.customerStats.since).getTime())}
              />
            </div>
          )}
          {/* สถานะการผูกลูกค้า — เดิมเป็นแถว "รหัสลูกค้า #A3F19C22 / —" ซึ่ง (ก) โชว์ id ดิบของ DB
              ให้แม่ค้า (ข) ขัดกับแถว "เบอร์โทร" ที่อยู่เหนือมัน 40px เพราะเบอร์ที่กรอกใน CRM เก็บที่
              ExternalContact.phones ซึ่ง *ไม่เกี่ยวกับ* customerId ที่เป็นตัวตัดสินรหัสลูกค้าเลย →
              กรอกเบอร์ กดบันทึก ได้ toast สำเร็จ แต่รหัสยังเป็น "—" (critique P0-2)
              ตอนนี้พูดเป็นสถานะภาษาคน + บอกวิธีทำให้เกิดขึ้นจริง; id ยังดูได้จาก title */}
          <div>
            <p className="text-default-700 mb-0.5 text-xs">{t.inbox.customerPanel.linkStatusTitle}</p>
            {data.customer ? (
              <p
                className="text-default-800 mb-0 flex items-center gap-1.5 text-sm"
                title={`รหัสลูกค้า ${data.customer.id}`}
              >
                <Icon icon="link" className="text-success text-base" />
                {t.inbox.customerPanel.linked} · {data.customer.phone}
              </p>
            ) : (
              <p className="text-default-800 mb-0 text-sm">
                {fmt(t.inbox.customerPanel.notLinked, { noun: tabNoun })}
              </p>
            )}
          </div>

        </div>

        {/**
         * แท็บคลังไฟล์ (2026-08-14) — ย้ายออกมาจากล่างสุดของแท็บ 'customer'
         *
         * เหตุผลเดิมที่วางไว้ล่างสุดยังถูกอยู่ ("ของด้านบนคือสิ่งที่ต้องอ่านก่อนตอบทุกครั้ง ส่วนคลังไฟล์
         * คือสิ่งที่ไปหาเมื่อต้องการ") — แต่ข้อสรุปนั้นถูกต่อยอดผิดเป็น "จึงต้องเลื่อนหาเอา" ทั้งที่
         * ทางออกที่ถูกคือ **แยกออกไปเป็นที่ของตัวเองที่ไปถึงได้ตรง ๆ** ไม่ใช่ฝังไว้ท้ายกอง
         *
         * 🛑 ต้อง mount ค้างไว้เหมือนแท็บอื่น (ซ่อนด้วย `hidden` ไม่ใช่ conditional render) — ตัวมัน
         * subscribe `LIBRARY_CHANGED_EVENT` เพื่อรีเฟรชกริดตอนกดเก็บไฟล์จากในเธรด ถ้า unmount
         * ตามแท็บ สัญญาณจะตกทุกครั้งที่ผู้ขายไม่ได้เปิดแท็บนี้ค้างไว้พอดี
         */}
        <div
          role="tabpanel"
          id={`${uid}-panel-files`}
          aria-labelledby={`${uid}-tab-files`}
          className={tab === 'files' ? '' : 'hidden'}
        >
          <CustomerFileLibrarySection conversationId={data.conversationId} customerName={data.contactName} />
        </div>

        {/* แท็บโน้ต — โน้ตภายในร้านต่อผู้ติดต่อ (ลูกค้าไม่เห็น; AI ใช้เป็นบริบทตอนช่วยร่าง) */}
        <div
          role="tabpanel"
          id={`${uid}-panel-note`}
          aria-labelledby={`${uid}-tab-note`}
          className={tab === 'note' ? '' : 'hidden'}
        >
          {crmSlot('note')}
        </div>

        <div
          role="tabpanel"
          id={`${uid}-panel-orders`}
          aria-labelledby={`${uid}-tab-orders`}
          className={tab === 'orders' ? '' : 'hidden'}
        >
        {/* header ในแท็บ (user request 2026-07-24): "รายการคำสั่งซื้อ" + ปุ่มสร้าง — ปุ่มแสดงเสมอ
            (ไม่ผูกกับ empty-state) เปิดโมดัลพับได้แทน navigate ออกจากแชท */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-default-900 mb-0 text-sm font-semibold">{fmt(t.inbox.customerPanel.listHeading, { noun: tabNoun })}</p>
          <button
            type="button"
            onClick={startCreateOrder}
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex shrink-0 items-center gap-1 text-nowrap"
          >
            <Icon icon={cta.icon} className="size-4" />
            {fmt(t.inbox.customerPanel.createCta, { noun: tabNoun })}
          </button>
        </div>

        {/* 🛑 ตัวตัดสิน "มีรายการให้ดูไหม" ต้องเป็น `data.orders.length` ไม่ใช่ `data.customer`
            (2026-09-05): ออเดอร์ที่ถูกดึงมาด้วย `Order.conversationId` มีอยู่ได้แม้เธรดยังไม่เคย
            ผูกลูกค้าเลย — เงื่อนไขเดิมจะซ่อนมันทิ้งซ้ำอีกชั้นหนึ่ง ซึ่งเป็นบั๊กตัวเดียวกับที่
            รอบนี้กำลังแก้ ส่วน "ผูกลูกค้าแล้วหรือยัง" ยังใช้เลือก *ข้อความตอนว่าง* ตามเดิม */}
        {data.orders.length > 0 ? (
          <>
            {/* ขอบเขตของรายการ — รายการนับรวมใบที่เปิดจากห้องนี้ด้วย ส่วนเลขบนแท็บนับตามลูกค้า
                สองอันต่างกันได้โดยไม่มีอะไรผิด (ux gate 2026-09-05 · partial-data-must-be-labeled) */}
            <p className="text-default-700 mb-3 text-xs">
              {fmt(t.inbox.customerPanel.listScopeNote, { noun: tabNoun })}
            </p>
            <OrdersList conversationId={data.conversationId} initial={data.orders} contactName={data.contactName} channel={data.channel} customerAvatar={data.avatar} pageAvatarUrl={data.channelAvatarUrl} vertical={data.vertical} shopId={data.shopId} />
          </>
        ) : (
          <p className="text-default-700 mb-0 text-sm">
            {fmt(
              data.customer
                ? t.inbox.customerPanel.noHistory
                : t.inbox.customerPanel.notLinkedNoHistory,
              { noun: tabNoun },
            )}
          </p>
        )}
        </div>
      </div>
    </>
  )
}

/** shell การ์ดเดี่ยว desktop (≥1024px) — ความกว้างคุมจาก page.tsx (wrapper `w-80` มาตรฐาน Tailwind
 * scale, ไม่ใช่ bracket arbitrary — ดู comment page.tsx ส่วน CustomerPanel wrapper) */
export default function CustomerPanel({ data }: { data: CustomerPanelData }) {
  return (
    // h-full + flex-col: การ์ดสูงเต็มคอลัมน์ที่ page.tsx จองไว้ (เดิมการ์ดสูงเท่าเนื้อหาแล้วเหลือ
    // พื้นที่ว่างครึ่งจอด้านล่าง — เห็นชัดมากหลังตัด gap ระหว่างคอลัมน์ออก) ส่วนที่เลื่อนคือเนื้อหา
    // ในแท็บ ไม่ใช่ทั้งการ์ด (ดู comment ที่ CustomerPanelBody)
    <div className="card flex h-full flex-col">
      <CustomerPanelBody data={data} />
    </div>
  )
}
