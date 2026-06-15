/**
 * OrderCard — mobile order card (Shopee-IA × Paces skin, v8.2)
 *
 * redesign 2026-06-15: จากการ์ดอัดแน่นแบบ table → Shopee-style compact (user เคาะ mockup):
 *   หัว[ลูกค้า+tag | สถานะ] → แถวสินค้าชิ้นแรก → meta(#เลข·วันที่) → สรุปยอด → ปุ่ม
 * ใช้ Paces .card primitive + เส้นประ (border-dashed) ตาม Paces card-header.
 * copy-link ย้ายเข้า ⋮ menu (OrderCardMenu) — footer เหลือ ⋮ / ส่ง SMS / ดูรายละเอียด.
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (card primitive + dashed border)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (item row)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useRef, useState } from 'react'
import type { OrderRow } from './data'
import OrderCardMenu from './OrderCardMenu'
import SendSmsButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/SendSmsButton'

// สถานะไม่แสดงในการ์ดแล้ว (ซ้ำกับ status filter tab) — user req 2026-06-15
const TYPE_LABEL: Record<string, string> = {
  PHYSICAL: 'สินค้า',
  DIGITAL: 'ดิจิทัล',
  SERVICE: 'บริการ',
}

// แปลง ISO → วันที่ไทย (client เพื่อรองรับ locale)
function formatThaiDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return (
      d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    )
  } catch {
    return isoStr
  }
}

// --- ProductImage: รูปสินค้า + fallback placeholder (D8) ---
function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const fallbackRef = useRef(false)
  const [failed, setFailed] = useState(false)

  if (!src || failed || fallbackRef.current) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-default-200 bg-default-100 text-default-400">
        <Icon icon="package" className="text-xl" />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="size-14 shrink-0 rounded-md border border-default-200 bg-default-100 object-cover"
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
  const displayId = order.publicToken.slice(0, 8).toUpperCase()
  const customerName = order.buyerName ?? order.buyer
  const isVerifiedBuyer = Boolean(order.buyerUsername)
  const isTerminal = order.status === 'CONFIRMED' || order.status === 'CANCELLED'

  const itemCount = order.items.length
  const firstItem = order.items[0]

  return (
    <div className="card">
      <div className="card-body">
        {/* ── หัว: ลูกค้า + tag (ไม่มีสถานะแล้ว — ซ้ำกับ filter tab) เส้นประคั่นล่างแบบ Paces ── */}
        <div className="flex items-center gap-2 border-b border-dashed border-default-300 pb-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-default-100 text-default-400">
            <Icon icon="user" className="text-sm" />
          </span>
          <span className="truncate font-semibold text-default-900">{customerName}</span>
          {isVerifiedBuyer ? (
            <span className="badge bg-success/15 text-success shrink-0">
              <Icon icon="user-check" className="text-sm" />
              ลูกค้าเดิม
            </span>
          ) : (
            <span className="badge bg-default-200 text-default-600 shrink-0">ยังไม่ยืนยัน</span>
          )}
        </div>

        {/* ── แถวสินค้าชิ้นแรก ── */}
        {firstItem && (
          <div className="flex gap-3 pt-3">
            <ProductImage src={firstItem.imageUrl ?? undefined} alt={firstItem.name} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-default-900">{firstItem.name}</p>
              <p className="mt-0.5 text-xs text-default-500">
                {TYPE_LABEL[order.orderType] ?? order.orderType}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-default-400">x{firstItem.qty}</p>
              <p className="text-sm font-semibold tabular-nums text-default-900">
                ฿{firstItem.price.toLocaleString('th-TH')}
              </p>
            </div>
          </div>
        )}

        {/* + อีก N รายการ → detail */}
        {itemCount > 1 && (
          <Link
            href={`/orders/${order.publicToken}`}
            className="mt-2 block text-center text-xs font-medium text-primary hover:underline"
          >
            + ดูอีก {itemCount - 1} รายการ
          </Link>
        )}

        {/* ── meta: เบอร์ติดต่อ (เมื่อมีชื่อ) + เลขออเดอร์ + วันเวลา ── */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-default-500">
          {/* เบอร์ masked — แสดงเมื่อหัวการ์ดเป็นชื่อ (กันซ้ำกรณี guest ที่หัว = เบอร์อยู่แล้ว) */}
          {order.buyerName && (
            <>
              <span className="inline-flex items-center gap-1">
                <Icon icon="phone" className="text-sm text-default-400" />
                {order.buyer}
              </span>
              <span className="text-default-300" aria-hidden="true">·</span>
            </>
          )}
          <span className="font-mono font-semibold text-default-700">#{displayId}</span>
          <span className="text-default-300" aria-hidden="true">·</span>
          <span>{formatThaiDate(order.createdAtISO)}</span>
        </div>

        {/* ── สรุปยอด (เส้นประคั่นบน) ── */}
        <div className="mt-2.5 border-t border-dashed border-default-300 pt-2.5 text-right text-sm">
          <span className="text-default-500">รวม {itemCount} รายการ:</span>{' '}
          <span className="font-bold tabular-nums text-default-900">
            ฿{order.total.toLocaleString('th-TH')}
          </span>
        </div>

        {/* ── actions: ⋮ / ส่ง SMS / ดูรายละเอียด (ทุกปุ่ม min-h-11 = ≥44px) ── */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <OrderCardMenu
            token={order.publicToken}
            status={order.status}
            onCancelRequest={onCancelRequest}
          />
          {!isTerminal && <SendSmsButton publicToken={order.publicToken} compact />}
          <Link
            href={`/orders/${order.publicToken}`}
            className="btn btn-sm min-h-11 bg-primary text-white hover:bg-primary-hover"
          >
            <Icon icon="eye" className="text-sm" />
            ดูรายละเอียด
          </Link>
        </div>
      </div>
    </div>
  )
}
