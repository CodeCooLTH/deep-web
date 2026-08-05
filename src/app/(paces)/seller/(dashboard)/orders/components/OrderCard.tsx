/**
 * OrderCard — mobile/tablet order card (v11 redesign 2026-07-06: อ่านง่าย + scan เร็ว)
 *
 * v11 (2026-07-06 — spec docs/superpowers/specs/2026-07-06-seller-order-card-redesign-design.*):
 *  - แถบสีซ้ายการ์ดตามสถานะ (border-s-3 border-{semantic}) — กวาดตาแยกออเดอร์ด้วยสี
 *  - หัว: ซ้าย = อวตาร(size-9)+ชื่อลูกค้า(หนา)+verified · ขวา(stack) = #ID(เทาเล็ก) เหนือ status badge
 *  - meta ใต้ชื่อ = โลโก้ช่องทางสีจริง(FB/LINE self-host)+ชื่อ · icon+ป้ายวิธีชำระ (แทนเบอร์โทร — เบอร์อยู่หน้า detail)
 *  - item row: ตัด label ประเภท "สินค้า" ออก (expand หลายรายการคงเดิม)
 *  - footer: ฿ยอดรวม(หนา) + เวลาย่อ relative ("วันนี้ 16:07") · ปุ่ม action ย้ายไป icon-only ใน OrderActions
 *  - payment ย้ายจาก footer → meta row; badge ใช้ .badge rounded-full (ลด arbitrary)
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (card + border-dashed + left accent)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (CardColoredBorder — border-s accent)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (item row)
 */

'use client'

import { Icon } from '@iconify/react'
import Link from 'next/link'
import { formatRelativeDayTime } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import type { OrderVocab } from '@/lib/seller-menu'
import { useRef, useState } from 'react'
import {
  PAYMENT_ICONS,
  PAYMENT_LABELS,
  SALES_CHANNEL_ICONS,
  SALES_CHANNEL_LABELS,
  type OrderRow,
} from './data'
import BuyerAvatar from './BuyerAvatar'
import OrderActions from './OrderActions'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { ORDER_STATUS_META } from '@/lib/order-display'

// ── status badge — อ่านจาก SSOT ตัวเดียวกับตารางเดสก์ท็อปและหน้ารายละเอียด (lib/order-display.ts)
//    เดิมประกาศเองที่นี่ ทำให้ CANCELLED เป็นเทา (bg-default-100) ขณะที่ตารางเป็นแดง ทั้งที่
//    DESIGN.md กำหนด Error Coral ให้ "ยกเลิก" ตรงตัว — และได้ text-{semantic}-ink ที่ผ่าน AA มาด้วย
const STATUS_CONFIG = ORDER_STATUS_META

// ── แถบสีซ้ายการ์ดตามสถานะ — pattern เดียวกับ theme "card border-{color} border-s-3"
//    (.card ไม่มี border เอง มีแต่ shadow → border-{color} ให้สี, border-s-3 ให้เฉพาะซ้ายกว้าง 3px)
//    Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (`card border-primary border-s-3`)
//    สีต้องตรงกับ tone ของ badge ในการ์ดใบเดียวกันเสมอ (SSOT = ORDER_STATUS_META[...].tone)
const STATUS_STRIP: Record<string, string> = {
  PENDING:   'border-warning',
  SHIPPED:   'border-info',
  CONFIRMED: 'border-success',
  CANCELLED: 'border-danger',
}

// ── โลโก้ช่องทางสีจริง (self-host public/) — เฉพาะช่องทางที่มีไฟล์; ที่เหลือ fallback tabler mono ──
const CHANNEL_LOGO: Record<string, string> = {
  FACEBOOK: '/images/logos/facebook.svg',
  LINE:     '/images/logos/line.svg',
  // INSTAGRAM: '/images/logos/instagram.svg', // asset พร้อมถ้าเพิ่ม IG เป็นช่องทางภายหลัง (ยังไม่มีใน enum)
}

