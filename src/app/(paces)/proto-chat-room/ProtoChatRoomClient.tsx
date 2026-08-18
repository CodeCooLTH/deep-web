'use client'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PROTOTYPE — โค้ดทิ้ง ห้าม merge เข้า main · ห้าม import จากที่อื่น
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ทำไมอยู่ใน `src/` ไม่ใช่ไฟล์ HTML ใน `docs/`:
 *   user ขอ **CSS เดียวกันเป๊ะ ๆ** ซึ่งไฟล์ static ทำไม่ได้ —
 *     - token อยู่ใน `@theme{}` ของ Tailwind v4 (`_root.css` / `_theme-saas.css`)
 *       → เบราว์เซอร์ทิ้ง at-rule ที่ไม่รู้จักทั้งบล็อก
 *     - `_buttons.css` 7 + `_card.css` 11 + `_badge.css` 3 = 21 จุดที่ใช้ `@apply`
 *     - utility ทุกตัวต้องผ่าน build ของ Tailwind
 *   ⇒ ทางเดียวคือรันในแอปจริง
 *
 * วางไว้ **นอก `/seller/`** โดยตั้งใจ: `src/proxy.ts:188` เด้ง `/seller/*` ไป sign-in
 * ถ้าไม่มี token — หน้านี้อยู่รากของ `(paces)` จึงเปิดได้โดยไม่ต้องล็อกอิน
 * แต่ยังได้ `app.css` + Anuphan + Tailwind + Preline จาก `(paces)/layout.tsx` ครบ
 *
 *   เปิดที่:  http://localhost:3000/proto-chat-room?variant=B2
 *   สลับ:    ← →  ·  ?variant=NOW|B2|B3|B4|B5
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * โจทย์ที่ 5 แบบนี้ตอบ (แคบลงจาก "ทั้งห้อง" แล้ว — user เคาะแบบ B ไปแล้ว):
 *   ท้ายจอของห้องแชทมือถือควรจัดยังไง เมื่อมีของ 2 ชนิดที่ต่างกันโดยเนื้อแท้
 *     ก) **พัสดุกำลังจัดส่ง** = ข้อมูลที่ดูบ่อย ไม่ใช่ปัญหา (โทน info)
 *     ข) **คำเตือน 4 อัน** = เรื่องที่ต้องลงมือ (โทน danger/warning)
 *
 * 🛑 ทุกแบบ **ห้ามยุบ ก) รวมกับ ข)** — `OrderProgressBar.tsx` เขียนไว้เองว่า
 *    "แถบนี้เป็นทางลัดดูสถานะ ไม่ใช่ alert — โทน primary ไม่ใช่ warning/danger"
 *    และ user สั่งตรง ๆ ว่า "ไม่ต้องเอาพวกข้อมูลคำสั่งซื้อหรือรูปอะไรไปรวม"
 *
 * ของจริงที่ import มาใช้ ไม่ได้วาดใหม่ (HR1):
 *   ThreadChipStrip · ShipmentStepper · ChannelBadgeOverlay · Icon
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ThreadChipStrip, {
  type ThreadChipItem,
} from '../seller/(chat)/inbox/[conversationId]/components/ThreadChipStrip'
import ShipmentStepper from '../seller/(chat)/_components/ShipmentStepper'
import { ChannelBadgeOverlay } from '../seller/(chat)/inbox/components/ChannelBadge'
// ตัวจริงที่ implement ลงห้องแชทไปแล้ว — หน้านี้เป็น harness ให้ยืนยันได้โดยไม่ต้องล็อกอิน
import {
  ShipmentTailBar,
  StatusTailBar,
} from '../seller/(chat)/inbox/[conversationId]/components/ThreadTailBars'

/* ── fixture — จาก capture ของ user + ไฟล์จริงในรีโป ────────────────────────── */
const FX = {
  buyerName: 'Sekson Oonnom',
  channel: 'FACEBOOK',
  orderNo: 'DP25690847A68A18',
  courier: 'Flash Thunder',
  track: 'TH1601924VZF4J0',
  /* stage ของ stepper มาจาก describeProgress(shipmentStatus, carrierStatus) — ไม่ตัดสินเอง */
  shipmentStatus: 'CREATED',
  carrierStatus: 'TRANSPORTING',
  activeOrders: 2,
}

