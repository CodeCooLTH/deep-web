'use client'

/**
 * OrderFactsCard — การ์ด "ใบสั่งซื้อ" (v5 T6)
 *
 * Base:
 * - โครง section คั่นเส้นประ + ตารางสินค้า + breakdown rows:
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 * - payment-row pattern (icon-circle + text + status badge):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/BillingDetails.tsx
 * - avatar-block + icon-list (btn btn-icon bg-light rounded-full):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * Spec: docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md §1/§2/§4/§5/§6
 * Mockup: docs/superpowers/specs/2026-07-30-seller-order-detail-v5-mockup.html
 *   (secBuyer()/secItems()/secShipping() — แหล่งความจริงเรื่องหน้าตา)
 * Scope baseline (มติ NO_SHIPPING): docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md S-2
 *
 * v5 หลักการ: การ์ดนี้คือ "ข้อเท็จจริง" ของออเดอร์ — เห็นหมดเสมอ ไม่มีกาง/พับ ไม่ผูกกับสถานะ
 * (v4 พังเพราะเอาข้อมูลลูกค้าไปฝังในขั้นที่พับได้ — CONFIRMED แล้วเบอร์ลูกค้าหายจากจอ)
 *
 * 1 `.card` แบ่ง 3 section ด้วย `border-t border-dashed` — "ห้ามการ์ดซ้อนการ์ด" (anti-slop, Impeccable)
 * จึงไม่ใช้ `.card-header` ซ้อนใน section ย่อย ใช้ sec-hd แบบ icon+label ธรรมดาแทน
 *
 * S-2 (scope baseline): fulfillmentMode==='NO_SHIPPING' → ซ่อน section 3 ทั้ง section
 * ลิงก์ส่งมอบดิจิทัล (accessUrl) ยุบเข้า section 2 แทน (ยกมาจาก PaymentCard.tsx ทั้งก้อน รวม state
 * ฟอร์มบันทึกลิงก์ — ปุ่ม "บันทึกลิงก์" เป็นข้อยกเว้นที่ spec อนุญาตไว้ นอกนั้นการ์ดนี้ไม่มีปุ่ม action)
 *
 * ทำไมเป็น 'use client': ฟอร์ม accessUrl ต้องมี useState/fetch/router.refresh (ยกมาจาก PaymentCard เดิม
 * ทั้งก้อน — ของเดิมก็เป็น client component). PII: buyerContact ส่งเต็ม (ไม่ mask) ตาม user decision
 * 2026-07-30 ที่ CustomerDetails.tsx ทำอยู่แล้ว (หน้านี้ scope shopId ที่ DAL — เจ้าของร้านเห็นได้)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import { getPaymentBadge } from '@/lib/order-display'
// reuse label/icon map กลาง แทน duplicate local copy (เหมือน PaymentCard เดิม)
import { PAYMENT_LABELS, PAYMENT_ICONS } from '../../components/data'
import SalesChannelBadge from '@/components/safepay/SalesChannelBadge'
import SlipViewer from './SlipViewer'
import type { ShippingAddressData } from './CustomerDetails'

// ─── types ──────────────────────────────────────────────────────────────────

export type OrderFactsBuyer = {
  /** เบอร์/อีเมลผู้ซื้อ (เต็ม) — user decision 2026-07-30: ร้านต้องกดโทรหาลูกค้าได้ */
  buyerContact: string | null
  buyerDisplayName: string | null
  buyerUsername: string | null
  /** ชื่อที่ร้านบันทึกตอนสร้างออเดอร์ (buyer อาจยังไม่ลงทะเบียน) */
  buyerName: string | null
  /** avatar URL (Facebook CDN / null) — ไม่ใช่ PII เพราะเป็น URL สาธารณะ */
  avatar: string | null
  shippingAddr: ShippingAddressData | null
}

export type OrderFactsItem = {
  id: string
  name: string
  description?: string | null
  qty: number
  price: unknown
  /** resolved server-side จาก product.images[0] — null = placeholder */
  imageUrl: string | null
}