// ช่องทางการขาย: โลโก้สีจริง(ถ้ามี) fallback → tabler mono icon (STOREFRONT/TIKTOK/OTHER)
function ChannelBadge({ channel }: { channel: string }) {
  const [failed, setFailed] = useState(false)
  const label = SALES_CHANNEL_LABELS[channel] ?? channel
  const logo = CHANNEL_LOGO[channel]
  if (logo && !failed) {
    return (
      <span className="inline-flex items-center gap-1 text-default-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          className="size-3.5 rounded-sm"
          onError={() => setFailed(true)}
        />
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-default-700">
      <Icon icon={`tabler:${SALES_CHANNEL_ICONS[channel] ?? 'world'}`} className="size-3.5 text-default-400" />
      {label}
    </span>
  )
}

// รูปสินค้า + fallback placeholder
function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const fallbackRef = useRef(false)
  const [failed, setFailed] = useState(false)
  if (!src || failed || fallbackRef.current) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-default-200 bg-default-100 text-default-400">
        <Icon icon="solar:box-bold-duotone" className="text-lg" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="size-10 shrink-0 rounded-lg border border-default-200 bg-default-100 object-cover"
      onError={() => {
        fallbackRef.current = true
        setFailed(true)
      }}
    />
  )
}

interface OrderCardProps {
  order: OrderRow
  onCancelRequest: (token: string) => void
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — ส่งต่อมาจาก OrdersList */
  vocab: OrderVocab
}

