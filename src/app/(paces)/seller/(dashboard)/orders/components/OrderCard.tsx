/**
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (card primitive — border, card-body, card-footer)
 *       theme/paces/Admin/TS/src/assets/css/custom/_badge.css (badge primitive)
 *       item-row layout ref: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * SafePay domain component — ไม่มี theme card-per-order equivalent; สร้างจาก primitive CSS + item-row pattern.
 * avatar: placeholder เสมอ (D8) เพราะ service ไม่ select avatar field (ข้อมูล + T3 spec)
 * discount/VAT: ไม่มีใน OrderRow schema → ไม่ render (breakdown แสดงเฉพาะบรรทัดมีค่าตาม D5)
 * resolveBuyerBaseUrl: ย้ายไป @/lib/buyer-url (canonical single source — F1)
 * CopyLinkButton: reuse จาก orders/[token]/components/CopyLinkButton (generalized, props value/label/iconOnly/className)
 */

'use client'

import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import SendSmsButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/SendSmsButton'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { OrderRow, OrderStatus } from './data'
import OrderCardMenu from './OrderCardMenu'

// --- Status map (ตาม list.html STAT object) ---
const STAT: Record<
  OrderStatus,
  { label: string; badge: string; accent: string; icon: string }
> = {
  PENDING: {
    label: 'รอดำเนินการ',
    badge: 'bg-warning/15 text-warning',
    accent: 'border-l-warning',
    icon: 'clock',
  },
  SHIPPED: {
    label: 'จัดส่งแล้ว',
    badge: 'bg-primary/15 text-primary',
    accent: 'border-l-primary',
    icon: 'truck-delivery',
  },
  CONFIRMED: {
    label: 'สำเร็จ',
    badge: 'bg-success/15 text-success',
    accent: 'border-l-success',
    icon: 'circle-check',
  },
  CANCELLED: {
    label: 'ยกเลิก',
    badge: 'bg-danger/15 text-danger',
    accent: 'border-l-danger',
    icon: 'circle-x',
  },
}

// --- Order type label ---
const TYPE_LABEL: Record<string, string> = {
  PHYSICAL: 'สินค้า',
  DIGITAL: 'ดิจิทัล',
  SERVICE: 'บริการ',
}

// แปลง ISO string เป็นวันที่ไทย (ทำใน client เพื่อรองรับ locale)
function formatThaiDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoStr
  }
}

// --- CopyButton: คัดลอก text + ไอคอนเด้งเป็น check 1.2 วิ (D7) ---
function CopyButton({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // fallback สำหรับ HTTP context
      const el = document.createElement('textarea')
      el.value = value
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      title={`คัดลอก${label}`}
      onClick={handleCopy}
      className={`shrink-0 text-default-400 transition hover:text-primary ${className ?? ''}`}
    >
      <Icon icon={copied ? 'check' : 'copy'} className={`text-sm ${copied ? 'text-success' : ''}`} />
    </button>
  )
}

// OrderCardCopyLink: resolve buyer URL runtime แล้วส่งให้ CopyLinkButton (generalized จาก orders/[token])
// แยก component นี้ไว้เพราะต้องใช้ useEffect (ไม่สามารถ resolve URL ใน render ครั้งแรก — hydration mismatch)
function OrderCardCopyLink({ token }: { token: string }) {
  const [url, setUrl] = useState(`/o/${token}`)

  useEffect(() => {
    setUrl(`${resolveBuyerBaseUrl()}/o/${token}`)
  }, [token])

  // min-h-11 = touch target ≥44px (impeccable product rule M3-#1)
  return (
    <CopyLinkButton
      value={url}
      label="คัดลอกลิงก์"
      className="min-h-11 border-default-300 text-default-700 hover:bg-default-100"
    />
  )
}

// --- ProductImage: รูปสินค้า + fallback placeholder (D8) ---
function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const fallbackRef = useRef(false)
  const [failed, setFailed] = useState(false)

  if (!src || failed || fallbackRef.current) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-default-200 bg-default-100 text-default-400">
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
      className="h-14 w-14 shrink-0 rounded-md border border-default-200 object-cover bg-default-100"
      onError={() => {
        fallbackRef.current = true
        setFailed(true)
      }}
    />
  )
}

// --- OrderCard props ---
interface OrderCardProps {
  order: OrderRow
  onCancelRequest: (token: string) => void
}