export type OrderFactsShipping = {
  courier: string
  trackingNo: string
  /** ISO string — ที่มา ShipmentTracking.createdAt; null = ไม่ทราบเวลา */
  shippedAtISO: string | null
  /** true = พัสดุมาจาก iShip (system-generated); false/undefined = กรอกเอง */
  isIship?: boolean
}

export interface OrderFactsCardProps {
  buyer: OrderFactsBuyer
  items: OrderFactsItem[]
  /** ส่วนลด (฿), null/0 = ไม่โชว์ row */
  discount?: unknown
  /** VAT rate 0..1 (เช่น 0.07), null = ไม่โชว์ % ต่อท้าย label */
  vatRate?: unknown
  /** VAT amount (฿), null/0 = ไม่โชว์ row */
  vatAmount?: unknown
  /** ยอดรวมทั้งหมด — single source จาก DB (order.totalAmount) */
  totalAmount: unknown
  paymentMethod: string | null
  salesChannel: string | null
  slipFileId: string | null
  accessUrl: string | null
  fulfillmentMode: string
  publicToken: string
  /** status ของออเดอร์ — ใช้ derive payment badge (getPaymentBadge) */
  status: string
  /** null = ยังไม่แจ้งเลขพัสดุ (แสดง callout); ไม่ render เลยถ้า fulfillmentMode==='NO_SHIPPING' (S-2) */
  shipping: OrderFactsShipping | null
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatAmount(amount: unknown) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(amount))
}

/** แปลง Decimal|null → number (null/NaN → 0) — ใช้ตัดสินใจ honest breakdown */
function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * หนี้ S-10 (spec §6.1): breakdown array เดียว ใช้ทั้ง mobile และ desktop ผ่าน .map()
 * ห้ามเขียน JSX คำนวณ label/value ซ้ำ 2 ชุด (ของเดิม OrderSummary.tsx มีปัญหานี้)
 */
type BreakdownRow = {
  key: string
  label: string
  value: number
  show: boolean
  tone?: 'danger'
  prefix?: string
  emphasis?: boolean
}

function buildBreakdown(params: {
  subtotal: number
  discount: number
  vatAmount: number
  vatPct: number
  total: number
}): BreakdownRow[] {
  const { subtotal, discount, vatAmount, vatPct, total } = params
  return [
    { key: 'subtotal', label: 'ยอดสินค้า', value: subtotal, show: true },
    { key: 'discount', label: 'ส่วนลด', value: discount, show: discount > 0, tone: 'danger' as const, prefix: '- ' },
    { key: 'vat', label: `VAT${vatPct > 0 ? ` ${vatPct}%` : ''}`, value: vatAmount, show: vatAmount > 0 },
    { key: 'total', label: 'ยอดรวมทั้งหมด', value: total, show: true, emphasis: true },
  ].filter((r) => r.show)
}

/** section header — icon + label + spacer + right slot (ไม่ใช่ .card-header ซ้อนการ์ด) */
function SecHead({ icon, label, right }: { icon: string; label: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-1.75">
      <Icon icon={icon} className="text-base text-default-400" aria-hidden="true" />
      <span className="text-xs font-semibold text-default-800">{label}</span>
      <span className="flex-1" />
      {right}
    </div>
  )
}

/** Thumbnail สินค้า — ใช้ร่วมกัน desktop + mobile (เหมือน OrderSummary.tsx เดิม) */
function ItemThumbnail({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={name}
        width={56}
        height={56}
        className="size-14 shrink-0 rounded-lg object-cover"
      />
    )
  }
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-default-100">
      <Icon icon="photo" className="size-6 text-default-400" />
    </div>
  )
}

// ─── component ──────────────────────────────────────────────────────────────