export default function OrderCard({ order, onCancelRequest, vocab }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false)

  // เลขคำสั่งซื้อ DP… (user 2026-07-25) — derive จาก publicToken+createdAt (ตรงกับ orderNo ใน DB)
  const displayId = formatOrderNo(order.publicToken, order.createdAtISO)
  const isVerifiedBuyer = Boolean(order.buyerUsername)

  const itemCount = order.items.length
  const visibleItems = expanded ? order.items : order.items.slice(0, 1)

  const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status, cls: 'bg-default-100 text-default-500' }
  const strip = STATUS_STRIP[order.status] ?? 'border-default-300'
  const hasChannel = Boolean(order.salesChannel && SALES_CHANNEL_LABELS[order.salesChannel])
  // null = ยังไม่มีไฟล์โลโก้ของขนส่งเจ้านี้ → ตกไปใช้ตัวย่อ (ดู lib/iship/courier.ts)
  const courierLogo = courierLogoUrl(order.shipment?.courierCode, order.shipment?.courierName)
  const hasPayment = Boolean(order.paymentMethod)

  return (
    <div className={`card border-s-3 ${strip}`}>
      {/* ── กดที่การ์ด = เปิดหน้ารายละเอียด (user สั่ง 2026-08-04) ──────────────────
          ใช้ "stretched link" คือ <a> โปร่งใสทับทั้งการ์ด ไม่ใช่ห่อทั้งการ์ดด้วย <a>
          เพราะในการ์ดมีปุ่มจริงอยู่ (ดูเพิ่มเติม / SMS / QR / คัดลอก / ⋮) ซึ่ง HTML ห้ามซ้อนใน <a>
          และไม่ใช้ onClick+router.push เพราะจะเสีย href จริง — กดค้างเพื่อเปิดแท็บใหม่/คัดลอกลิงก์
          และการโฟกัสด้วยคีย์บอร์ดจะหายไปทั้งหมด
          .card มี position:relative อยู่แล้ว (assets/css/custom/_card.css) จึงไม่ต้องเติม
          ปุ่มที่ต้องกดได้ต้องถูกยกขึ้นเหนือแผ่นนี้ด้วย relative z-10 (ดูจุดที่กำกับไว้ข้างล่าง) */}
      <Link
        href={`/orders/${order.publicToken}`}
        aria-label={`ดูรายละเอียด${vocab.noun} ${displayId}`}
        className="absolute inset-0 rounded transition-colors active:bg-default-500/10"
      />

      <div className="card-body !py-3 !px-4">

        {/* ── หัว: ซ้าย = อวตาร+ชื่อ(+meta) · ขวา = #ID + status badge (stack) ── */}
        <div className="flex items-start justify-between gap-3">
          {/* ซ้าย */}
          <div className="flex min-w-0 items-center gap-2.5">
            <BuyerAvatar src={order.buyerAvatar} name={order.buyerName ?? 'ลูกค้า'} className="size-9" />
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1 text-sm font-bold text-default-900">
                {isVerifiedBuyer && (
                  <Icon icon="solar:verified-check-bold-duotone" className="shrink-0 text-base text-primary" />
                )}
                <span className="truncate">{order.buyerName ?? 'ลูกค้า'}</span>
              </p>
              {/* meta: ช่องทาง(โลโก้สี) · วิธีชำระ — แทนเบอร์โทรเดิม */}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-default-500">
                {hasChannel && <ChannelBadge channel={order.salesChannel as string} />}
                {hasChannel && hasPayment && <span className="text-default-300">·</span>}
                {hasPayment && (
                  <span className="inline-flex items-center gap-1">
                    <Icon icon={`tabler:${PAYMENT_ICONS[order.paymentMethod as string] ?? 'wallet'}`} className="size-3.5 text-default-400" />
                    {PAYMENT_LABELS[order.paymentMethod as string] ?? order.paymentMethod}
                  </span>
                )}
                {order.isFromAuction && (
                  <>
                    {(hasChannel || hasPayment) && <span className="text-default-300">·</span>}
                    <span className="badge bg-warning/15 text-warning inline-flex items-center gap-0.5" title="จากการประมูล">
                      <Icon icon="tabler:gavel" className="size-3" />
                      ประมูล
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ขวา: #ID เทาเล็ก เหนือ status badge */}
          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* ห้าม font-mono: Anuphan ไม่มี glyph mono → fallback Courier ผิดธีม (HR feedback) */}
            <span className="text-2xs font-semibold text-default-500">{displayId}</span>
            <span className={`badge rounded-full ${statusCfg.cls}`}>{statusCfg.label}</span>
          </div>
        </div>

        {/* ── item: thumb + ชื่อ + qty/ราคา, dashed divider — expand เดิมยังอยู่ ── */}
        <div className="mt-2.5 border-t border-dashed border-default-200 pt-2.5">
          <div className="divide-y divide-dashed divide-default-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 py-2 first:pt-0">
                <ProductImage src={item.imageUrl ?? undefined} alt={item.name} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium text-default-900">{item.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xs text-default-400">x{item.qty}</p>
                  <p className="text-xs font-semibold tabular-nums text-default-900">
                    ฿{item.price.toLocaleString('th-TH')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── ดูเพิ่มเติม / ย่อ — expand รายการใน card (ไม่ไป detail) — คงเดิม ── */}
          {itemCount > 1 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              /* relative z-10: ต้องอยู่เหนือแผ่นลิงก์ที่ทับการ์ด ไม่งั้นกด "ดูเพิ่มเติม" แล้วเด้งไปหน้า detail */
              className="relative z-10 mt-1 flex w-full items-center justify-center gap-1 border-t border-dashed border-default-300 pt-2 text-xs font-medium text-primary"
            >
              {expanded ? 'ย่อ' : `ดูเพิ่มเติม (อีก ${itemCount - 1} รายการ)`}
              <Icon
                icon={expanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                className="text-sm"
              />
            </button>
          )}
        </div>

        {/* ── พัสดุ: โลโก้แพลตฟอร์ม + ขนส่ง + เลขพัสดุ (user สั่ง 2026-08-04) ─────────────
            "กดจากไทล์สถานะเข้ามาแล้วต้องเห็นเลขพัสดุชัดเจน ว่าจากขนส่งไหน และเปิดผ่านแพลตฟอร์มไหน"
            ขึ้นเฉพาะออเดอร์ที่มีพัสดุจริง — ใบที่ยังไม่มีเลขไม่ต้องมีบรรทัดว่าง ๆ ให้ตากลับไปอ่านซ้ำ
            tabular-nums: เลขพัสดุคือของที่คนเอาไปเทียบทีละหลัก ต้องเรียงคอลัมน์ตรงกัน */}
        {order.shipment?.trackingNo && (
          <div className="mt-2.5 flex items-center gap-2 border-t border-dashed border-default-200 pt-2.5">
            {/* แพลตฟอร์มที่เปิดพัสดุ — ตอนนี้มี iShip เจ้าเดียว แต่เช็ค provider ไว้ ไม่ hardcode */}
            {/* MANUAL = ร้านส่งเองแล้วมากรอกเลข ไม่ได้เปิดผ่านแพลตฟอร์มไหน จึงไม่มีไอคอนแพลตฟอร์ม */}
            {order.shipment.provider === 'ISHIP' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/images/logos/iship.jpeg"
                alt="iShip"
                title="เปิดพัสดุผ่าน iShip"
                className="ring-default-200 size-5 shrink-0 rounded object-contain ring-1"
              />
            )}

            {/* ขนส่ง — ตัวย่อบนพื้นกลาง ๆ ระหว่างรอไฟล์โลโก้จริง (user: "ถ้าไม่มีให้ใส่ตัวย่อไปก่อน")
                ไม่ใส่สีแบรนด์เพราะต้องเดาเอง ซึ่งชนกฎห้าม hardcode สีนอก token — วันที่ได้โลโก้มา
                เติมใน COURIER_LOGO (lib/iship/courier.ts) ที่เดียว บรรทัดนี้ไม่ต้องแก้ */}
            {courierLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={courierLogo}
                alt={order.shipment.courierName ?? ''}
                /* object-contain ไม่ใช่ cover: โลโก้ที่ได้มาส่วนใหญ่เป็นจัตุรัสซึ่ง contain ก็เต็มกรอบ
                   เท่ากัน แต่ Fuze Post เป็น 600x300 (2:1) — cover จะครอปซ้าย-ขวาทิ้งจนเหลือแต่
                   ตัวอักษรกลางคำ อ่านไม่ออก. contain ยอมให้เหลือที่ว่างบน-ล่างแทน ซึ่งอ่านออก
                   ring-1: โลโก้พื้นขาว (ไปรษณีย์ไทย, Best) จะกลืนไปกับการ์ดขาวจนไม่เห็นขอบ */
                className="ring-default-200 size-5 shrink-0 rounded object-contain ring-1"
              />
            ) : (
              <span
                className="bg-default-100 text-default-700 flex size-5 shrink-0 items-center justify-center rounded text-2xs font-bold"
                title={order.shipment.courierName ?? order.shipment.courierCode ?? 'ขนส่ง'}
              >
                {courierInitials(order.shipment.courierName, order.shipment.courierCode)}
              </span>
            )}

            <span className="truncate text-xs text-default-700">
              {order.shipment.courierName ?? order.shipment.courierCode ?? 'ขนส่ง'}
            </span>
            <span className="ms-auto truncate text-xs font-semibold tabular-nums text-default-900">
              {order.shipment.trackingNo}
            </span>
          </div>
        )}

        {/* ── footer: ฿ยอดรวม + เวลาย่อ (ซ้าย) + OrderActions icon-only (ขวา) ── */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-default-200 pt-2.5">
          <div className="min-w-0">
            <span className="text-base font-bold tabular-nums text-default-900">
              ฿{order.total.toLocaleString('th-TH')}
            </span>
            <p className="mt-0.5 text-2xs text-default-400">{formatRelativeDayTime(order.createdAtISO)}</p>
          </div>

          {/* ขวา: OrderActions icon-only [SMS][QR][copy][⋮]
              relative z-10: ยกทั้งกลุ่มขึ้นเหนือแผ่นลิงก์ — .btn ของ Paces มี z-index:10 ในตัวอยู่แล้ว
              แต่เมนู ⋮ กางออกมาเป็น panel ที่ไม่ใช่ .btn จึงต้องยกที่ระดับกลุ่ม ไม่ใช่รายปุ่ม */}
          <div className="relative z-10 shrink-0">
            <OrderActions order={order} onCancelRequest={onCancelRequest} variant="card" orderNoun={vocab.noun} />
          </div>
        </div>

      </div>
    </div>
  )
}