export default function OrderCard({ order, onCancelRequest }: OrderCardProps) {
  const stat = STAT[order.status]

  // displayId: publicToken 8 ตัวแรก (D9)
  const displayId = order.publicToken.slice(0, 8).toUpperCase()

  // ชื่อลูกค้า: buyerName (ถ้ามี) หรือ masked contact
  const customerName = order.buyerName ?? order.buyer

  // tag ลูกค้าเดิม / ยังไม่ยืนยัน (D5): buyerUsername บ่งบอก registered user
  const isVerifiedBuyer = Boolean(order.buyerUsername)

  // รายการสินค้า: OrderRow ไม่มี items array (schema ไม่มี) → แสดง summary รวม + total เท่านั้น
  // Spec T3 บอกรับ items จาก OrderRow แต่ type ปัจจุบันไม่มี field items
  // → render breakdown ด้วย total field ที่มีเท่านั้น (deviation บันทึกใน comment ด้านล่าง)

  return (
    <div
      className="rounded-lg border border-default-300 bg-card transition hover:shadow-lg"
    >
      {/* ╔ HEADER: stacked 3 บรรทัด — อ่านครบบน 360px ไม่ต้องเลื่อนข้าง ╗ */}
      {/*
       * เปลี่ยนจาก overflow-x-auto whitespace-nowrap (M3-#1 audit) เป็น stack:
       *   แถว 1: ชื่อ + badge สถานะ + buyer tag  (flex justify-between)
       *   แถว 2: เบอร์ + copy + เลขออเดอร์ + copy  (flex-wrap gap-x-2)
       *   แถว 3: วันที่ + ประเภท  (flex-wrap gap-x-2)
       * ลบ border-l-4 side-stripe ออก — ขัด impeccable product rule
       * avatar ยังคงไว้ที่แถว 1 ชิดซ้าย (visual anchor)
       */}
      <div className="group flex gap-2.5 border-b border-default-300 px-3 py-2.5">
        {/* Avatar placeholder (D8) — avatar ไม่มีใน data */}
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-default-100 text-default-400 ring-1 ring-default-200">
          <Icon icon="user" className="text-base" />
        </span>

        {/* block ข้อมูล — stack 3 แถว ไม่ overflow แนวนอน */}
        <div className="min-w-0 flex-1 space-y-1 text-xs text-default-600">

          {/* แถว 1: ชื่อ + buyer tag ชิดซ้าย | status badge ชิดขวา */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[13px] font-semibold text-dark">{customerName}</span>

              {/* tag ลูกค้าเดิม / ยังไม่ยืนยัน (D5) */}
              {isVerifiedBuyer ? (
                <span className="badge bg-success/15 text-success shrink-0">
                  <Icon icon="user-check" className="text-[0.9em]" />
                  ลูกค้าเดิม
                  {order.buyerUsername && (
                    <span className="text-[0.85em] opacity-70">@{order.buyerUsername}</span>
                  )}
                </span>
              ) : (
                <span className="badge bg-default-200 text-default-600 shrink-0">ยังไม่ยืนยัน</span>
              )}
            </div>

            {/* Status badge — shrink-0 ชิดขวา */}
            <span className={`badge ${stat.badge} shrink-0 gap-1`}>
              <Icon icon={stat.icon} className="text-[0.95em]" />
              {stat.label}
            </span>
          </div>

          {/* แถว 2: เบอร์ผู้ติดต่อ + copy + เลขออเดอร์ + copy */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Icon icon="phone" className="shrink-0 text-sm text-default-400" />
              {order.buyer}
            </span>
            <CopyButton
              value={order.buyer}
              label="ผู้ติดต่อ"
              className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-100"
            />

            <span className="text-default-300" aria-hidden="true">·</span>

            <span className="inline-flex items-center gap-1">
              <Icon icon="hash" className="shrink-0 text-sm text-default-400" />
              <span className="font-mono font-semibold text-default-800">{displayId}</span>
            </span>
            <CopyButton
              value={displayId}
              label="เลขออเดอร์"
              className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-100"
            />
          </div>

          {/* แถว 3: วันเวลา + ประเภทออเดอร์ */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-default-500">
            <span className="inline-flex items-center gap-1.5">
              <Icon icon="calendar-event" className="shrink-0 text-sm text-default-400" />
              {formatThaiDate(order.createdAtISO)}
            </span>

            <span className="text-default-300" aria-hidden="true">·</span>

            <span className="inline-flex items-center gap-1.5">
              <Icon icon="tag" className="shrink-0 text-sm text-default-400" />
              {TYPE_LABEL[order.orderType] ?? order.orderType}
            </span>
          </div>

        </div>
      </div>

      {/* ╔ ITEMS: แสดงสินค้า 2 รายการแรก + "+ ดูอีก N รายการ" ถ้ามีมากกว่า ╗ */}
      <div className="divide-y divide-default-200 px-3 py-1">
        {/* รายการสินค้า: แสดงสูงสุด 2 รายการ (spec §4 D5) */}
        {order.items.slice(0, 2).map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2">
            <ProductImage src={item.imageUrl ?? undefined} alt={item.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-dark">{item.name}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-default-500">
              ฿{item.price.toLocaleString('th-TH')} × {item.qty}
            </span>
            <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-dark">
              ฿{(item.price * item.qty).toLocaleString('th-TH')}
            </span>
          </div>
        ))}

        {/* "+ ดูอีก N รายการ" → ลิงก์ไปหน้า detail (spec D5) */}
        {order.items.length > 2 && (
          <Link
            href={`/orders/${order.publicToken}`}
            className="block py-1.5 text-center text-[11px] font-medium text-primary hover:underline"
          >
            + ดูอีก {order.items.length - 2} รายการ
          </Link>
        )}

        {/* breakdown ยอด: แสดงเฉพาะบรรทัดมีค่า (D5) — discount/VAT ไม่มีใน schema → ไม่ render */}
        <div className="ml-auto w-full max-w-[15rem] space-y-1 py-2 text-xs">
          <div className="flex justify-between text-default-500">
            <span>ยอดสินค้า</span>
            <span className="tabular-nums">
              ฿{order.items.reduce((s, i) => s + i.price * i.qty, 0).toLocaleString('th-TH')}
            </span>
          </div>
          <div className="flex justify-between border-t border-default-200 pt-1">
            <span className="font-medium text-dark">ยอดสุทธิ</span>
            <span className="text-base font-bold tabular-nums text-dark">
              ฿{order.total.toLocaleString('th-TH')}
            </span>
          </div>
        </div>
      </div>

      {/* ╔ FOOTER: flex-wrap — 4 action ครบ ไม่ล้นที่ 360px (M3-#1) ╗ */}
      {/*
       * เปลี่ยนจาก flex items-center gap-1.5 (แถวเดียว → ล้นขอบขวา 360px)
       * เป็น flex flex-wrap justify-end gap-2 — wrap อัตโนมัติ
       * ปุ่ม "ดูรายละเอียด" (primary) w-full sm:w-auto ให้เต็มแถวบน mobile
       * min-h-11 ทุกปุ่ม = touch target ≥44px (impeccable product rule)
       * เก็บทั้ง 4 action ครบ: ⋯ menu / copy link / SMS / ดูรายละเอียด
       * (ไม่ย้าย copy/SMS เข้า menu เพราะมี visual flash state ที่ menu ทำไม่ได้)
       */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-default-300 px-3 py-2">
        {/* ⋯ dropdown (T4) — ลำดับ ⋯ → secondary → primary ตาม convention §4 */}
        <OrderCardMenu
          token={order.publicToken}
          status={order.status}
          onCancelRequest={onCancelRequest}
        />

        {/* คัดลอกลิงก์ผู้ซื้อ (D7) — resolve buyer domain runtime */}
        <OrderCardCopyLink token={order.publicToken} />

        {/* ส่งลิงก์ทาง SMS — RC-8: ส่งแค่ publicToken (ห้าม buyerContact) */}
        <SendSmsButton publicToken={order.publicToken} compact />

        {/* ดูรายละเอียด — next/link ปกติ (Paces = ไม่มี MUI); w-full บน mobile */}
        <Link
          href={`/orders/${order.publicToken}`}
          className="btn btn-sm min-h-11 w-full bg-primary text-white hover:bg-primary-hover sm:w-auto"
        >
          <Icon icon="eye" className="text-sm" />
          ดูรายละเอียด
        </Link>
      </div>
    </div>
  )
}
