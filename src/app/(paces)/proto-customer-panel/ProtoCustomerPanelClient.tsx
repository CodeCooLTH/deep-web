'use client'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PROTOTYPE — โค้ดทิ้ง ห้าม merge เข้า main · ห้าม import จากที่อื่น
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * คำถาม: **แผง "ข้อมูลลูกค้า" ควรจัดยังไงให้ใช้ง่ายกว่าเดิม** (user 2026-08-18)
 *
 * ทำเป็น route จริงในแอป ไม่ใช่ไฟล์ HTML — เซสชันนี้พิสูจน์แล้วว่าม็อกอัพ static เพี้ยนจาก
 * ของจริง (token อยู่ใน `@theme{}` ของ Tailwind v4 · `_forms.css`/`_buttons.css` ใช้ `@apply`
 * รวม 21 จุด · utility ทุกตัวต้อง build) ⇒ ทางเดียวที่ได้ CSS/ฟอนต์/breakpoint ชุดเดียวกับ
 * production คือรันในแอป
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ปัญหาของแบบปัจจุบัน (อ่านจากโค้ด + จอจริง ไม่ได้เดา):
 *   1. **4 แท็บ แต่ของที่ดูบ่อยที่สุดกระจายอยู่ 3 ที่** — เบอร์อยู่ใน CRM (ต้องรอ fetch) ·
 *      ยอดซื้ออยู่แถวสถิติ · ออเดอร์อยู่อีกแท็บ ⇒ ตอบคำถาม "ลูกค้าคนนี้เป็นใคร" ต้องเดิน 3 ที่
 *   2. **แผงนี้อ่านอย่างเดียว ทำอะไรต่อไม่ได้เลย** — ไม่มีปุ่มโทร/คัดลอกเบอร์/เปิดออเดอร์
 *      ผู้ขายต้องปิดแผงแล้วไปหาทางอื่นทุกครั้ง
 *   3. **"ป้ายกำกับจาก Meta" (`ad_id.…` / `messenger_ads`) กินพื้นที่กลางแผง** ทั้งที่เป็น
 *      ข้อมูลอ้างอิงที่ผู้ขายแทบไม่ได้ใช้ตัดสินใจอะไรตอนกำลังคุยกับลูกค้า
 *   4. **สถิติ 3 แถวเป็น label:value หน้าตาเหมือนกันเป๊ะ** ไม่มีลำดับชั้น กวาดตาแล้วไม่เกาะ
 *   5. **ของที่แก้ไขนาน ๆ ครั้ง (CRM) อยู่บนสุด** ส่วนของที่ดูบ่อย (ยอด/ออเดอร์) อยู่ล่างสุด
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ข้อจำกัดจริงที่ทุกแบบต้องเคารพ (เช็คกับโค้ดแล้ว ไม่ใช่สมมติ):
 *   · `customer.phoneMasked` = เบอร์ที่ระบบผูกให้ **ถูก mask ที่ server boundary เสมอ**
 *     (`page.tsx` → `maskPhone()`) ⇒ **กดโทรจากเบอร์นี้ไม่ได้** ห้ามออกแบบปุ่มโทรให้มัน
 *   · `crm.phones[]` = เบอร์ที่ **ร้านกรอกเอง** (`ExternalContact.phones`) คืนมาเต็ม
 *     ⇒ โทรได้จริง แต่มีเฉพาะเมื่อ CRM โหลดสำเร็จ (เส้นทาง fetch แยก ล้มได้)
 *   · แท็บที่ 2 ผันคำตาม `Shop.vertical` (คำสั่งซื้อ / การเข้ารับบริการ / การจอง)
 *   · CRM เป็น fetch แยกที่ล้มได้ — ทุกแบบต้องมีที่ยืนให้ error state โดยไม่ทำให้ตัวเลข
 *     ที่มาจาก server prop ดูน่าสงสัยไปด้วย
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { ChannelBadgeOverlay } from '../seller/(chat)/inbox/components/ChannelBadge'
// stepper ตัวจริงที่ใช้ในโมดัลพัสดุ/การ์ดออเดอร์/แถบปักท้าย — ห้ามวาดใหม่ (HR1)
import ShipmentStepper from '../seller/(chat)/_components/ShipmentStepper'

