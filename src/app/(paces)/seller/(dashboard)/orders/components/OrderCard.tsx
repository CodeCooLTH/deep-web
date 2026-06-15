/**
 * OrderCard — mobile order card (Shopee-IA × Paces skin, v8.3)
 *
 * v8.3 (user iteration 2026-06-15):
 *  - ไม่แสดงสถานะ (ซ้ำกับ status tab)
 *  - เบอร์โทรย้ายไปมุมขวาบน + icon โทร + tel: (กดโทรได้เลย; เบอร์จริงจาก buyerPhone)
 *  - แสดงสินค้า 1 รายการ default; >1 → "ดูเพิ่มเติม" expand ใน card (ไม่ไป detail)
 *  - สรุปยอด + action bar
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (card + border-dashed)
 *       theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx (item row)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import { useRef, useState } from 'react'
import { PAYMENT_LABELS, PAYMENT_ICONS, type OrderRow } from './data'
import OrderActions from './OrderActions'

const TYPE_LABEL: Record<string, string> = {
  PHYSICAL: 'สินค้า',
  DIGITAL: 'ดิจิทัล',
  SERVICE: 'บริการ',
}

// ISO → วันที่ไทย (client)
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

// รูปสินค้า + fallback placeholder
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
  const [expanded, setExpanded] = useState(false)

  const displayId = order.publicToken.slice(0, 8).toUpperCase()
  const isVerifiedBuyer = Boolean(order.buyerUsername)

  const itemCount = order.items.length
  const visibleItems = expanded ? order.items : order.items.slice(0, 1)

  return (
    <div className="card">
      <div className="card-body">
        {/* ── หัว 2 คอลัมน์: ซ้าย #เลข/วันที่ — ขวา ชื่อลูกค้า/เบอร์โทร(กดโทร) ── */}
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-default-300 pb-2.5">
          {/* ซ้าย */}
          <div className="shrink-0">
            <p className="font-mono text-sm font-semibold text-default-700">#{displayId}</p>
            <p className="mt-0.5 text-xs text-default-500">{formatThaiDate(order.createdAtISO)}</p>
          </div>
          {/* ขวา */}
          <div className="min-w-0 text-right">
            <p className="flex items-center justify-end gap-1 font-semibold text-default-900">
              {isVerifiedBuyer && (
                <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
              )}
              <span className="truncate">{order.buyerName ?? 'ลูกค้า'}</span>
            </p>
            {order.buyerPhone && (
              <a
                href={`tel:${order.buyerPhone}`}
                aria-label={`โทรหา ${order.buyerPhone}`}
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-success"
              >
                <Icon icon="phone" className="text-sm" />
                {order.buyerPhone}
              </a>
            )}
          </div>
        </div>

        {/* ── รายการสินค้า (1 รายการ default; กางเพิ่มเมื่อ expand) ── */}
        <div className="divide-y divide-dashed divide-default-200">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex gap-3 py-3">
              <ProductImage src={item.imageUrl ?? undefined} alt={item.name} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-default-900">{item.name}</p>
                <p className="mt-0.5 text-xs text-default-500">{TYPE_LABEL[order.orderType] ?? order.orderType}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-default-400">x{item.qty}</p>
                <p className="text-sm font-semibold tabular-nums text-default-900">
                  ฿{item.price.toLocaleString('th-TH')}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── ดูเพิ่มเติม / ย่อ — expand รายการใน card (ไม่ไป detail) ── */}
        {itemCount > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1 border-t border-dashed border-default-300 pt-2.5 text-xs font-medium text-primary"
          >
            {expanded ? 'ย่อ' : `ดูเพิ่มเติม (อีก ${itemCount - 1} รายการ)`}
            <Icon icon={expanded ? 'chevron-up' : 'chevron-down'} className="text-sm" />
          </button>
        )}

        {/* ── สรุป: วิธีชำระเงิน (ซ้าย) + ยอดรวม (ขวา) ── */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-default-300 pt-2.5 text-sm">
          {order.paymentMethod ? (
            <span className="inline-flex items-center gap-1 text-xs text-default-500">
              <Icon icon={PAYMENT_ICONS[order.paymentMethod] ?? 'wallet'} className="text-sm" />
              {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
            </span>
          ) : (
            <span />
          )}
          <span>
            <span className="text-default-500">รวม {itemCount} รายการ:</span>{' '}
            <span className="font-bold tabular-nums text-default-900">
              ฿{order.total.toLocaleString('th-TH')}
            </span>
          </span>
        </div>

        {/* ── action bar: centralized OrderActions (ชุดเดียวกับ desktop table) ── */}
        <div className="mt-3">
          <OrderActions order={order} onCancelRequest={onCancelRequest} variant="card" />
        </div>
      </div>
    </div>
  )
}
