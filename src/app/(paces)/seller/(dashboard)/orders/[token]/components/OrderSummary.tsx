/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * ปรับจาก Paces OrderSummary:
 * - ลบข้อมูล mock (product images, fake $ amounts) ออกทั้งหมด
 * - แทนด้วยข้อมูลจริงจาก order.items + order.totalAmount (Baht)
 * - เพิ่มปุ่ม CopyLinkButton (ลิงก์สำหรับผู้ซื้อ) ใน card header
 * - restore: subtotal/discount/VAT/grand-total breakdown rows จาก theme (Phase B)
 *   honest breakdown — โชว์ discount/VAT เฉพาะเมื่อมีค่า (>0) ไม่โชว์ "−฿0"
 * - ตัด: product image links, shipping-fee row (ไม่มี field ใน SafePay MVP)
 * - S-5 (Batch B): ลบ STATUS_META/TYPE_META → ย้ายไป StatusHero (เจ้าของใหม่)
 *   ลบ badges ใน card-header, section "การดำเนินการ" (OrderActions), slip/accessUrl
 *   card-header: เหลือ title "รายการสินค้า" + ปุ่มกลับ
 * - S-13: ลบ section "ลิงก์สำหรับผู้ซื้อ" (OrderCopyLink/SendSmsButton) + CancelOrderButton
 *   ออก → ย้ายไป OrderActionPanel แล้ว; ลบ status/fulfillmentMode จาก type (ไม่ใช้แล้ว)
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

function formatAmount(amount: unknown) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(amount))
}

/** แปลง Decimal|null → number (null/NaN → 0) — ใช้ตัดสินใจ honest breakdown */
function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type OrderSummaryOrder = {
  publicToken: string
  type: string
  totalAmount: unknown
  /** Phase B: ส่วนลด (฿), null/0 = ไม่โชว์ row */
  discount?: unknown
  /** Phase B: VAT rate 0..1 (เช่น 0.07), null = ไม่โชว์ % */
  vatRate?: unknown
  /** Phase B: VAT amount (฿), null/0 = ไม่โชว์ row */
  vatAmount?: unknown
  createdAtISO: string
  items: Array<{
    id: string
    name: string
    description?: string | null
    qty: number
    price: unknown
  }>
}

interface OrderSummaryProps {
  order: OrderSummaryOrder
}

const OrderSummary = ({ order }: OrderSummaryProps) => {
  // honest breakdown (Phase B) — subtotal คำนวณจาก items, discount/VAT โชว์เฉพาะเมื่อมีค่า
  // total = round2(subtotal − discount + vatAmount) เป็น single source จาก DB (order.totalAmount)
  const subtotal = order.items.reduce((sum, it) => sum + toNum(it.price) * it.qty, 0)
  const discountVal = toNum(order.discount)
  const vatVal = toNum(order.vatAmount)
  // vatRate เก็บเป็น 0..1 → แปลงเป็น % (0.07 → 7); ตัดทศนิยมลอยด้วย parseFloat(toFixed)
  const vatPct = parseFloat((toNum(order.vatRate) * 100).toFixed(2))

  return (
    <div className="card">
      {/* card-header: title "รายการสินค้า" (ซ้าย) + ปุ่มกลับ (ขวา) */}
      {/* badges/วันที่/ออเดอร์# ย้ายไป StatusHero แล้ว */}
      <div className="card-header block items-start p-4 sm:p-7.5 md:flex">
        <div>
          <h4 className="card-title">รายการสินค้า</h4>
        </div>
        <div className="mt-4 md:ms-auto md:mt-0">
          <Link href="/orders" className="btn bg-light hover:text-primary me-1">
            <Icon icon="arrow-left" className="text-base" /> กลับ
          </Link>
        </div>
      </div>

      {/* px-4 sm:px-7.5 — ลบ !important ออก เพื่อให้ responsive breakpoint override ชนะ */}
      <div className="card-body px-4 sm:px-7.5">
        {/* ---- mobile stacked list (<sm) — ไม่ h-scroll ---- */}
        <div className="sm:hidden">
          {order.items.length === 0 ? (
            <p className="text-center text-default-400 py-6">ยังไม่มีรายการสินค้า</p>
          ) : (
            <div className="divide-y divide-default-200">
              {order.items.map((item) => (
                <div key={item.id} className="py-3">
                  {/* บรรทัดบน: ชื่อสินค้า */}
                  <p className="text-default-800 font-medium leading-snug truncate">{item.name}</p>
                  {item.description && (
                    <p className="text-default-400 text-2xs mt-0.5 truncate">{item.description}</p>
                  )}
                  {/* บรรทัดล่าง: ฿ราคา × qty = ฿รวม (tap ≥44px ผ่าน py-3 ของ row) */}
                  <p className="text-default-500 text-sm mt-1">
                    {formatAmount(item.price)} × {item.qty}{' '}
                    <span className="text-default-800 font-semibold">
                      = {formatAmount(Number(item.price) * item.qty)}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- desktop table (≥sm) — เดิม ---- */}
        <div className="table-wrapper hidden sm:block">
          <table className="table table-bordered">
            <thead className="thead-sm text-2xs uppercase bg-light/25">
              <tr>
                <th>ชื่อสินค้า</th>
                <th>ราคา/ชิ้น</th>
                <th>จำนวน</th>
                <th className="text-end">รวม</th>
              </tr>
            </thead>
            <tbody>
              {order.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-default-400 py-6">
                    ยังไม่มีรายการสินค้า
                  </td>
                </tr>
              ) : (
                order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>
                        <h5 className="text-default-800 font-medium mb-0.5">{item.name}</h5>
                        {item.description && (
                          <p className="text-default-400 text-2xs">{item.description}</p>
                        )}
                      </div>
                    </td>
                    <td>{formatAmount(item.price)}</td>
                    <td>{item.qty}</td>
                    <td className="text-end font-medium">
                      {formatAmount(Number(item.price) * item.qty)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ---- totals breakdown — flex justify-between block (ทั้ง mobile + desktop) ---- */}
        {/* ใช้ block แทน colSpan ใน table → ไม่ h-scroll บน 360px */}
        <div className="mt-4 border-t border-default-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-default-600 font-medium">ยอดสินค้า</span>
            <span className="text-default-800">{formatAmount(subtotal)}</span>
          </div>
          {discountVal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600 font-medium">ส่วนลด</span>
              <span className="text-danger font-semibold">- {formatAmount(discountVal)}</span>
            </div>
          )}
          {vatVal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600 font-medium">VAT{vatPct > 0 ? ` ${vatPct}%` : ''}</span>
              <span className="text-default-800">{formatAmount(vatVal)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-default-200 pt-2">
            <span className="font-bold uppercase text-sm">ยอดรวมทั้งหมด</span>
            <span className="font-bold text-sm text-default-800">{formatAmount(order.totalAmount)}</span>
          </div>
        </div>

      </div>
    </div>
  )
}

export default OrderSummary
