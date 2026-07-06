/**
 * OrderCard — mobile order card (v10 redesign: mockup .ord layout × Paces skin)
 *
 * v10 (2026-06-21):
 *  - .ord-top: #id (ซ้าย) + status badge (ขวา) — แถวเดียวกัน
 *  - .ord-cust: solar:user-linear + ชื่อลูกค้า + เบอร์โทร tel-link (แถวเดียว, คง PII mask เดิม)
 *  - .ord-items: thumb + ชื่อ + qty (expandable เดิมยังอยู่); dashed divider ใต้ row
 *  - .ord-foot: ยอดรวม + วันที่ (ซ้าย) + OrderActions (ขวา)
 *  - icon ทั้งหมดเปลี่ยนเป็น Solar Duotone/Linear ผ่าน @iconify/react (ไม่ใช้ wrappers/Icon แล้ว)
 *  - ลบ font-mono บนเลขออเดอร์ (HR: Anuphan ไม่มี mono → fallback Courier; ใช้ text-sm font-bold แทน)
 *
 * v8.3 (2026-06-15):
 *  - ไม่แสดงสถานะ (ซ้ำกับ status tab) → v10 เพิ่มกลับเป็น badge
 *  - เบอร์โทรมุมขวาบน → v10 ย้ายมา inline ใน customer row
 *  - แสดงสินค้า 1 รายการ default; >1 → expand ในการ์ด (คงเดิม)
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (card + border-dashed)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (item row)
 */

'use client'

import { Icon } from '@iconify/react'
import { formatDateTime } from '@/lib/format-date'
import { useRef, useState } from 'react'
import { PAYMENT_LABELS, SALES_CHANNEL_ICONS, type OrderRow } from './data'
import BuyerAvatar from './BuyerAvatar'
import OrderActions from './OrderActions'

// ── status badge config ตาม mockup v10 (สี Paces semantic token — ไม่ใช้ hex) ──
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning' },
  SHIPPED:   { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info'       },
  CONFIRMED: { label: 'สำเร็จ',       cls: 'bg-success/15 text-success'  },
  CANCELLED: { label: 'ยกเลิก',       cls: 'bg-default-100 text-default-500' },
}

const TYPE_LABEL: Record<string, string> = {
  PHYSICAL: 'สินค้า',
  DIGITAL: 'ดิจิทัล',
  SERVICE: 'บริการ',
}

// PAYMENT_ICONS keys เป็น tabler names เดิม — map เป็น Solar เพื่อ consistency ใน card นี้
// (ไม่แตะ data.ts เพื่อ least invasive; แค่ remap ใน component เท่านั้น)
const SOLAR_PAYMENT_ICONS: Record<string, string> = {
  CASH:      'solar:banknote-bold-duotone',
  TRANSFER:  'solar:bank-bold-duotone',
  PROMPTPAY: 'solar:qr-code-bold-duotone',
  CARD:      'solar:card-bold-duotone',
  COD:       'solar:delivery-bold-duotone',
  OTHER:     'solar:wallet-bold-duotone',
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

  return (
    <div className="card">
      <div className="card-body !py-3 !px-4">

        {/* ── .ord-top: #id (ซ้าย) + status badge (ขวา) — ตาม mockup v10 ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* ห้าม font-mono: Anuphan ไม่มี glyph mono → fallback Courier ผิดธีม (HR feedback) */}
            <span className="text-sm font-bold text-default-900">#{displayId}</span>
            {order.isFromAuction && (
              <span className="badge bg-warning/15 text-warning inline-flex items-center gap-0.5" title="จากการประมูล">
                <Icon icon="tabler:gavel" className="size-3" />
                ประมูล
              </span>
            )}
          </div>
          {/* HR7: text-[11px] — mockup .ord-badge font-size:11px; Paces ไม่มี token ขนาดนี้ (text-xs=12px) */}
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* ── .ord-cust: user icon + ชื่อ + เบอร์โทร inline — คง PII mask เดิม ── */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-default-500">
          <BuyerAvatar src={order.buyerAvatar} name={order.buyerName ?? 'ลูกค้า'} className="size-5" />
          <span className="font-medium text-default-700">
            {isVerifiedBuyer && (
              <Icon icon="solar:verified-check-bold-duotone" className="mr-0.5 inline text-sm text-primary" />
            )}
            {order.buyerName ?? 'ลูกค้า'}
          </span>
          {order.salesChannel && SALES_CHANNEL_ICONS[order.salesChannel] && (
            <Icon icon={`tabler:${SALES_CHANNEL_ICONS[order.salesChannel]}`} className="shrink-0 text-sm text-default-400" />
          )}
          {order.buyerPhone && (
            <>
              <span className="text-default-300">·</span>
              <a
                href={`tel:${order.buyerPhone}`}
                aria-label={`โทรหา ${order.buyerPhone}`}
                className="inline-flex items-center gap-0.5 font-medium text-success"
              >
                <Icon icon="solar:phone-bold-duotone" className="text-sm" />
                {order.buyerPhone}
              </a>
            </>
          )}
        </div>

        {/* ── .ord-items: thumb + ชื่อ + qty/ราคา, dashed divider — expand เดิมยังอยู่ ── */}
        <div className="mt-2.5 border-t border-dashed border-default-200 pt-2.5">
          <div className="divide-y divide-dashed divide-default-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 py-2 first:pt-0">
                <ProductImage src={item.imageUrl ?? undefined} alt={item.name} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium text-default-900">{item.name}</p>
                  {/* HR7: text-[11px] — subtext ขนาดเล็กพิเศษ ตาม mockup; Paces ไม่มี token */}
                  <p className="mt-0.5 text-[11px] text-default-400">{TYPE_LABEL[order.orderType] ?? order.orderType}</p>
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

        {/* ── .ord-foot: payment + ยอดรวม/วันที่ (ซ้าย) + OrderActions (ขวา) ── */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-default-200 pt-2.5">
          {/* ซ้าย: ยอดรวม + วันที่ */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {/* HR7: text-[15px] — mockup .ord-total font-size:15px; Paces text-base=16px ใหญ่ไป, text-sm=14px เล็กไป */}
              <span className="text-[15px] font-bold tabular-nums text-default-900">
                ฿{order.total.toLocaleString('th-TH')}
              </span>
              {order.paymentMethod && (
                /* HR7: text-[11px] — label วิธีชำระ ขนาด mockup */
                <span className="inline-flex items-center gap-0.5 text-[11px] text-default-400">
                  <Icon
                    icon={SOLAR_PAYMENT_ICONS[order.paymentMethod] ?? 'solar:wallet-bold-duotone'}
                    className="text-xs"
                  />
                  {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
                </span>
              )}
            </div>
            {/* HR7: text-[11px] — timestamp ขนาดเล็ก ตาม mockup .ord-total span */}
            <p className="mt-0.5 text-[11px] text-default-400">{formatDateTime(order.createdAtISO)}</p>
          </div>

          {/* ขวา: OrderActions เดิม — ไม่แตะ logic/props */}
          <div className="shrink-0">
            <OrderActions order={order} onCancelRequest={onCancelRequest} variant="card" />
          </div>
        </div>

      </div>
    </div>
  )
}