/** คำเตือน — ข้อความคัดจาก ChatThread.tsx:1926 / :1954 / :2079 ไม่ได้แต่งเอง */
const WARNS = [
  {
    key: 'token',
    tone: 'danger' as const,
    icon: 'plug-connected-x',
    short: 'การเชื่อมต่อกับเพจนี้มีปัญหา',
    full: 'การเชื่อมต่อกับเพจนี้มีปัญหา — ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่',
    act: 'ตั้งค่าช่องทาง',
  },
  {
    key: 'bot',
    tone: 'warning' as const,
    icon: 'robot',
    short: 'บอทหยุดตอบห้องนี้',
    full: 'บอทหยุดตอบห้องนี้ชั่วคราวเพราะมีคนเข้ามาตอบเอง',
    act: 'ให้บอทตอบต่อ',
  },
  {
    key: 'window',
    tone: 'warning' as const,
    icon: 'clock',
    short: 'เกิน 24 ชั่วโมงแล้ว — ตอบเองได้ ห้ามส่งโปรโมชัน',
    full: 'เกิน 24 ชั่วโมงแล้ว — ตอบเองได้ ห้ามส่งโปรโมชัน',
    act: null,
  },
  {
    key: 'chatbot-test',
    tone: 'info' as const,
    icon: 'flask',
    short: 'ห้องนี้กำลังใช้ทดสอบ DeepAI',
    full: 'ห้องนี้กำลังใช้ทดสอบ DeepAI — ข้อความที่บอทตอบจะไม่ถูกนับรวมในสถิติ',
    act: null,
  },
]
const N = WARNS.length

const TONE_TEXT = {
  danger: 'text-danger-ink',
  warning: 'text-warning-ink',
  info: 'text-info-ink',
} as const
const TONE_BG = {
  danger: 'bg-danger/15',
  warning: 'bg-warning/15',
  info: 'bg-info/15',
} as const

/* ══════════ หัวเธรด — คัด class จาก ChatThread.tsx:2402-2440 ตรงตัว ══════════ */
function ThreadHeader() {
  return (
    <div className="card-header flex-nowrap py-3">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" className="btn btn-icon border-default-300 shrink-0" aria-label="ย้อนกลับ">
          <Icon icon="arrow-left" className="text-lg" />
        </button>
        <span className="relative shrink-0">
          <span className="bg-default-200 text-default-600 flex size-9 items-center justify-center rounded-full text-sm font-semibold">
            SO
          </span>
          <ChannelBadgeOverlay channel={FX.channel} />
        </span>
        {/* ชื่อบรรทัดเดียว — ของจริงไม่มีบรรทัด 2 (ยืนยันจาก capture ของ user 2026-08-16) */}
        <h5 className="text-base min-w-0 truncate" title={FX.buyerName}>
          {FX.buyerName}
        </h5>
      </div>
      <div className="ms-auto flex shrink-0 gap-1.5">
        <button type="button" className="btn btn-icon border-default-300 relative" aria-label="คลังไฟล์">
          <Icon icon="folder" className="text-lg" />
          <span className="badge bg-primary border-card absolute -top-2 -end-2 rounded-full border-2 text-white">
            2
          </span>
        </button>
        <button type="button" className="btn btn-icon border-default-300 relative" aria-label="เมนู">
          <Icon icon="dots-vertical" className="text-base" />
          <span className="border-card bg-default-600 absolute -top-2 -end-2 flex size-4.5 items-center justify-center rounded-full border-2 text-white">
            <Icon icon="bell-off" className="text-2xs" />
          </span>
        </button>
      </div>
    </div>
  )
}

