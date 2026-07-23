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
import { useCallback, useEffect, useId, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { formatDate } from '@/lib/format-date'
import type { ShopVertical } from '@/lib/lodging'
import { ChannelBadge } from '../../components/ChannelBadge'
import CustomerCrmSection, { type ConversationCrm } from './CustomerCrmSection'

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
  { key: 'note', label: 'โน้ต', icon: 'notes' }, // สะกด "โน้ต" ให้ตรงกับเนื้อหาในแท็บ (user ยืนยัน 2026-07-23)
]

/** สรุปประวัติจากออเดอร์จริงที่ page.tsx query มาแล้ว (ไม่ต้อง query เพิ่ม) — impeccable critique P1-C:
 *  ผู้ขายเปิดวันละหลายสิบเธรดและต้องการคำตอบเดียวใน 1 วินาที ("เคยซื้อกี่ครั้ง จ่ายครบไหม")
 *  แต่เดิมต้องคลิกแท็บ → อ่านเอง → บวกเลขในหัว. ยอดรวมไม่นับออเดอร์ที่ยกเลิก */
function summarize(orders: CustomerPanelOrder[]) {
  const done = orders.filter((o) => o.status === 'CONFIRMED').length
  const total = orders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + Number(o.totalAmount), 0)
  return { count: orders.length, done, total, latest: orders[0]?.createdAt ?? null }
}

/**
 * CustomerPanelBody — เนื้อหาจริง (header + tabs + tab content) แชร์ระหว่าง CustomerPanel
 * (desktop persistent column) และ CustomerPanelSheet (มือถือ/tablet <1024px) กันโค้ดซ้ำ 2 จุด
 */
export function CustomerPanelBody({ data }: { data: CustomerPanelData }) {
  const [tab, setTab] = useState<Tab>('customer')
  const cta = VERTICAL_CTA[data.vertical]
  const orderHref = (token: string) => (data.vertical === 'LODGING' ? `/bookings/${token}` : `/orders/${token}`)
  const uid = useId() // prefix id ของ tab/panel — desktop panel กับ sheet มือถืออยู่ใน DOM พร้อมกันได้
  const summary = summarize(data.orders)

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
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {generateInitials(data.contactName) || '?'}
        </span>
        <div className="min-w-0">
          <p className="text-default-900 mb-1 truncate text-sm font-semibold">{data.contactName}</p>
          <ChannelBadge channel={data.channel} label={data.channelName} />
        </div>
      </div>

      {/* สรุปประวัติ 1 บรรทัด — คำตอบที่ผู้ขายต้องการใน 1 วินาที ("เคยซื้อกี่ครั้ง จ่ายครบไหม")
          คำนวณจากออเดอร์จริงที่ page.tsx ส่งมาแล้ว ไม่มีตัวเลขปลอมสักตัว (PRODUCT.md: trust ต้องมา
          จากสัญญาณจริง show-don't-tell). ลูกค้าที่ยังไม่ผูก = บอกตรง ๆ ว่ายังไม่มีประวัติในระบบ */}
      <div className="border-b border-default-200 border-dashed px-4 py-2.5 text-xs">
        {data.customer ? (
          <p className="text-default-800 mb-0 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-success inline-flex items-center gap-1 font-semibold">
              <Icon icon="circle-check" className="text-sm" />
              ซื้อ {summary.count} ครั้ง
            </span>
            {summary.done > 0 && <span className="text-default-700">สำเร็จ {summary.done}</span>}
            <span className="text-default-700">รวม ฿{summary.total.toLocaleString('th-TH')}</span>
            {summary.latest && <span className="text-default-700">ล่าสุด {formatDate(summary.latest)}</span>}
          </p>
        ) : (
          <p className="text-default-700 mb-0">ยังไม่มีประวัติซื้อในระบบ — ลูกค้าใหม่</p>
        )}
      </div>

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
            {/* จำนวนออเดอร์บนแท็บ — เดิมต้องคลิกเข้าไปถึงจะรู้ว่ามี 0 (critique P1-C) */}
            {t.key === 'orders' && data.customer && summary.count > 0 && (
              <span className="badge bg-default-100 text-default-700 text-2xs">{summary.count}</span>
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
        {data.customer ? (
          data.orders.length === 0 ? (
            /* ผูกแล้วแต่ยังไม่มีออเดอร์ = เคสที่ "พร้อมสร้างที่สุด" — เดิมกลับเป็นเคสเดียวที่ไม่มีปุ่ม
               ส่วนเคสที่ยังผูกไม่ได้กลับมีปุ่ม (critique P1-C: empty state กลับด้าน) */
            <div className="space-y-3">
              <p className="text-default-700 mb-0 text-sm">{cta.emptyLabel}</p>
              <Link
                href={cta.href}
                className="btn bg-primary text-white hover:bg-primary-hover flex min-h-11 w-full items-center justify-center gap-1.5"
              >
                <Icon icon={cta.icon} className="text-lg" />
                {cta.label}
              </Link>
            </div>
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
                      <span className="text-default-700 text-xs">{formatDate(o.createdAt)}</span>
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
            <p className="text-default-700 mb-0 text-sm">
              ยังไม่เชื่อมกับลูกค้าในระบบ จึงยังไม่มีประวัติให้ดู — สร้าง{cta.tabLabel}ด้วยเบอร์ของลูกค้ารายนี้แล้วระบบจะเชื่อมให้เอง
            </p>
            <Link
              href={cta.href}
              className="btn bg-primary text-white hover:bg-primary-hover flex min-h-11 w-full items-center justify-center gap-1.5"
            >
              <Icon icon={cta.icon} className="text-lg" />
              {cta.label}
            </Link>
          </div>
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