export default function OrderFactsCard({
  buyer,
  items,
  discount,
  vatRate,
  vatAmount,
  totalAmount,
  paymentMethod,
  salesChannel,
  slipFileId,
  accessUrl,
  fulfillmentMode,
  publicToken,
  status,
  shipping,
}: OrderFactsCardProps) {
  const router = useRouter()

  // ── section 1: ผู้ซื้อและที่อยู่จัดส่ง ────────────────────────────────────
  // ลำดับชื่อ: registered displayName/username > ชื่อที่ร้านบันทึก (buyerName)
  // (logic ยกมาจาก CustomerDetails.tsx เดิมทั้งก้อน — ไม่ hardcode "ยืนยัน OTP แล้ว" ตาม mockup demo
  // data เพราะ buyerContact/buyerName ตั้งได้ตอนสร้างออเดอร์ POS โดยที่ผู้ซื้อยังไม่ได้ยืนยันอะไรเลย
  // ข้อความ "ยืนยัน OTP แล้ว" ในมockup เป็นค่า demo ของ scenario เดียว ไม่ใช่ truth ของทุกออเดอร์)
  const registeredName = buyer.buyerDisplayName || buyer.buyerUsername || null
  const displayName = registeredName || buyer.buyerName || null
  const hasBuyerInfo = Boolean(buyer.buyerContact || displayName)

  const addrLine2 = buyer.shippingAddr
    ? [buyer.shippingAddr.subdistrict, buyer.shippingAddr.district].filter(Boolean).join(' ')
    : ''
  const addrLine3 = buyer.shippingAddr
    ? [buyer.shippingAddr.province, buyer.shippingAddr.postcode].filter(Boolean).join(' ')
    : ''
  const addrLines = buyer.shippingAddr
    ? [buyer.shippingAddr.line1, addrLine2, addrLine3].filter((l) => l && String(l).trim())
    : []

  // ── section 2: รายการสินค้าและยอดเงิน ────────────────────────────────────
  const subtotal = items.reduce((sum, it) => sum + toNum(it.price) * it.qty, 0)
  const discountVal = toNum(discount)
  const vatVal = toNum(vatAmount)
  const vatPct = parseFloat((toNum(vatRate) * 100).toFixed(2))
  const rows = buildBreakdown({
    subtotal,
    discount: discountVal,
    vatAmount: vatVal,
    vatPct,
    total: toNum(totalAmount),
  })

  const hasPaymentInfo = paymentMethod !== null || salesChannel !== null
  const paymentBadge = getPaymentBadge(status, paymentMethod, slipFileId)
  const paymentIcon = paymentMethod ? (PAYMENT_ICONS[paymentMethod] ?? 'wallet') : 'credit-card-off'
  const paymentLabel = paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'ยังไม่ระบุวิธีชำระ'

  // S-2: ลิงก์ส่งมอบดิจิทัล ยุบเข้า section 2 (ยกมาจาก PaymentCard.tsx ทั้งก้อน)
  const showAccessUrl = fulfillmentMode === 'NO_SHIPPING'
  const [accessUrlValue, setAccessUrlValue] = useState(accessUrl ?? '')
  const [accessUrlLoading, setAccessUrlLoading] = useState(false)
  const [accessUrlError, setAccessUrlError] = useState('')

  const handleSaveAccessUrl = async () => {
    const url = accessUrlValue.trim()
    if (!url) {
      setAccessUrlError('กรุณากรอกลิงก์ที่จะส่งให้ผู้ซื้อ')
      return
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setAccessUrlError('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
      return
    }
    setAccessUrlError('')
    setAccessUrlLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/access-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกลิงก์ไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกลิงก์แล้ว')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'บันทึกลิงก์ไม่สำเร็จ กรุณาลองใหม่'
      pacesToast.error(message)
    } finally {
      setAccessUrlLoading(false)
    }
  }

  // ── section 3: การจัดส่ง (ซ่อนทั้ง section เมื่อ NO_SHIPPING — S-2) ────────
  const showShippingSection = fulfillmentMode !== 'NO_SHIPPING'

  return (
    <div className="card">
      {/* section 1 — ผู้ซื้อและที่อยู่จัดส่ง */}
      <div className="card-body">
        <SecHead icon="user" label="ผู้ซื้อและที่อยู่จัดส่ง" />

        {!hasBuyerInfo ? (
          // empty-state — ยกข้อความจาก CustomerDetails.tsx เดิม
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="user-off" className="mb-2 text-3xl text-default-300" />
            <p className="text-sm text-default-400">ยังไม่มีผู้ซื้อยืนยัน</p>
            <p className="mt-1 text-xs text-default-400">
              ผู้ซื้อจะต้องยืนยัน OTP ผ่านลิงก์ก่อนข้อมูลจะปรากฏ
            </p>
          </div>
        ) : (
          <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.75">
              {buyer.avatar ? (
                <Image
                  src={buyer.avatar}
                  alt={displayName ?? 'ผู้ซื้อ'}
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default-200">
                  <span className="text-sm font-semibold text-default-700">
                    {displayName ? displayName.charAt(0).toUpperCase() : <Icon icon="user" className="text-base" />}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-default-900">{displayName ?? 'ไม่ระบุชื่อ'}</p>
                <p className="text-2xs text-default-700">
                  {buyer.buyerUsername
                    ? `@${buyer.buyerUsername}`
                    : registeredName
                      ? 'ผู้ซื้อที่ลงทะเบียนแล้ว'
                      : 'ชื่อที่ร้านบันทึก'}
                </p>
              </div>
            </div>
            {/* tel: — ข้อยกเว้นเดียวที่การ์ดนี้อนุญาตให้เป็นลิงก์กดได้ (One Voice: primary เฉพาะจุดนี้) */}
            {buyer.buyerContact ? (
              <a
                href={`tel:${buyer.buyerContact}`}
                className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-primary hover:text-primary-hover sm:min-h-0"
              >
                <Icon icon="phone" className="text-base" aria-hidden="true" />
                {buyer.buyerContact}
              </a>
            ) : (
              <p className="mb-0 text-sm font-medium text-default-400">ยังไม่มีเบอร์ติดต่อ</p>
            )}
          </div>
        )}

        {/* กล่องที่อยู่ — render อิสระจาก buyer-confirmed state (seller อาจกรอกก่อนผู้ซื้อยืนยัน) */}
        {buyer.shippingAddr && (
          <div className="rounded bg-default-100 px-3.5 py-3">
            <div className="mb-1.25 flex items-center gap-1.5 text-2xs text-default-600">
              <Icon icon="map-pin" className="text-xs" aria-hidden="true" />
              ที่อยู่จัดส่ง
            </div>
            <p className="mb-0 text-sm text-default-900">
              {addrLines.length > 0
                ? addrLines.map((l, i) => (
                    <span key={i}>
                      {l}
                      {i < addrLines.length - 1 && <br />}
                    </span>
                  ))
                : '—'}
            </p>
          </div>
        )}

        {/* หมายเหตุจากผู้ซื้อ — callout warning (เฉพาะเมื่อมีค่าจริง) */}
        {buyer.shippingAddr?.note && buyer.shippingAddr.note.trim() && (
          <div className="mt-2.5 flex items-start gap-2.25 rounded bg-warning/15 px-3.5 py-2.75 text-xs text-default-800">
            <Icon icon="message-circle" className="mt-0.5 text-sm text-warning" aria-hidden="true" />
            <span>
              <span className="font-semibold">หมายเหตุจากผู้ซื้อ</span> — {buyer.shippingAddr.note}
            </span>
          </div>
        )}
      </div>

      {/* section 2 — รายการสินค้าและยอดเงิน */}
      <div className="card-body border-t border-dashed border-default-300">
        <SecHead
          icon="list"
          label="รายการสินค้าและยอดเงิน"
          right={<span className="text-xs text-default-700">{items.length} รายการ</span>}
        />

        {/* ---- mobile stacked list (<sm) ---- */}
        <div className="sm:hidden">
          {items.length === 0 ? (
            <p className="py-6 text-center text-default-400">ยังไม่มีรายการสินค้า</p>
          ) : (
            <div className="divide-y divide-default-200">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-3">
                  <ItemThumbnail imageUrl={item.imageUrl} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-snug text-default-800">{item.name}</p>
                    {item.description && (
                      <p className="mt-0.5 truncate text-2xs text-default-400">{item.description}</p>
                    )}
                    <p className="mt-1 text-sm text-default-500">
                      {formatAmount(item.price)} × {item.qty}{' '}
                      <span className="font-semibold text-default-800">
                        = {formatAmount(Number(item.price) * item.qty)}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* S-10: breakdown mobile — map() จาก rows array เดียวกับ desktop ด้านล่าง */}
          <div className="mt-4 space-y-1.5 border-t border-default-300 pt-3">
            {rows.map((r) => (
              <div
                key={r.key}
                className={cn(
                  'flex justify-between text-sm',
                  r.emphasis && 'mt-1 border-t border-default-300 pt-2 font-bold text-default-800',
                )}
              >
                <span className={r.emphasis ? '' : 'font-medium text-default-600'}>{r.label}</span>
                <span
                  className={cn(
                    r.emphasis ? 'font-bold text-default-800' : 'text-default-800',
                    r.tone === 'danger' && 'font-semibold text-danger',
                  )}
                >
                  {r.prefix ?? ''}
                  {formatAmount(r.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ---- desktop table (≥sm) ---- */}
        <div className="table-wrapper hidden sm:block">
          <table className="table table-bordered">
            <thead className="thead-sm bg-light/25 text-2xs">
              <tr>
                <th>ชื่อสินค้า</th>
                <th>ราคา/ชิ้น</th>
                <th>จำนวน</th>
                <th className="text-end">รวม</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-default-400">
                    ยังไม่มีรายการสินค้า
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-base">
                        <ItemThumbnail imageUrl={item.imageUrl} name={item.name} />
                        <div>
                          <h5 className="mb-0.5 font-medium text-default-800">{item.name}</h5>
                          {item.description && (
                            <p className="text-2xs text-default-400">{item.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{formatAmount(item.price)}</td>
                    <td>{item.qty}</td>
                    <td className="text-end font-medium">{formatAmount(Number(item.price) * item.qty)}</td>
                  </tr>
                ))
              )}

              {/* S-10: breakdown desktop — map() จาก rows array เดียวกับ mobile ด้านบน (ห้ามเขียนซ้ำ) */}
              {rows.map((r) => (
                <tr key={r.key} className={r.emphasis ? 'border-t border-default-300' : undefined}>
                  <td
                    colSpan={3}
                    className={cn(
                      'px-4 py-3 text-right',
                      r.emphasis ? 'font-bold' : 'font-medium text-default-800',
                    )}
                  >
                    {r.label}
                  </td>
                  <td
                    className={cn(
                      'text-end',
                      r.emphasis && 'bg-default-50 font-bold',
                      r.tone === 'danger' && 'px-4 py-3 font-semibold text-danger',
                    )}
                  >
                    {r.prefix ?? ''}
                    {formatAmount(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* แถวการชำระเงิน — ต่อท้ายก้อนเงิน ไม่แยก section (เป็นเรื่องเดียวกับยอด, ตาม mockup .payrow) */}
        <div className="mt-3.5 border-t border-dashed border-default-300 pt-3.5">
          {hasPaymentInfo ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:gap-6.5">
                <div>
                  <p className="mb-0.5 text-2xs text-default-600">วิธีชำระ</p>
                  <p className="mb-0 flex items-center gap-1.5 text-sm font-medium text-default-900">
                    <Icon icon={paymentIcon} className="text-sm text-default-700" aria-hidden="true" />
                    {paymentLabel}
                  </p>
                </div>
                {salesChannel && (
                  <div>
                    <p className="mb-0.5 text-2xs text-default-600">ช่องทางการขาย</p>
                    <SalesChannelBadge channel={salesChannel} />
                  </div>
                )}
                {paymentBadge && (
                  <div>
                    <p className="mb-0.5 text-2xs text-default-600">สถานะ</p>
                    <span className={paymentBadge.cls}>{paymentBadge.label}</span>
                  </div>
                )}
              </div>
              {slipFileId && (
                <div>
                  <p className="mb-1 text-2xs text-default-600">สลิปโอนเงิน</p>
                  <SlipViewer slipFileId={slipFileId} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <Icon icon="credit-card-off" className="mb-2 text-3xl text-default-300" />
              <p className="text-sm text-default-400">ไม่มีข้อมูลการชำระเงิน</p>
            </div>
          )}
        </div>

        {/* ลิงก์ส่งมอบดิจิทัล — เฉพาะ NO_SHIPPING (S-2) ยกจาก PaymentCard.tsx ทั้งก้อน */}
        {showAccessUrl && (
          <div className="mt-3.5 border-t border-dashed border-default-300 pt-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Icon icon="link" className="text-base text-default-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-default-800">ลิงก์ส่งมอบสินค้า/บริการดิจิทัล</span>
            </div>
            <p className="mb-3 text-xs text-default-400">
              กรอก URL เพื่อส่งมอบให้ผู้ซื้อ (ต้องเป็น http หรือ https)
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={accessUrlValue}
                onChange={(e) => {
                  setAccessUrlValue(e.target.value)
                  if (accessUrlError) setAccessUrlError('')
                }}
                placeholder="https://example.com/download/..."
                className="form-input flex-1 text-sm"
                disabled={accessUrlLoading}
                aria-invalid={accessUrlError ? true : undefined}
                aria-describedby={accessUrlError ? 'access-url-error' : undefined}
              />
              {/* ปุ่มเดียวที่การ์ดนี้อนุญาตให้มี (spec T6: ยกฟอร์ม accessUrl มาทั้งก้อน) */}
              <button
                type="button"
                onClick={handleSaveAccessUrl}
                disabled={accessUrlLoading}
                className="btn whitespace-nowrap bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {accessUrlLoading ? 'กำลังบันทึก...' : 'บันทึกลิงก์'}
              </button>
            </div>
            {accessUrlError && (
              <p id="access-url-error" role="alert" className="mt-1.5 text-xs text-danger">
                {accessUrlError}
              </p>
            )}
            {accessUrl && (
              <p className="mt-2 break-all text-xs text-default-400">
                <span className="font-medium text-default-600">บันทึกอยู่:</span> {accessUrl}
              </p>
            )}
          </div>
        )}
      </div>

      {/* section 3 — การจัดส่ง (ซ่อนทั้ง section เมื่อ NO_SHIPPING — S-2 มติ user) */}
      {showShippingSection && (
        <div className="card-body border-t border-dashed border-default-300">
          <SecHead
            icon="truck-delivery"
            label="การจัดส่ง"
            right={
              shipping ? (
                // ทั้ง 2 ทาง (กรอกเอง/iShip) ใช้โทน info เดียวกัน — ต่างกันแค่ label
                <span className="badge badge-label bg-info/15 text-info">
                  {shipping.isIship ? 'ส่งผ่าน iShip' : 'ส่งเอง'}
                </span>
              ) : (
                <span className="badge badge-label bg-warning/15 text-warning">ยังไม่แจ้งเลขพัสดุ</span>
              )
            }
          />

          {shipping ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6.5">
              <div className="flex-1">
                <p className="mb-0.5 text-2xs text-default-600">ขนส่ง</p>
                <p className="mb-0 text-sm font-medium text-default-900">{shipping.courier}</p>
              </div>
              <div className="flex-1">
                <p className="mb-0.5 text-2xs text-default-600">เลขพัสดุ</p>
                {/* ห้าม font-mono — Anuphan ไม่มี mono จะ fallback Courier หลุดธีม
                    (feedback_font_mono_breaks_anuphan) ใช้ tabular-nums + tracking-wide แทน */}
                <p className="mb-0 text-sm font-semibold tabular-nums tracking-wide text-default-900">
                  {shipping.trackingNo}
                </p>
              </div>
              <div className="flex-1">
                <p className="mb-0.5 text-2xs text-default-600">แจ้งจัดส่งเมื่อ</p>
                <p className="mb-0 text-sm text-default-900">{formatDateTime(shipping.shippedAtISO)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.25 rounded bg-default-100 px-3.5 py-2.75 text-xs text-default-800">
              <Icon icon="truck-delivery" className="mt-0.5 text-sm text-default-600" aria-hidden="true" />
              <span>
                ส่งของแล้วให้กด <span className="font-semibold">แจ้งเลขพัสดุ</span> ที่แถบด้านล่างจอ — เลือกได้ว่าจะกรอกเลขที่ส่งเองหรือให้ระบบสร้างพัสดุ iShip ให้
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