/* ══════════ ช่องพิมพ์ — คัดจาก ChatThread.tsx:3950-4020 ══════════ */
function Composer() {
  return (
    <div className="border-default-200 border-t p-3">
      <div className="mb-2 flex items-center gap-1">
        {['bolt', 'box', 'paperclip', 'mood-smile', 'sticker'].map((n) => (
          <button key={n} type="button" className="btn btn-icon btn-sm text-default-500" aria-label={n}>
            <Icon icon={n} className="text-lg" />
          </button>
        ))}
        <button type="button" className="btn btn-icon btn-sm text-success" aria-label="AI">
          <Icon icon="sparkles" className="text-lg" />
        </button>
        <button type="button" className="btn btn-icon btn-sm text-primary ms-auto" aria-label="สร้างคำสั่งซื้อ">
          <Icon icon="shopping-cart-plus" className="text-lg" />
        </button>
      </div>
      <div className="border-default-300 rounded-lg border">
        <textarea
          rows={1}
          readOnly
          className="block w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-0"
          placeholder="พิมพ์ข้อความ หรือวางไฟล์ที่นี่..."
        />
        <div className="flex justify-end px-2 pb-2">
          <button
            type="button"
            className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 shrink-0 rounded-full text-white sm:min-h-0"
          >
            ส่ง
            <Icon icon="send-2" className="ms-1 text-base" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════ สตรีม ══════════ */
function Stream({ showOrderCard, children }: { showOrderCard?: boolean; children?: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        <span className="bg-default-100 text-default-500 text-2xs self-center rounded-full px-3 py-0.5">
          เมื่อวานนี้
        </span>
        <div className="bg-default-200 text-default-800 max-w-xs self-start rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
          สนใจโช้คหลัง 110 สีแดงครับ ส่งพรุ่งนี้ทันไหม
        </div>
        <div className="bg-primary max-w-xs self-end rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white">
          ทันครับ ตัดรอบส่ง 17:00 น. เดี๋ยวเปิดบิลให้เลยนะครับ
        </div>

        {showOrderCard && (
          /* การ์ดคำสั่งซื้อในสตรีม — หลักของแบบ B: "ตอนที่ลูกค้าสั่ง" คือเหตุการณ์ */
          <div className="card border-default-300 my-1 border shadow-sm">
            <div className="text-default-500 text-2xs flex items-center gap-1.5 px-3 pt-2">
              <Icon icon="shopping-cart" className="text-sm" />
              เปิดคำสั่งซื้อจากแชทนี้
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="bg-primary/15 text-primary-ink flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon icon="package" className="text-lg" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-default-900 block truncate text-sm font-semibold">{FX.orderNo}</span>
                <span className="text-default-500 block truncate text-xs">
                  โช้คหลัง 110 สีแดง · ฿360 · เก็บเงินปลายทาง
                </span>
              </span>
              <Icon icon="chevron-right" className="text-default-400 shrink-0 text-base" />
            </div>
          </div>
        )}

        <div className="bg-primary max-w-xs self-end rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white">
          ส่งของออกแล้วนะครับ เลขพัสดุ {FX.track}
        </div>
        <div className="text-success text-2xs flex items-center justify-end gap-1">
          <Icon icon="checks" className="text-sm" /> อ่านแล้ว
        </div>
      </div>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ที่มาของแชท (ตอบกลับจากโฆษณา / จากคอมเมนต์)
   ══════════════════════════════════════════════════════════════════════════════
   🛑 user สั่ง 2026-08-16: "reply comment, reply ads ใช้แบบนี้ **เหมือนเดิม** ครับ
      ถ้าอันไหนล่าสุดให้แสดงแค่ **อันเดียว** ครับ"

   ⇒ markup ยกมาจาก `ChatThread.tsx:2325-2360` (detail ของ contextItems 'ad') ตรงตัว
      ไม่ได้ออกแบบใหม่: thumb size-10 rounded-md · หัวข้อ text-sm font-semibold ·
      เนื้อโฆษณา truncate + ลิงก์ "ดูโฆษณา" text-primary · ปุ่ม ✕ ปิดถาวร
      (Base เดิมของบล็อกนั้น = theme .../ui/alerts/page.tsx DismissingAlert)

   ⇒ **เปลี่ยนพฤติกรรม 1 อย่าง**: ของเดิม `contextItems` push ได้ทั้ง comment และ ad
      พร้อมกัน (user เจอบนจอจริงว่าโผล่ 2 อัน) — ตอนนี้เลือก **อันล่าสุดอันเดียว**
      ⇒ ทับข้อสรุปเดิมของผมในสเปกที่เขียนว่า "ที่มา 2 อันเป็นการ์ด 2 ใบเรียงตามเวลา"
*/
const ORIGINS = [
  {
    key: 'comment',
    at: '2026-08-14T09:41:00+07:00',
    title: 'แชทนี้ตอบกลับความคิดเห็นของลูกค้า',
    /* ข้อความของลูกค้า/โฆษณา = ข้อมูลจากภายนอก ไม่ใช่ chrome ของเรา
       (อิโมจิที่ติดมาจึงเป็น carve-out ของ HR12 — เราไม่ได้เป็นคนใส่) */
    body: 'ชุด 3 กระปุกยังมีอยู่ไหมคะ สนใจค่ะ',
    link: 'ดูความคิดเห็น',
  },
  {
    key: 'ad',
    at: '2026-08-15T18:02:00+07:00',
    title: 'แชทนี้ตอบกลับจากโฆษณาของคุณ',
    body: 'โรงงานล้างสต๊อก! โช๊คหลังเวฟ ลด 80% ส่งฟรีทั่วประเทศ ทักแชทรับส่วนลดเพิ่ม',
    link: 'ดูโฆษณา',
  },
]
/** อันล่าสุดอันเดียว — ตัดสินจากเวลา ไม่ใช่ลำดับใน array (ลำดับเปลี่ยนได้ที่ฝั่ง caller) */
const LATEST_ORIGIN = [...ORIGINS].sort((a, b) => (a.at < b.at ? 1 : -1))[0]

function OriginCard() {
  const o = LATEST_ORIGIN
  return (
    <div className="border-default-200 flex items-center gap-3 border-b px-4 py-2.5" role="note">
      <span className="bg-default-100 text-default-700 flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon icon={o.key === 'ad' ? 'speakerphone' : 'message-circle'} className="text-lg" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-default-800 mb-0 text-sm font-semibold">{o.title}</p>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-default-700 min-w-0 truncate text-sm" title={o.body}>
            {o.body}
          </span>
          <a href="#" className="text-primary shrink-0 text-sm font-medium hover:underline">
            {o.link}
          </a>
        </div>
      </div>
      <button type="button" className="btn btn-icon btn-sm text-default-400 shrink-0" aria-label="ปิด">
        <Icon icon="x" className="text-lg" />
      </button>
    </div>
  )
}

/* ══════════ ชิ้นส่วนที่หลายแบบใช้ร่วม ══════════ */

/** กล่องพัสดุกาง — โลโก้ + ชื่อขนส่ง + เลขพัสดุ + คัดลอก + ShipmentStepper ตัวจริง */
function ShipBox({ onCollapse }: { onCollapse?: () => void }) {
  return (
    <div className="border-default-200 bg-card border-t p-3">
      <div className="mb-3 flex items-center gap-2.5">
        {/* โลโก้จริงในรีโป — courier.ts:35 (ห้ามไปหาโลโก้แบรนด์จากอินเทอร์เน็ต) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logos/flash-express.jpeg"
          alt=""
          className="ring-default-200 size-11 shrink-0 rounded-lg object-contain ring-1"
        />
        <span className="min-w-0 flex-1">
          <span className="text-default-500 block truncate text-xs">{FX.courier}</span>
          <span className="text-default-900 block truncate text-base font-bold">{FX.track}</span>
        </span>
        <button type="button" className="btn btn-icon btn-sm text-default-400" aria-label="คัดลอกเลขพัสดุ">
          <Icon icon="copy" className="text-lg" />
        </button>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="btn btn-icon btn-sm text-default-400"
            aria-label="ย่อ"
          >
            <Icon icon="chevron-down" className="text-lg" />
          </button>
        )}
      </div>
      {/* ตัวจริง ไม่ได้วาดใหม่ */}
      <ShipmentStepper
        shipmentStatus={FX.shipmentStatus}
        carrierStatus={FX.carrierStatus}
        size="md"
        showNotice={false}
      />
    </div>
  )
}

/** แถบสถานะแบบยุบ */
function StatusBar({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-danger/15 text-danger-ink border-default-200 flex w-full items-center gap-2 border-t px-4 py-2.5 text-start text-sm font-semibold"
    >
      <Icon icon="alert-triangle" className="shrink-0 text-base" />
      <span className="min-w-0 flex-1 truncate">สถานะห้องแชท</span>
      <span className="badge bg-danger/25 text-danger-ink shrink-0 rounded-full">{N}</span>
      <Icon icon="chevron-up" className="shrink-0 text-base opacity-70" />
    </button>
  )
}

/** แผงสถานะ slide up — สถานะล้วน ไม่มีออเดอร์/ไฟล์/ที่มา (user สั่งตรง ๆ) */
function StatusSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 z-40 bg-black/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`สถานะห้องแชท ${N} รายการ`}
        className="bg-card absolute inset-x-0 bottom-0 z-50 max-h-96 overflow-y-auto rounded-t-2xl shadow-lg"
      >
        <div className="border-default-300 bg-card sticky top-0 flex items-center gap-2 border-b border-dashed px-4 pb-2.5 pt-4">
          <span className="bg-default-300 absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full" />
          <Icon icon="alert-triangle" className="text-danger-ink text-lg" />
          <h5 className="text-base mb-0">สถานะห้องแชท ({N})</h5>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon btn-sm text-default-400 ms-auto"
            aria-label="ปิด"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>
        <ul className="list-none ps-0">
          {WARNS.map((w) => (
            <li
              key={w.key}
              className={`border-default-200 flex items-start gap-2.5 border-b px-4 py-3 text-sm ${TONE_BG[w.tone]} ${TONE_TEXT[w.tone]}`}
            >
              <Icon icon={w.icon} className="mt-0.5 shrink-0 text-base" />
              <span className="min-w-0 flex-1">{w.full}</span>
              {w.act && (
                <button type="button" className="btn btn-sm bg-card text-default-700 shrink-0">
                  {w.act}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   NOW — โครงปัจจุบันบน prod (ตัวสอบเทียบกับ capture ของ user)
   ถ้าแบบนี้ยังไม่เหมือน capture แปลว่าคัด class มาผิด ต้องแก้ก่อนจะเชื่อแบบอื่น
   ══════════════════════════════════════════════════════════════════════════════ */
function RoomNOW() {
  const items: ThreadChipItem[] = [
    {
      key: 'chatbot-test',
      tone: 'info',
      icon: 'flask',
      short: 'ห้องนี้กำลังใช้ทดสอบ DeepAI',
      detail: <p className="mb-0 text-sm">{WARNS[3].full}</p>,
    },
    {
      key: 'order',
      tone: 'order',
      icon: 'truck-delivery',
      short: `${FX.orderNo} · กำลังจัดส่ง`,
      detail: (
        <ShipmentStepper
          shipmentStatus={FX.shipmentStatus}
          carrierStatus={FX.carrierStatus}
          size="sm"
          showNotice={false}
        />
      ),
    },
  ]
  return (
    <>
      <ThreadHeader />
      <ThreadChipStrip items={items} />
      <Stream />
      <Composer />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   B2 — 2 แถบยุบปักท้าย (พัสดุ + สถานะ)
   ══════════════════════════════════════════════════════════════════════════════ */
/**
 * 🛑 B2 ใช้ **component ตัวจริงที่ implement ลง ChatThread ไปแล้ว** (`ThreadTailBars.tsx`)
 *    ไม่ใช่ของจำลองในไฟล์นี้ — หน้าเธรดจริงต้องล็อกอินถึงจะเปิดดูได้ หน้านี้จึงทำหน้าที่เป็น
 *    harness ให้ยืนยันได้ว่า component นั้น render ผ่านจริงโดยไม่ต้องมี session
 *    ⇒ ถ้า B2 ตรงนี้เพี้ยน แปลว่าของจริงในห้องแชทก็เพี้ยนด้วย (ตัวเดียวกันเป๊ะ)
 */
function RoomB2() {
  return (
    <>
      <ThreadHeader />
      <OriginCard />
      <Stream showOrderCard />
      <ShipmentTailBar
        short={`${FX.orderNo} · กำลังจัดส่ง`}
        icon="truck-delivery"
        count={FX.activeOrders}
        courierLogo="/images/logos/flash-express.jpeg"
        courierName={FX.courier}
        detail={<ShipBox />}
      />
      <StatusTailBar
        items={WARNS.map((w) => ({
          key: w.key,
          tone: w.tone,
          icon: w.icon,
          short: w.short,
          detail: (
            <div
              className={`border-default-200 flex items-start gap-2.5 border-b px-4 py-3 text-sm ${TONE_BG[w.tone]} ${TONE_TEXT[w.tone]}`}
            >
              <Icon icon={w.icon} className="mt-0.5 shrink-0 text-base" />
              <span className="min-w-0 flex-1">{w.full}</span>
              {w.act && (
                <button type="button" className="btn btn-sm bg-card text-default-700 shrink-0">
                  {w.act}
                </button>
              )}
            </div>
          ),
        }))}
      />
      <Composer />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   B3 — พัสดุกางค้างเสมอ + สถานะเป็นแถบยุบ
   เหตุผล: feedback ลูกค้าจริง "ลูกค้าที่ใช้บนมือถือส่วนใหญ่ เน้นดู Order lists มากกว่า"
   ⇒ ของที่ดูบ่อยที่สุดไม่ควรต้องกดเปิดทุกครั้ง
   ══════════════════════════════════════════════════════════════════════════════ */
function RoomB3() {
  const [sheet, setSheet] = useState(false)
  return (
    <>
      <ThreadHeader />
      <OriginCard />
      <Stream showOrderCard>{sheet && <StatusSheet onClose={() => setSheet(false)} />}</Stream>
      <ShipBox />
      <StatusBar onOpen={() => setSheet(true)} />
      <Composer />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   B4 — แถบเดียว สลับด้วยปุ่มแบ่งส่วน (พัสดุ | สถานะ)
   ประหยัดที่สุด: ท้ายจอสูงเท่าแถบเดียวเสมอ แต่เห็นได้ทีละเรื่อง
   🛑 ยังไม่ยุบสองเรื่องเข้าด้วยกัน — คนละปุ่ม คนละสี แค่ใช้ที่ร่วมกัน
   ══════════════════════════════════════════════════════════════════════════════ */
function RoomB4() {
  const [tab, setTab] = useState<'ship' | 'stat' | null>(null)
  return (
    <>
      <ThreadHeader />
      <OriginCard />
      <Stream showOrderCard />
      {tab === 'ship' && <ShipBox />}
      {tab === 'stat' && (
        <ul className="border-default-200 list-none border-t ps-0">
          {WARNS.map((w) => (
            <li
              key={w.key}
              className={`border-default-200 flex items-start gap-2.5 border-b px-4 py-2.5 text-sm ${TONE_BG[w.tone]} ${TONE_TEXT[w.tone]}`}
            >
              <Icon icon={w.icon} className="mt-0.5 shrink-0 text-base" />
              <span className="min-w-0 flex-1">{w.full}</span>
              {w.act && (
                <button type="button" className="btn btn-sm bg-card text-default-700 shrink-0">
                  {w.act}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-default-200 bg-default-100 flex items-center gap-2 border-t px-3 py-2">
        <button
          type="button"
          onClick={() => setTab(tab === 'ship' ? null : 'ship')}
          aria-expanded={tab === 'ship'}
          className={`btn btn-sm min-w-0 flex-1 justify-start rounded-full ${
            tab === 'ship' ? 'bg-info text-white' : 'bg-info/15 text-info-ink'
          }`}
        >
          <Icon icon="truck-delivery" className="shrink-0 text-base" />
          <span className="min-w-0 truncate">กำลังจัดส่ง</span>
          <span className="badge bg-card text-default-700 ms-auto shrink-0 rounded-full">
            {FX.activeOrders}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab(tab === 'stat' ? null : 'stat')}
          aria-expanded={tab === 'stat'}
          className={`btn btn-sm min-w-0 flex-1 justify-start rounded-full ${
            tab === 'stat' ? 'bg-danger text-white' : 'bg-danger/15 text-danger-ink'
          }`}
        >
          <Icon icon="alert-triangle" className="shrink-0 text-base" />
          <span className="min-w-0 truncate">สถานะ</span>
          <span className="badge bg-card text-default-700 ms-auto shrink-0 rounded-full">{N}</span>
        </button>
      </div>
      <Composer />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   B5 — ไม่มีแถบปักท้ายเลย · ปุ่มลอยมุมขวาบนของสตรีม
   สตรีมได้พื้นที่มากที่สุดในทุกแบบ — ราคาคือคำเตือนไม่มีถ้อยคำบนจอเลย
   ใส่ไว้เป็นขั้วเปรียบเทียบ (ทำให้เห็นว่า "ประหยัดที่สุด" ต้องจ่ายอะไร)
   ══════════════════════════════════════════════════════════════════════════════ */
function RoomB5() {
  const [sheet, setSheet] = useState(false)
  const [ship, setShip] = useState(false)
  return (
    <>
      <ThreadHeader />
      <OriginCard />
      <Stream showOrderCard>
        <div className="absolute end-3 top-3 z-30 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShip(true)}
            aria-label={`พัสดุ ${FX.activeOrders} รายการ`}
            className="btn btn-icon bg-info border-card relative rounded-full border-2 text-white shadow-lg"
          >
            <Icon icon="truck-delivery" className="text-lg" />
            <span className="badge bg-card text-info-ink border-card absolute -top-2 -end-2 rounded-full border-2">
              {FX.activeOrders}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-label={`สถานะห้องแชท ${N} รายการ`}
            className="btn btn-icon bg-danger border-card relative rounded-full border-2 text-white shadow-lg"
          >
            <Icon icon="alert-triangle" className="text-lg" />
            <span className="badge bg-card text-danger-ink border-card absolute -top-2 -end-2 rounded-full border-2">
              {N}
            </span>
          </button>
        </div>
        {sheet && <StatusSheet onClose={() => setSheet(false)} />}
        {ship && (
          <>
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setShip(false)}
              className="absolute inset-0 z-40 bg-black/35"
            />
            <div className="bg-card absolute inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-lg">
              <ShipBox onCollapse={() => setShip(false)} />
            </div>
          </>
        )}
      </Stream>
      <Composer />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   สลับแบบ — ตามกติกาของ prototype skill: ← → · อัปเดต ?variant= · ซ่อนบน production
   ══════════════════════════════════════════════════════════════════════════════ */
const VARIANTS = [
  { k: 'B2', name: '2 แถบยุบปักท้าย', render: RoomB2 },
  { k: 'B3', name: 'พัสดุกางค้าง + สถานะยุบ', render: RoomB3 },
  { k: 'B4', name: 'แถบเดียว สลับด้วยปุ่ม', render: RoomB4 },
  { k: 'B5', name: 'ปุ่มลอย ไม่มีแถบเลย', render: RoomB5 },
  { k: 'NOW', name: 'ของจริงบน prod (สอบเทียบ)', render: RoomNOW },
] as const

export default function ProtoChatRoomClient({ initialVariant }: { initialVariant?: string }) {
  const found = VARIANTS.findIndex((x) => x.k === initialVariant)
  const [i, setI] = useState(found >= 0 ? found : 0)

  const go = (d: number) => {
    const next = (i + d + VARIANTS.length) % VARIANTS.length
    setI(next)
    const u = new URL(location.href)
    u.searchParams.set('variant', VARIANTS[next].k)
    history.replaceState({}, '', u)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const Room = VARIANTS[i].render

  return (
    <div className="bg-body-bg flex min-h-dvh flex-col">
      {/* เต็มจอเสมอ ไม่มีกรอบมือถือปลอม — เปิดบน iPhone จริงแล้วเทียบกับ capture ได้ตรง ๆ
          บนเดสก์ท็อปใช้ DevTools responsive (iPhone 14 Pro Max = 430px) */}
      <div className="bg-card relative flex h-dvh w-full flex-col overflow-hidden">
        <Room />
      </div>

      {process.env.NODE_ENV !== 'production' && (
        <div className="bg-default-900 fixed inset-x-0 bottom-4 z-60 mx-auto flex w-fit items-center gap-1 rounded-full p-1.5 text-white shadow-lg">
          <button
            type="button"
            onClick={() => go(-1)}
            className="btn btn-icon btn-sm rounded-full text-white"
            aria-label="แบบก่อนหน้า"
          >
            <Icon icon="chevron-left" className="text-lg" />
          </button>
          <span className="min-w-56 px-2 text-center text-sm font-semibold">
            {VARIANTS[i].k} — {VARIANTS[i].name}
            <span className="block text-2xs font-normal opacity-60">
              {i + 1} / {VARIANTS.length}
            </span>
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            className="btn btn-icon btn-sm rounded-full text-white"
            aria-label="แบบถัดไป"
          >
            <Icon icon="chevron-right" className="text-lg" />
          </button>
        </div>
      )}
    </div>
  )
}