/* ── fixture — รูปร่างเดียวกับ CustomerPanelData ของจริง ────────────────────── */
const FX = {
  name: 'Sekson Oonnom',
  initials: 'SO',
  channel: 'FACEBOOK',
  channelName: 'ธนภัทร์ อะไหล่มอเตอร์ไซค์',
  behavior: ['ลูกค้าเก่า', '4 ออเดอร์', 'ตีกลับ 1'],
  stats: { orderCount: 4, totalSpent: '฿4,280', since: '3 เดือนที่แล้ว' },
  phoneMasked: '081-xxx-0001',
  crmPhones: ['081-234-5678'],
  tags: ['ลูกค้าประจำ', 'ชอบเก็บปลายทาง'],
  salesStatus: 'สนใจ',
  address: '99/1 ถ.สุขสวัสดิ์ แขวงบางปะกอก เขตราษฎร์บูรณะ กทม. 10140',
  note: 'ชอบให้โทรก่อนส่ง · รับของหลัง 17:00 เท่านั้น',
  metaLabels: ['ad_id.120200000000000001', 'messenger_ads'],
  /**
   * ออเดอร์ 2 ใบเพื่อให้เห็น **เงื่อนไขที่ user ขอ** ในจอเดียว:
   *   มีเลขพัสดุ → ขึ้น timeline · ยังไม่มี → ไม่ขึ้นอะไรเพิ่ม (ไม่ใช่ขึ้นแล้วว่าง)
   */
  orders: [
    {
      no: 'DP25690847A68A18',
      status: 'กำลังจัดส่ง',
      amount: '฿360',
      shipment: {
        courier: 'Flash Thunder',
        logo: '/images/logos/flash-express.jpeg',
        trackingNo: 'TH1601924VZF4J0',
        shipmentStatus: 'CREATED',
        carrierStatus: 'in_transit',
      },
    },
    { no: 'DP25690846B22C10', status: 'รอเลขพัสดุ', amount: '฿1,290', shipment: null },
  ] as const,
  fileCount: 3,
}

/* ── ชิ้นส่วนใช้ร่วม ────────────────────────────────────────────────────────── */
function Identity({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <span className="bg-default-200 text-default-800 flex size-11 items-center justify-center rounded-full text-sm font-semibold">
          {FX.initials}
        </span>
        <ChannelBadgeOverlay channel={FX.channel} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-default-900 block truncate font-semibold">{FX.name}</span>
        <span className="text-default-700 flex min-w-0 items-center gap-1 text-xs">
          <Icon icon="brand-facebook" className="shrink-0 text-sm" aria-hidden="true" />
          <span className="truncate">{FX.channelName}</span>
        </span>
      </span>
      {!compact && (
        <button type="button" className="btn btn-icon border-default-300 shrink-0" aria-label="ปิด">
          <Icon icon="x" className="text-lg" />
        </button>
      )}
    </div>
  )
}

function BehaviorChips() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FX.behavior.map((b) => (
        <span key={b} className="badge bg-primary/15 text-primary-ink text-2xs">
          {b}
        </span>
      ))}
    </div>
  )
}

