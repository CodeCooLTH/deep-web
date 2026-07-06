/**
 * OrderCard — mobile/tablet order card (v11 redesign 2026-07-06: อ่านง่าย + scan เร็ว)
 *
 * v11 (2026-07-06 — spec docs/superpowers/specs/2026-07-06-seller-order-card-redesign-design.*):
 *  - แถบสีซ้ายการ์ดตามสถานะ (border-s-4 border-s-{semantic}) — กวาดตาแยกออเดอร์ด้วยสี
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
import { formatRelativeDayTime } from '@/lib/format-date'
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

// ── status badge (สี Paces semantic token — ไม่ใช้ hex) ──
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning' },
  SHIPPED:   { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info'       },
  CONFIRMED: { label: 'สำเร็จ',       cls: 'bg-success/15 text-success'  },
  CANCELLED: { label: 'ยกเลิก',       cls: 'bg-default-100 text-default-500' },
}

// ── แถบสีซ้ายการ์ดตามสถานะ — pattern เดียวกับ theme "card border-{color} border-s-3"
//    (.card ไม่มี border เอง มีแต่ shadow → border-{color} ให้สี, border-s-4 ให้เฉพาะซ้ายกว้าง 4px)
//    Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (`card border-primary border-s-3`)
const STATUS_STRIP: Record<string, string> = {
  PENDING:   'border-warning',
  SHIPPED:   'border-info',
  CONFIRMED: 'border-success',
  CANCELLED: 'border-default-300',
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
}

export default function OrderCard({ order, onCancelRequest }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false)

  // ใช้ 8 ตัวแรกของ publicToken เป็น display ID (เดิม)
  const displayId = order.publicToken.slice(0, 8).toUpperCase()
  const isVerifiedBuyer = Boolean(order.buyerUsername)

  const itemCount = order.items.length
  const visibleItems = expanded ? order.items : order.items.slice(0, 1)

  const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status, cls: 'bg-default-100 text-default-500' }
  const strip = STATUS_STRIP[order.status] ?? 'border-default-300'
  const hasChannel = Boolean(order.salesChannel && SALES_CHANNEL_LABELS[order.salesChannel])
  const hasPayment = Boolean(order.paymentMethod)

  return (
    <div className={`card border-s-4 ${strip}`}>
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
            {/* HR7: text-[11px] — #ID เป็น metadata เล็ก; Paces ไม่มี token ขนาดนี้ (text-xs=12px) */}
            <span className="text-[11px] font-semibold text-default-500">#{displayId}</span>
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
                  {/* HR7: text-[11px] — qty label ขนาด mockup; Paces ไม่มี token */}
                  <p className="text-[11px] text-default-400">x{item.qty}</p>
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
              className="mt-1 flex w-full items-center justify-center gap-1 border-t border-dashed border-default-300 pt-2 text-xs font-medium text-primary"
            >
              {expanded ? 'ย่อ' : `ดูเพิ่มเติม (อีก ${itemCount - 1} รายการ)`}
              <Icon
                icon={expanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                className="text-sm"
              />
            </button>
          )}
        </div>

        {/* ── footer: ฿ยอดรวม + เวลาย่อ (ซ้าย) + OrderActions icon-only (ขวา) ── */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-default-200 pt-2.5">
          <div className="min-w-0">
            {/* HR7: text-[15px] — mockup .ord-total; Paces text-base=16px ใหญ่ไป, text-sm=14px เล็กไป */}
            <span className="text-[15px] font-bold tabular-nums text-default-900">
              ฿{order.total.toLocaleString('th-TH')}
            </span>
            {/* HR7: text-[11px] — timestamp ย่อ relative ("วันนี้ 16:07") */}
            <p className="mt-0.5 text-[11px] text-default-400">{formatRelativeDayTime(order.createdAtISO)}</p>
          </div>

          {/* ขวา: OrderActions icon-only [SMS][QR][copy][⋮] */}
          <div className="shrink-0">
            <OrderActions order={order} onCancelRequest={onCancelRequest} variant="card" />
          </div>
        </div>

      </div>
    </div>
  )
}
