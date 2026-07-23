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
 * A-1: CTA + tab ที่ 2 เปลี่ยนตาม Shop.vertical — GENERAL→"สร้างออเดอร์"/"ออเดอร์",
 * LODGING→"เปิดการจอง"/"การจอง". `vertical` ถูก resolve (fallback GENERAL เมื่อค่าไม่รู้จัก)
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
import Link from 'next/link'
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { formatDate } from '@/lib/format-date'
import type { ShopVertical } from '@/lib/lodging'
import { ChannelBadge } from '../../components/ChannelBadge'
import CustomerCrmSection from './CustomerCrmSection'

export type CustomerPanelOrder = {
  id: string
  token: string
  status: string
  fulfillmentMode: string
  totalAmount: string // "1234.00" — Decimal serialize เป็น string ก่อนข้าม RSC boundary
  createdAt: string // ISO
  checkIn: string | null // ISO date — เฉพาะออเดอร์ vertical=LODGING (type=BOOKING)
  checkOut: string | null
}

export type CustomerPanelData = {
  conversationId: string // feature 00018 CRM — ใช้เรียก /api/chat/conversations/[id]/crm
  contactName: string
  channel: string // 'DEEP' | 'MESSENGER' | 'INSTAGRAM'
  /** ชื่อเพจที่เธรดผูกอยู่ — badge แสดงชื่อเพจแทนชื่อช่องทาง (ให้ตรงกับ header เธรด) null = Deep */
  channelName: string | null
  vertical: ShopVertical
  /** null = ยังไม่ผูก Customer — phoneMasked ผ่าน maskPhone() มาแล้วเสมอ (ห้ามส่งเบอร์เต็ม) */
  customer: { id: string; phoneMasked: string } | null
  orders: CustomerPanelOrder[]
}

type VerticalCta = { label: string; href: string; icon: string; tabLabel: string; emptyLabel: string }

const VERTICAL_CTA: Record<ShopVertical, VerticalCta> = {
  GENERAL: {
    label: 'สร้างออเดอร์',
    href: '/orders/new',
    icon: 'shopping-cart-plus',
    tabLabel: 'คำสั่งซื้อ', // user สั่ง 2026-07-23 (เดิม "ออเดอร์")
    emptyLabel: 'ยังไม่มีประวัติออเดอร์',
  },
  LODGING: {
    label: 'เปิดการจอง',
    href: '/bookings/new',
    icon: 'calendar-check',
    tabLabel: 'การจอง',
    emptyLabel: 'ยังไม่มีประวัติการจอง',
  },
}

// precedent: OrderCard.tsx:34-37 (seller /orders list) — reuse token mapping เดียวกันเป๊ะ
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning' },
  SHIPPED: { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info' },
  CONFIRMED: { label: 'สำเร็จ', cls: 'bg-success/15 text-success' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-default-100 text-default-500' },
}

type Tab = 'customer' | 'orders' | 'note'

/** แท็บของ right panel — label ของ 'orders' มาจาก vertical (คำสั่งซื้อ/การจอง) จึงเว้นว่างไว้ */
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'customer', label: 'ข้อมูลลูกค้า', icon: 'user-circle' },
  { key: 'orders', label: '', icon: 'shopping-cart' },
  { key: 'note', label: 'โน๊ต', icon: 'notes' },
]

/**
 * CustomerPanelBody — เนื้อหาจริง (header + tabs + tab content) แชร์ระหว่าง CustomerPanel
 * (desktop persistent column) และ CustomerPanelSheet (มือถือ/tablet <1024px) กันโค้ดซ้ำ 2 จุด
 */