/** แถวสถิติแบบเดิม — label ซ้าย value ขวา ทั้ง 3 แถวหน้าตาเหมือนกัน */
function StatRows() {
  const rows: [string, string][] = [
    ['จำนวนออเดอร์', String(FX.stats.orderCount)],
    ['รวมยอดซื้อ', FX.stats.totalSpent],
    ['เป็นลูกค้ามา', FX.stats.since],
  ]
  return (
    <dl className="mb-0">
      {rows.map(([k, v]) => (
        <div key={k} className="border-default-200 flex items-center justify-between border-b py-2.5 last:border-b-0">
          <dt className="text-default-700 mb-0 text-sm">{k}</dt>
          <dd className="text-default-900 mb-0 text-sm font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** สถิติแบบการ์ด 3 ช่อง — ตัวเลขนำ ป้ายรอง (ต่างจาก StatRows ที่ label นำ) */
function StatTiles() {
  const tiles: [string, string][] = [
    [String(FX.stats.orderCount), 'ออเดอร์'],
    [FX.stats.totalSpent, 'ยอดซื้อรวม'],
    [FX.stats.since, 'เป็นลูกค้ามา'],
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map(([v, k]) => (
        <div key={k} className="bg-default-100 rounded-lg px-2 py-2.5 text-center">
          <span className="text-default-900 block text-base font-bold">{v}</span>
          <span className="text-default-700 block text-2xs">{k}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * แถวเบอร์โทร — แยก 2 ชนิดชัดเจน เพราะทำอะไรได้ไม่เท่ากัน
 * 🛑 เบอร์ที่ระบบผูก = masked → คัดลอก/โทรไม่ได้ · เบอร์ที่ร้านกรอก = เต็ม → โทรได้
 */
function PhoneRows() {
  return (
    <div className="flex flex-col gap-2">
      {FX.crmPhones.map((p) => (
        <div key={p} className="border-default-200 flex items-center gap-2 rounded-lg border px-3 py-2">
          <Icon icon="phone" className="text-default-400 shrink-0 text-base" aria-hidden="true" />
          <span className="text-default-900 min-w-0 flex-1 truncate text-sm tabular-nums">{p}</span>
          <span className="text-default-700 text-2xs shrink-0">ร้านบันทึกเอง</span>
          <a href={`tel:${p}`} className="btn btn-icon btn-sm border-default-300 shrink-0" aria-label={`โทรหา ${p}`}>
            <Icon icon="phone-call" className="text-base" />
          </a>
        </div>
      ))}
      <div className="border-default-200 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <Icon icon="link" className="text-default-400 shrink-0 text-base" aria-hidden="true" />
        <span className="text-default-700 min-w-0 flex-1 truncate text-sm tabular-nums">{FX.phoneMasked}</span>
        {/* ไม่มีปุ่มโทร — เบอร์นี้ถูก mask ที่ server ปุ่มที่กดแล้วโทรผิดเบอร์แย่กว่าไม่มีปุ่ม */}
        <span className="text-default-700 text-2xs shrink-0">เชื่อมจากระบบ</span>
      </div>
    </div>
  )
}

function CrmFailed({ scope }: { scope: string }) {
  return (
    <div className="space-y-2 py-2 text-center" role="status">
      <p className="text-default-700 mb-0 text-sm">โหลด{scope}ไม่สำเร็จ</p>
      <p className="text-default-700 mb-0 text-xs">ตัวเลขด้านบนไม่ได้รับผลกระทบ</p>
      <button type="button" className="btn border-default-300 min-h-11">
        <Icon icon="refresh" className="me-1" /> ลองใหม่
      </button>
    </div>
  )
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: string
  action?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-default-200 border-b py-3 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <Icon icon={icon} className="text-default-400 shrink-0 text-base" aria-hidden="true" />
        <h6 className="text-default-800 mb-0 flex-1 text-xs font-semibold">{title}</h6>
        {action && (
          <button type="button" className="text-primary-ink text-xs font-medium">
            {action}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

/** กล่องยุบได้ — ใช้ใน V1 แทนแท็บ */
function Fold({
  title,
  icon,
  badge,
  defaultOpen,
  children,
}: {
  title: string
  icon: string
  badge?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="border-default-200 border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 py-2 text-start"
      >
        <Icon icon={icon} className="text-default-400 shrink-0 text-base" aria-hidden="true" />
        <span className="text-default-800 min-w-0 flex-1 text-sm font-semibold">{title}</span>
        {badge && <span className="badge bg-default-100 text-default-700 text-2xs shrink-0">{badge}</span>}
        <Icon icon={open ? 'chevron-up' : 'chevron-down'} className="text-default-400 shrink-0 text-base" />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

const TAGS = (
  <div className="flex flex-wrap gap-1.5">
    <span className="badge bg-success/15 text-success-ink text-2xs">{FX.salesStatus}</span>
    {FX.tags.map((tg) => (
      <span key={tg} className="badge bg-default-100 text-default-700 text-2xs">
        {tg}
      </span>
    ))}
  </div>
)

const META_LABELS = (
  <div className="flex flex-wrap gap-1.5">
    {FX.metaLabels.map((m) => (
      <span key={m} className="badge bg-default-100 text-default-700 text-2xs max-w-full truncate">
        {m}
      </span>
    ))}
  </div>
)

/**
 * การ์ดออเดอร์ + timeline พัสดุ (user สั่ง 2026-08-18: "อยากให้มันขึ้น Timeline ด้วย
 * ในกรณีมี Tracking แล้ว")
 *
 * 🛑 timeline โผล่ **เฉพาะเมื่อมีเลขพัสดุ** — ใบที่ยังไม่เปิดพัสดุไม่ขึ้นอะไรเพิ่มเลย
 * ไม่ใช่ขึ้นโครงเปล่า ๆ ที่ทุกจุดเป็นสีเทา (นั่นอ่านเป็น "พัสดุค้าง" ทั้งที่ยังไม่ได้สร้าง)
 *
 * 🛑 ใช้ `ShipmentStepper` ตัวจริง ไม่ได้วาดใหม่ — ตัวเดียวกับที่โมดัลพัสดุ การ์ดออเดอร์
 * และแถบปักท้ายห้องแชทใช้ ⇒ ผู้ขายเรียนรู้รูปนี้ครั้งเดียวใช้ได้ทุกที่ และแก้ที่เดียวเปลี่ยนครบ
 *
 * เลือก stepper 4 จุด **ไม่ใช่รายการเหตุการณ์เต็ม** เพราะแผงนี้เป็นพื้นผิว "สรุป" —
 * รายการเหตุการณ์ยาวไม่จำกัดและต้อง fetch เพิ่ม ทางไปดูของเต็มคือแถบพัสดุในห้องแชท/หน้าออเดอร์
 */
function OrderCard({ o }: { o: (typeof FX.orders)[number] }) {
  return (
    <div className="border-default-200 rounded-lg border">
      <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
            o.shipment ? 'bg-info/15 text-info-ink' : 'bg-primary/15 text-primary-ink'
          }`}
        >
          <Icon icon={o.shipment ? 'truck-delivery' : 'package'} className="text-lg" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-default-900 block truncate text-sm font-semibold">{o.no}</span>
          <span className="text-default-700 block truncate text-xs">
            {o.status} · {o.amount}
          </span>
        </span>
        <Icon icon="chevron-right" className="text-default-400 shrink-0 text-base" />
      </button>

      {o.shipment && (
        <div className="border-default-200 border-t px-3 pt-2.5 pb-3">
          <div className="mb-2.5 flex items-center gap-2.5">
            {/* bg-card รองโลโก้เสมอ — โลโก้ขนส่งไทยหลายเจ้าสีอ่อน (Flash เหลือง) วางบนพื้นสีแล้วจม */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={o.shipment.logo}
              alt=""
              className="bg-card ring-default-200 size-9 shrink-0 rounded object-contain p-0.5 ring-1"
            />
            <span className="min-w-0 flex-1">
              <span className="text-default-700 block truncate text-xs">{o.shipment.courier}</span>
              <span className="text-default-900 block truncate text-sm font-bold">{o.shipment.trackingNo}</span>
            </span>
            <button
              type="button"
              className="btn btn-icon btn-sm text-default-700 shrink-0"
              aria-label={`คัดลอกเลขพัสดุ ${o.shipment.trackingNo}`}
            >
              <Icon icon="copy" className="text-base" />
            </button>
          </div>
          <ShipmentStepper
            shipmentStatus={o.shipment.shipmentStatus}
            carrierStatus={o.shipment.carrierStatus}
            size="sm"
            showNotice={false}
          />
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   NOW — แบบปัจจุบัน (ตัวสอบเทียบ)
   ถ้าอันนี้ไม่เหมือนของจริง แปลว่าผมคัดโครงมาผิด ต้องแก้ก่อนจะเชื่อ V1–V3
   ══════════════════════════════════════════════════════════════════════════════ */
function PanelNOW() {
  const [tab, setTab] = useState('customer')
  const TABS = [
    { k: 'customer', l: 'ข้อมูล', i: 'user-circle' },
    { k: 'orders', l: 'คำสั่งซื้อ', i: 'shopping-cart', n: String(FX.stats.orderCount) },
    { k: 'files', l: 'ไฟล์', i: 'folder' },
    { k: 'note', l: 'โน้ต', i: 'notes' },
  ]
  return (
    <>
      <div className="border-default-200 border-b p-4">
        <Identity />
        <div className="mt-2">
          <BehaviorChips />
        </div>
      </div>
      <div className="border-default-200 flex gap-1 border-b px-2" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.k}
            type="button"
            role="tab"
            aria-selected={tab === x.k}
            onClick={() => setTab(x.k)}
            className={`flex min-h-11 items-center gap-1.5 px-2 py-2 text-sm ${tab === x.k ? 'text-primary-ink border-primary border-b-2 font-semibold' : 'text-default-700'}`}
          >
            <Icon icon={x.i} className="text-base" />
            {x.l}
            {x.n && <span className="badge bg-default-100 text-default-700 text-2xs">{x.n}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {tab === 'customer' && (
          <div className="space-y-4">
            <CrmFailed scope="แท็ก สถานะการขาย และที่อยู่" />
            <div>
              <p className="text-default-700 mb-1.5 text-xs">ป้ายกำกับจาก Meta</p>
              {META_LABELS}
            </div>
            <StatRows />
            <div>
              <p className="text-default-700 mb-1 text-xs">การเชื่อมกับลูกค้าในระบบ</p>
              <p className="text-success mb-0 flex items-center gap-1.5 text-sm">
                <Icon icon="link" className="text-base" /> เชื่อมแล้ว · {FX.phoneMasked}
              </p>
            </div>
          </div>
        )}
        {tab !== 'customer' && (
          <p className="text-default-700 py-8 text-center text-sm">(เนื้อหาแท็บ {TABS.find((x) => x.k === tab)?.l})</p>
        )}
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   V1 — ทิ้งแท็บทั้งหมด · สรุปบน · รายละเอียดยุบได้
   หลักการ: ตอบ "ลูกค้าคนนี้เป็นใคร" ให้จบใน viewport แรกโดยไม่ต้องกดอะไรเลย
   ที่เหลือเลื่อนลงเจอ ไม่ต้องเดาว่าซ่อนอยู่หลังแท็บไหน
   ══════════════════════════════════════════════════════════════════════════════ */
function PanelV1() {
  return (
    <>
      <div className="border-default-200 border-b p-4">
        <Identity />
        <div className="mt-2.5">
          <BehaviorChips />
        </div>
        <div className="mt-3">
          <StatTiles />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4">
        <Fold title="ติดต่อ" icon="phone" defaultOpen>
          <PhoneRows />
        </Fold>
        <Fold title="คำสั่งซื้อล่าสุด" icon="shopping-cart" badge={String(FX.stats.orderCount)} defaultOpen>
          <div className="flex flex-col gap-2">
            {FX.orders.map((o) => (
              <OrderCard key={o.no} o={o} />
            ))}
          </div>
          <button type="button" className="text-primary-ink mt-2 text-xs font-medium">
            ดูทั้งหมด {FX.stats.orderCount} ใบ
          </button>
        </Fold>
        <Fold title="แท็กและสถานะ" icon="tag">
          {TAGS}
        </Fold>
        <Fold title="ที่อยู่" icon="map-pin">
          <p className="text-default-800 mb-0 text-sm">{FX.address}</p>
        </Fold>
        <Fold title="โน้ตของร้าน" icon="notes">
          <p className="text-default-800 mb-0 text-sm">{FX.note}</p>
        </Fold>
        <Fold title="ไฟล์ที่ใช้ร่วมกัน" icon="folder" badge={String(FX.fileCount)}>
          <p className="text-default-700 mb-0 text-sm">(ตารางไฟล์)</p>
        </Fold>
        {/* ป้าย Meta ถูกลดชั้นลงล่างสุด — เป็นข้อมูลอ้างอิง ไม่ใช่สิ่งที่ใช้ตัดสินใจตอนคุย */}
        <Fold title="ที่มาจาก Meta" icon="tag-starred">
          {META_LABELS}
        </Fold>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   V2 — จัดตาม "งานที่ผู้ขายจะทำต่อ" ไม่ใช่ตามชนิดข้อมูล + แถบปุ่มตรึงล่าง
   หลักการ: แผงนี้ควรเป็นที่ที่ *ลงมือ* ได้ ไม่ใช่ที่อ่านอย่างเดียวแล้วต้องปิดไปทำที่อื่น
   ══════════════════════════════════════════════════════════════════════════════ */
function PanelV2() {
  return (
    <>
      <div className="border-default-200 border-b p-4">
        <Identity />
        <div className="mt-2.5">
          <BehaviorChips />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4">
        <Section title="ติดต่อ" icon="phone">
          <PhoneRows />
        </Section>
        <Section title="การซื้อขาย" icon="shopping-cart" action={`ดูทั้งหมด ${FX.stats.orderCount} ใบ`}>
          <div className="mb-2">
            <StatTiles />
          </div>
          <OrderCard o={FX.orders[0]} />
        </Section>
        <Section title="บันทึกของร้าน" icon="notes" action="แก้ไข">
          <div className="space-y-2">
            {TAGS}
            <p className="text-default-800 mb-0 text-sm">{FX.note}</p>
            <p className="text-default-700 mb-0 text-xs">{FX.address}</p>
          </div>
        </Section>
        <Section title="ไฟล์ที่ใช้ร่วมกัน" icon="folder" action={`ดูทั้ง ${FX.fileCount} ไฟล์`}>
          <p className="text-default-700 mb-0 text-sm">(ตัวอย่างไฟล์ 3 ใบ)</p>
        </Section>
        <Section title="ที่มาจาก Meta" icon="tag-starred">
          {META_LABELS}
        </Section>
      </div>
      {/* แถบปุ่มตรึงล่าง — งานที่ทำบ่อยที่สุดอยู่ในระยะนิ้วโป้งเสมอ ไม่ต้องเลื่อนหา */}
      <div className="border-default-200 bg-card flex gap-2 border-t p-3">
        <button type="button" className="btn border-default-300 min-h-11 flex-1">
          <Icon icon="notes" className="me-1" /> เพิ่มโน้ต
        </button>
        <button type="button" className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white">
          <Icon icon="plus" className="me-1" /> สร้างออเดอร์
        </button>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   V3 — ยุบ 4 แท็บเหลือ 2 (เปลี่ยนน้อยที่สุด)
   หลักการ: ทดสอบสมมติฐานว่า "ปัญหาคือแท็บเยอะเกิน" ไม่ใช่ "แท็บผิดวิธี"
   ถ้า V3 แก้ปัญหาได้พอ ๆ กับ V1/V2 ก็ควรเลือก V3 เพราะแรงน้อยกว่ามาก
   ══════════════════════════════════════════════════════════════════════════════ */
function PanelV3() {
  const [tab, setTab] = useState('who')
  return (
    <>
      <div className="border-default-200 border-b p-4">
        <Identity />
        <div className="mt-2.5">
          <BehaviorChips />
        </div>
        <div className="mt-3">
          <StatTiles />
        </div>
      </div>
      <div className="border-default-200 flex border-b" role="tablist">
        {[
          { k: 'who', l: 'ลูกค้า', i: 'user-circle' },
          { k: 'hist', l: 'ประวัติ', i: 'history', n: String(FX.stats.orderCount + FX.fileCount) },
        ].map((x) => (
          <button
            key={x.k}
            type="button"
            role="tab"
            aria-selected={tab === x.k}
            onClick={() => setTab(x.k)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 py-2 text-sm ${tab === x.k ? 'text-primary-ink border-primary border-b-2 font-semibold' : 'text-default-700'}`}
          >
            <Icon icon={x.i} className="text-base" />
            {x.l}
            {x.n && <span className="badge bg-default-100 text-default-700 text-2xs">{x.n}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4">
        {tab === 'who' ? (
          <>
            <Section title="ติดต่อ" icon="phone">
              <PhoneRows />
            </Section>
            <Section title="แท็กและสถานะ" icon="tag" action="แก้ไข">
              {TAGS}
            </Section>
            <Section title="ที่อยู่" icon="map-pin">
              <p className="text-default-800 mb-0 text-sm">{FX.address}</p>
            </Section>
            <Section title="โน้ตของร้าน" icon="notes" action="แก้ไข">
              <p className="text-default-800 mb-0 text-sm">{FX.note}</p>
            </Section>
            <Section title="ที่มาจาก Meta" icon="tag-starred">
              {META_LABELS}
            </Section>
          </>
        ) : (
          <>
            <Section title="คำสั่งซื้อ" icon="shopping-cart" action={`ดูทั้งหมด ${FX.stats.orderCount} ใบ`}>
              <OrderCard o={FX.orders[0]} />
            </Section>
            <Section title="ไฟล์ที่ใช้ร่วมกัน" icon="folder" action={`ดูทั้ง ${FX.fileCount} ไฟล์`}>
              <p className="text-default-700 mb-0 text-sm">(ตารางไฟล์)</p>
            </Section>
          </>
        )}
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   สลับแบบ — ← → · อัปเดต ?variant= · ซ่อนบน production
   ══════════════════════════════════════════════════════════════════════════════ */
const VARIANTS = [
  { k: 'V1', name: 'ทิ้งแท็บ · สรุปบน · ยุบได้', render: PanelV1 },
  { k: 'V2', name: 'จัดตามงาน + ปุ่มตรึงล่าง', render: PanelV2 },
  { k: 'V3', name: 'ยุบ 4 แท็บเหลือ 2', render: PanelV3 },
  { k: 'NOW', name: 'ของปัจจุบัน (สอบเทียบ)', render: PanelNOW },
] as const

export default function ProtoCustomerPanelClient({ initialVariant }: { initialVariant?: string }) {
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

  const Panel = VARIANTS[i].render

  return (
    <div className="bg-body-bg flex min-h-dvh flex-col">
      {/* เต็มจอเสมอ ไม่มีกรอบมือถือปลอม — เปิดบนเครื่องจริงแล้วเทียบกับแผงจริงได้ตรง ๆ */}
      <div className="bg-card relative flex h-dvh w-full flex-col overflow-hidden">
        <Panel />
      </div>

      {process.env.NODE_ENV !== 'production' && (
        <div className="bg-default-900 fixed inset-x-0 bottom-4 z-60 mx-auto flex w-fit items-center gap-1 rounded-full p-1.5 text-white shadow-lg">
          <button type="button" onClick={() => go(-1)} className="btn btn-icon btn-sm rounded-full text-white" aria-label="แบบก่อนหน้า">
            <Icon icon="chevron-left" className="text-lg" />
          </button>
          <span className="min-w-56 px-2 text-center text-sm font-semibold">
            {VARIANTS[i].k} — {VARIANTS[i].name}
            <span className="text-2xs block font-normal opacity-60">
              {i + 1} / {VARIANTS.length}
            </span>
          </span>
          <button type="button" onClick={() => go(1)} className="btn btn-icon btn-sm rounded-full text-white" aria-label="แบบถัดไป">
            <Icon icon="chevron-right" className="text-lg" />
          </button>
        </div>
      )}
    </div>
  )
}
