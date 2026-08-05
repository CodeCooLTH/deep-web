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
 * ไม่มีลิงก์ "ดูในหน้าลูกค้า" → /customers/[id] (หน้านี้ยังไม่มีอยู่จริงในโปรเจกต์ — ตรวจแล้ว มีแค่
 * /customers แบบ list ไม่มี detail route; ข้ามไปตามคำสั่ง "ห้ามแก้หน้าปลายทาง" ดู t45-report.md)
 *
 * เบอร์โทร (`customer.phoneMasked`) mask แล้วที่ server boundary (page.tsx, src/lib/phone-mask.ts)
 * ก่อนส่งลง prop นี้ — RSC PII rule: หน้า seller อยู่ใต้ client VerticalLayout ทุก prop ที่ผ่านลงมา
 * ถูก serialize เข้า flight payload หมด ไม่ว่าจะ render จริงหรือไม่
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { ORDER_VOCAB } from '@/lib/seller-menu'
import type { ShopVertical } from '@/lib/lodging'
import { ChannelBadge } from '../../components/ChannelBadge'
import CustomerCrmSection, { type ConversationCrm } from './CustomerCrmSection'
import { useDraftOrders } from '../../../_components/DraftOrderProvider'
import OrderCardView from '../../../_components/OrderCardView'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

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
  vertical: ShopVertical
  /** null = ยังไม่ผูก Customer — phoneMasked ผ่าน maskPhone() มาแล้วเสมอ (ห้ามส่งเบอร์เต็ม) */
  customer: { id: string; phoneMasked: string } | null
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
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
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
// การจองคิวเป็นคนละหน้าจอ /queues ไม่ใช่ CTA ของแผงลูกค้าในแชทนี้)
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

type Tab = 'customer' | 'orders' | 'note'

/** แท็บของ right panel — label ของ 'orders' มาจาก vertical (คำสั่งซื้อ/การจอง) จึงเว้นว่างไว้ */
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'customer', label: 'ข้อมูลลูกค้า', icon: 'user-circle' },
  { key: 'orders', label: '', icon: 'shopping-cart' },
  { key: 'note', label: 'โน้ต', icon: 'notes' }, // สะกด "โน้ต" ให้ตรงกับเนื้อหาในแท็บ (user ยืนยัน 2026-07-23)
]


/** การ์ดออเดอร์ 1 ใบ (user request 2026-07-24: ข้อมูลเบื้องต้น = ชื่อสินค้า/จำนวนรายการ/ยอด/สถานะ)
 *  + ปุ่ม hover "ส่งเข้าแชท": DEEP → ส่งการ์ดออเดอร์ (type=ORDER); ช่องทางนอก → ส่งลิงก์ /o/{token} (TEXT)
 *  ถามยืนยันก่อนส่ง (Swal) เพราะเป็น outward-facing (ข้อความไปถึงลูกค้าจริง) */
