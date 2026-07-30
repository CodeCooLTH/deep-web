/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * ปรับจาก Paces OrderSummary (theme fidelity — 2026-06-16):
 * - เพิ่ม thumbnail ต่อ item: <Image size-9 rounded-md object-cover shrink-0> เมื่อ imageUrl มีค่า;
 *   fallback placeholder div bg-default-100 + tabler:photo icon
 * - thumbnail ใส่ทั้ง desktop table cell (flex items-center gap-base) และ mobile stacked row
 * - ย้าย breakdown เข้า <tbody> ตาม theme pattern: colSpan={3} text-right label + td text-end value
 *   ยอดสินค้า / ส่วนลด (เฉพาะ >0, text-danger, prefix −) / VAT N% (เฉพาะ >0) / ยอดรวมทั้งหมด (font-bold, bg-default-50)
 * - ลบ Shipping Fee row (ไม่มี field ใน SafePay MVP)
 * - honest conditional: discount/VAT แสดงเฉพาะเมื่อ >0 (คง pattern เดิม)
 * - subtitle = item.description (ไม่มี "by: vendor" เพราะ 1 order = 1 ร้านค้า)
 * - mobile breakdown คงเป็น <div> block (table ซ่อนบน mobile)
 * - ลบ: product image links, StatusHero metadata (ย้ายไป StatusHero), slip/accessUrl, OrderActions
 */

import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'

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
    /** resolved server-side จาก product.images[0] — null = placeholder */
    imageUrl: string | null
  }>
}

interface OrderSummaryProps {
  order: OrderSummaryOrder
}

/**
 * Thumbnail component — ใช้ร่วมกัน desktop + mobile
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/cart/components/ShoppingCart.tsx
 *   (size-15 rounded pattern → ปรับเป็น size-14 rounded-lg เพื่อ image-forward look)
 */
function ItemThumbnail({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={name}
        width={56}
        height={56}
        className="size-14 rounded-lg object-cover shrink-0"
      />
    )
  }
  return (
    <div className="size-14 rounded-lg bg-default-100 flex items-center justify-center shrink-0">
      <Icon icon="photo" className="size-6 text-default-400" />
    </div>
  )
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
      {/* card-header: title เท่านั้น — ปุ่ม navigation ย้ายไปที่ OrderActionPanel แล้ว */}
      {/* badges/วันที่/ออเดอร์# ย้ายไป StatusHero แล้ว */}
      <div className="card-header">
        <h4 className="card-title">รายการสินค้า</h4>
      </div>

      {/* px-4 sm:px-7.5 — ลบ !important ออก เพื่อให้ responsive breakpoint override ชนะ */}
      <div className="card-body px-5 sm:px-7.5">
        {/* ---- mobile stacked list (<sm) — ไม่ h-scroll ---- */}
        <div className="sm:hidden">
          {order.items.length === 0 ? (
            <p className="text-center text-default-400 py-6">ยังไม่มีรายการสินค้า</p>
          ) : (
            <div className="divide-y divide-default-200">
              {order.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start gap-3">
                  {/* thumbnail mobile */}
                  <ItemThumbnail imageUrl={item.imageUrl} name={item.name} />
                  <div className="min-w-0 flex-1">
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
                </div>
              ))}
            </div>
          )}

          {/* mobile breakdown — div block (table ซ่อนบน mobile) */}
          <div className="mt-4 border-t border-default-300 pt-3 space-y-1.5">
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
            <div className="flex justify-between border-t border-default-300 pt-2">
              {/* ไม่ใส่ uppercase — ภาษาไทยไม่มีตัวพิมพ์ใหญ่ (ติดมาจาก "GRAND TOTAL" ของ theme) */}
              <span className="font-bold text-sm">ยอดรวมทั้งหมด</span>
              <span className="font-bold text-sm text-default-800">{formatAmount(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* ---- desktop table (≥sm) — breakdown ย้ายเข้า tbody ตาม theme ---- */}
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
                      {/* product cell: thumbnail + name + description (เหมือน theme gap-base) */}
                      <div className="flex items-center gap-base">
                        <ItemThumbnail imageUrl={item.imageUrl} name={item.name} />
                        <div>
                          <h5 className="text-default-800 font-medium mb-0.5">{item.name}</h5>
                          {item.description && (
                            <p className="text-default-400 text-2xs">{item.description}</p>
                          )}
                        </div>
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

              {/* breakdown rows ใน tbody ตาม theme pattern (colSpan={3} text-right label + td value) */}
              <tr className="border-default-300 border-t">
                <td colSpan={3} className="text-default-800 px-4 py-3 text-right font-medium">
                  ยอดสินค้า
                </td>
                <td className="text-end">{formatAmount(subtotal)}</td>
              </tr>
              {/* ส่วนลด: แสดงเฉพาะเมื่อ >0 (honest conditional) */}
              {discountVal > 0 && (
                <tr>
                  <td colSpan={3} className="text-default-800 px-4 py-3 text-right font-medium">
                    ส่วนลด
                  </td>
                  <td className="text-danger px-4 py-3 text-right font-semibold">
                    - {formatAmount(discountVal)}
                  </td>
                </tr>
              )}
              {/* VAT: แสดงเฉพาะเมื่อ >0 (honest conditional) */}
              {vatVal > 0 && (
                <tr>
                  <td colSpan={3} className="text-default-800 px-4 py-3 text-right font-medium">
                    VAT{vatPct > 0 ? ` ${vatPct}%` : ''}
                  </td>
                  <td className="text-end">{formatAmount(vatVal)}</td>
                </tr>
              )}
              {/* ยอดรวม: font-bold label + bg-default-50 value — เหมือน Grand Total ใน theme */}
              <tr className="border-default-300 border-t">
                {/* ไม่ใส่ uppercase — ภาษาไทยไม่มีตัวพิมพ์ใหญ่ (ติดมาจาก "GRAND TOTAL" ของ theme) */}
                <td colSpan={3} className="text-end font-bold">
                  ยอดรวมทั้งหมด
                </td>
                <td className="text-end font-bold bg-default-50">{formatAmount(order.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default OrderSummary