export function CustomerPanelBody({ data }: { data: CustomerPanelData }) {
  const [tab, setTab] = useState<Tab>('customer')
  const cta = VERTICAL_CTA[data.vertical]
  const orderHref = (token: string) => (data.vertical === 'LODGING' ? `/bookings/${token}` : `/orders/${token}`)

  return (
    <>
      {/* p-4 + gap-3 ให้เท่ากับ .card-body ของ Paces — user feedback บน prod ว่า padding เดิม
          (px-4 py-3) อึดอัด หัวการ์ดชิดขอบเกินไป */}
      <div className="flex items-center gap-3 border-b border-default-200 border-dashed p-4">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {generateInitials(data.contactName) || '?'}
        </span>
        <div className="min-w-0">
          <p className="text-default-900 mb-1 truncate text-sm font-semibold">{data.contactName}</p>
          <ChannelBadge channel={data.channel} label={data.channelName} />
        </div>
      </div>

      {/* tabs — 3 ตัว (user สั่ง 2026-07-23): ข้อมูลลูกค้า / คำสั่งซื้อ|การจอง / โน๊ต พร้อมไอคอน
          (ไอคอน user เลือกเอง: user-circle / shopping-cart / notes — ไม่ได้เดา ตาม convention
          docs/conventions/no-emoji-use-icons.md ที่ห้าม emoji และห้ามเดา icon ที่ spec ไม่ระบุ)
          px-4 ให้ tab แรกเริ่มตรงกับ padding ของหัวการ์ดและเนื้อหา ไม่ชิดขอบซ้าย
          text-sm + gap-1.5: 3 แท็บพร้อมไอคอนต้องพอดีความกว้าง 384px ของคอลัมน์นี้โดยไม่ตกบรรทัด */}
      <nav className="nav-tabs px-4" role="tablist" aria-label="ข้อมูลลูกค้า">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`nav-link inline-flex items-center gap-1.5 px-3 text-sm ${
              tab === t.key ? 'border-b border-primary text-primary' : ''
            }`}
          >
            <Icon icon={t.icon} className="text-base" />
            {t.key === 'orders' ? cta.tabLabel : t.label}
          </button>
        ))}
      </nav>

      <div className="p-4">
        {tab === 'customer' ? (
          <div className="space-y-4">
            {/* feature 00018 CRM — แก้ไข tag/note/สถานะ/เบอร์/ที่อยู่/ชื่อในแชท ต่อผู้ติดต่อ */}
            <CustomerCrmSection conversationId={data.conversationId} />
            {/* รหัสลูกค้า — user สั่ง 2026-07-23: "ก็แค่ขึ้นว่าเค้ามีรหัสลูกค้าหรือยัง"
                เดิมสถานะ "ยังไม่ผูก" กินพื้นที่เป็นย่อหน้าอธิบายกลไก + ปุ่มสร้างออเดอร์ ซึ่ง
                (ก) อธิบายกลไกภายในระบบให้คนที่ไม่ได้ถาม (ข) ปุ่มไม่ prefill อะไรเลย จึงไม่ได้
                ช่วยงานตรงจุดนี้ — เหลือเป็นแถวข้อมูลแถวเดียวรูปแบบเดียวกับฟิลด์อื่นใน
                CustomerCrmSection (label 2xs + ค่า / "—" เมื่อยังไม่มี) ปุ่มสร้างออเดอร์ยังอยู่
                ในแท็บออเดอร์ซึ่งเป็นบริบทที่ตรงกว่า */}
            <div>
              <p className="text-default-400 mb-0.5 text-2xs">รหัสลูกค้า</p>
              <div className="text-default-800 text-sm">
                {data.customer ? (
                  <span className="font-mono font-semibold">#{data.customer.id.slice(0, 8).toUpperCase()}</span>
                ) : (
                  <span className="text-default-400">—</span>
                )}
              </div>
            </div>
          </div>
        ) : tab === 'note' ? (
          /* แท็บโน๊ต — โน้ตภายในร้านต่อผู้ติดต่อ (ลูกค้าไม่เห็น; AI ใช้เป็นบริบทตอนช่วยร่าง) */
          <CustomerCrmSection conversationId={data.conversationId} variant="note" />
        ) : data.customer ? (
          data.orders.length === 0 ? (
            <p className="text-default-400 text-sm">{cta.emptyLabel}</p>
          ) : (
            <div className="space-y-2">
              {data.orders.map((o) => {
                const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.PENDING!
                return (
                  <Link
                    key={o.id}
                    href={orderHref(o.token)}
                    className="hover:bg-default-100 block rounded-lg border border-default-200 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-default-900 font-mono text-xs font-semibold">
                        #{o.token.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`badge text-2xs ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {data.vertical === 'LODGING' && o.checkIn && o.checkOut && (
                      <p className="text-default-500 mt-1 text-xs">
                        {formatDate(o.checkIn)} – {formatDate(o.checkOut)}
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-default-400 text-xs">{formatDate(o.createdAt)}</span>
                      <span className="text-default-900 text-sm font-semibold">
                        ฿{Number(o.totalAmount).toLocaleString('th-TH')}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-default-500 text-sm">ผูกลูกค้าก่อนเพื่อดูประวัติออเดอร์</p>
            <Link
              href={cta.href}
              className="btn bg-primary text-white hover:bg-primary-hover flex w-full items-center justify-center gap-1.5"
            >
              <Icon icon={cta.icon} className="text-lg" />
              {cta.label}
            </Link>
          </div>
        )}
      </div>
    </>
  )
}

/** shell การ์ดเดี่ยว desktop (≥1024px) — ความกว้างคุมจาก page.tsx (wrapper `w-80` มาตรฐาน Tailwind
 * scale, ไม่ใช่ bracket arbitrary — ดู comment page.tsx ส่วน CustomerPanel wrapper) */
export default function CustomerPanel({ data }: { data: CustomerPanelData }) {
  return (
    <div className="card">
      <CustomerPanelBody data={data} />
    </div>
  )
}