function OrderCard({
  o,
  conversationId,
  contactName,
  channel,
  customerAvatar,
}: {
  o: CustomerPanelOrder
  conversationId: string
  contactName: string
  channel: string
  customerAvatar: string | null
}) {
  const { openDraft } = useDraftOrders()
  const [sending, setSending] = useState(false)
  const hasShipment = !!o.shipment

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
      kind: 'SHIPMENT',
      shipmentOrderToken: o.token,
    })
  }

  // แตะการ์ด → เปิดโมดัลแก้ไขคำสั่งซื้อ (user 2026-07-25: ไม่เปิด tab ใหม่ ให้แก้ในโมดัลเดิม ไม่ต้องสลับจอ)
  function openEdit() {
    openDraft({ conversationId, customerName: contactName, channel, customerAvatar, editOrderToken: o.token })
  }

  async function sendToChat(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (sending) return
    const ok = await pacesConfirm.question('ส่งคำสั่งซื้อนี้เข้าแชท?', 'ลูกค้าจะได้รับข้อมูลคำสั่งซื้อนี้ในแชท', {
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
    <OrderCardView
      data={{
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
      }}
      onEdit={openEdit}
      className="w-full"
      footer={
        <div className="border-default-200 flex gap-2 border-t p-2">
          <button
            type="button"
            onClick={sendToChat}
            disabled={sending}
            aria-label="ส่งคำสั่งซื้อนี้เข้าแชท"
            className="btn btn-sm bg-primary/10 text-primary hover:bg-primary/20 flex-1 gap-1 disabled:opacity-60"
          >
            <Icon icon={sending ? 'loader-2' : 'send'} className={`text-sm ${sending ? 'animate-spin' : ''}`} />
            ส่งเข้าแชท
          </button>
          {/* feature 00022 — เปิดหน้าต่างพัสดุในห้องนี้เลย ไม่ต้องสลับหน้า
              คำบนปุ่มบอกล่วงหน้าว่ากดแล้วเจอฟอร์มหรือเจอเลขติดตาม */}
          <button
            type="button"
            onClick={openShipment}
            aria-label={hasShipment ? 'ดูพัสดุของคำสั่งซื้อนี้' : 'สร้างพัสดุสำหรับคำสั่งซื้อนี้'}
            className="btn btn-sm bg-primary/10 text-primary hover:bg-primary/20 flex-1 gap-1"
          >
            <Icon icon="truck-delivery" className="text-sm" />
            {hasShipment ? 'ดูพัสดุ' : 'สร้างพัสดุ'}
          </button>
        </div>
      }
    />
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
}: {
  conversationId: string
  initial: CustomerPanelOrder[]
  contactName: string
  channel: string
  customerAvatar: string | null
}) {
  const [orders, setOrders] = useState<CustomerPanelOrder[]>(initial)
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
        <OrderCard key={o.id} o={o} conversationId={conversationId} contactName={contactName} channel={channel} customerAvatar={customerAvatar} />
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
export function CustomerPanelBody({ data }: { data: CustomerPanelData }) {
  // user request 2026-07-25 — เปิดจากไอคอนตะกร้าใน inbox (?panel=orders) → เด้งแท็บออเดอร์ทันที
  // ใช้ useEffect sync ตาม param (ไม่พึ่ง useState initializer อย่างเดียว) เพราะ App Router อาจ reuse
  // component ตอนสลับเธรด (ไม่ remount) — initializer จะไม่ถูกเรียกซ้ำ. effect ยิงเมื่อ param เปลี่ยน:
  // มี panel=orders → orders, ไม่มี → customer (การกดแท็บเองไม่ทำ param เปลี่ยน จึงไม่โดน effect ทับ)
  const searchParams = useSearchParams()
  const wantOrders = searchParams.get('panel') === 'orders'
  const [tab, setTab] = useState<Tab>(wantOrders ? 'orders' : 'customer')
  useEffect(() => {
    setTab(wantOrders ? 'orders' : 'customer')
  }, [wantOrders])
  const cta = VERTICAL_CTA[data.vertical]
  const { openDraft } = useDraftOrders()
  // เปิดโมดัลสร้างคำสั่งซื้อ (พับได้/ค้างข้ามแชท) แทนการ navigate ไป /orders/new (user request 2026-07-24)
  const startCreateOrder = () =>
    openDraft({
      conversationId: data.conversationId,
      customerName: data.contactName,
      channel: data.channel,
      customerAvatar: data.avatar,
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
    const i = TABS.findIndex((t) => t.key === tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
      setTab(next.key)
      document.getElementById(`${uid}-tab-${next.key}`)?.focus()
    }
  }

  return (
    <>
      {/* p-4 + gap-3 ให้เท่ากับ .card-body ของ Paces — user feedback บน prod ว่า padding เดิม
          (px-4 py-3) อึดอัด หัวการ์ดชิดขอบเกินไป */}
      <div className="flex items-center gap-3 border-b border-default-200 border-dashed p-4">
        <PanelAvatar avatar={data.avatar} name={data.contactName} />
        <div className="min-w-0">
          <p className="text-default-900 mb-1 truncate text-sm font-semibold">{data.contactName}</p>
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
        className="nav-tabs border-default-200 my-0 me-0 h-auto border-b px-4"
        role="tablist"
        aria-label="ข้อมูลลูกค้า"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${uid}-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab(t.key)}
            className={`nav-link -mb-px inline-flex items-center gap-1.5 px-3 py-3 text-sm ${
              tab === t.key ? 'border-b-2 border-primary text-primary' : 'border-b-2 border-transparent'
            }`}
          >
            <Icon icon={t.icon} className="text-base" />
            {t.key === 'orders' ? cta.tabLabel : t.label}
            {/* จำนวนออเดอร์บนแท็บ — เดิมต้องคลิกเข้าไปถึงจะรู้ว่ามี 0 (critique P1-C)
                ใช้ customerStats (aggregate จริง) แทน summary.count (cap 20) ให้ตรงกับแถวสถิติในแท็บ */}
            {t.key === 'orders' && (data.customerStats?.orderCount ?? 0) > 0 && (
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
              <p className="text-default-700 mb-1 text-xs">ป้ายกำกับจาก Meta</p>
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
              <StatRow label="จำนวนออเดอร์" value={data.customerStats.orderCount.toLocaleString('th-TH')} />
              <StatRow
                label="รวมยอดซื้อ"
                value={`฿${Number(data.customerStats.totalSpent).toLocaleString('th-TH')}`}
              />
              <StatRow
                label="เป็นลูกค้ามา"
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
            <p className="text-default-700 mb-0.5 text-xs">การเชื่อมกับลูกค้าในระบบ</p>
            {data.customer ? (
              <p
                className="text-default-800 mb-0 flex items-center gap-1.5 text-sm"
                title={`รหัสลูกค้า ${data.customer.id}`}
              >
                <Icon icon="link" className="text-success text-base" />
                เชื่อมแล้ว · {data.customer.phoneMasked}
              </p>
            ) : (
              <p className="text-default-800 mb-0 text-sm">
                ยังไม่เชื่อม — จะเชื่อมอัตโนมัติเมื่อสร้าง{cta.tabLabel}ด้วยเบอร์ของลูกค้ารายนี้
              </p>
            )}
          </div>
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
          <p className="text-default-900 mb-0 text-sm font-semibold">รายการ{cta.tabLabel}</p>
          <button
            type="button"
            onClick={startCreateOrder}
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex shrink-0 items-center gap-1 text-nowrap"
          >
            <Icon icon={cta.icon} className="size-4" />
            สร้าง{cta.tabLabel}
          </button>
        </div>

        {data.customer ? (
          data.orders.length === 0 ? (
            <p className="text-default-700 mb-0 text-sm">{cta.emptyLabel}</p>
          ) : (
            <OrdersList conversationId={data.conversationId} initial={data.orders} contactName={data.contactName} channel={data.channel} customerAvatar={data.avatar} />
          )
        ) : (
          <p className="text-default-700 mb-0 text-sm">
            ยังไม่เชื่อมกับลูกค้าในระบบ จึงยังไม่มีประวัติให้ดู — สร้าง{cta.tabLabel}ด้วยเบอร์ของลูกค้ารายนี้แล้วระบบจะเชื่อมให้เอง
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
