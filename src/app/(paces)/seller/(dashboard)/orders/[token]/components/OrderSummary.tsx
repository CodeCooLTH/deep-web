/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * ปรับจาก Paces OrderSummary:
 * - ลบข้อมูล mock (product images, fake $ amounts) ออกทั้งหมด
 * - แทนด้วยข้อมูลจริงจาก order.items + order.totalAmount (Baht)
 * - เพิ่มปุ่ม CopyLinkButton (ลิงก์สำหรับผู้ซื้อ) ใน card header
 * - เพิ่ม OrderActions ใต้ตาราง
 * - ตัด: product image links, fake subtotal/tax/discount/shipping rows
 * - คง: card layout, table structure, header with status badges
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import OrderCopyLink from './OrderCopyLink'
import SendSmsButton from './SendSmsButton'
import OrderActions from './OrderActions'

const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning',  icon: 'clock' },
  SHIPPED:   { label: 'จัดส่งแล้ว',  cls: 'bg-info/15 text-info',        icon: 'truck' },
  CONFIRMED: { label: 'สำเร็จ',      cls: 'bg-success/15 text-success',  icon: 'circle-check-filled' },
  CANCELLED: { label: 'ยกเลิก',      cls: 'bg-danger/15 text-danger',    icon: 'circle-x' },
}

const TYPE_META: Record<string, { label: string; icon: string; cls: string }> = {
  PHYSICAL: { label: 'สินค้าจับต้องได้', icon: 'package', cls: 'bg-primary/15 text-primary' },
  DIGITAL: { label: 'ดิจิทัล', icon: 'cloud-download', cls: 'bg-info/15 text-info' },
  SERVICE: { label: 'บริการ', icon: 'tool', cls: 'bg-success/15 text-success' },
}

function formatAmount(amount: unknown) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(amount))
}

export type OrderSummaryOrder = {
  publicToken: string
  status: string
  type: string
  /** fulfillmentMode snapshot จาก order — ใช้กำหนด ship gate แทน order.type */
  fulfillmentMode: string
  totalAmount: unknown
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
  const s = STATUS_META[order.status] ?? { label: order.status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }
  const t = TYPE_META[order.type] ?? { label: order.type, icon: 'help-circle', cls: 'bg-default-100 text-default-700' }

  const createdDate = new Date(order.createdAtISO).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const createdTime = new Date(order.createdAtISO).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const tokenShort = order.publicToken.slice(0, 8)

  return (
    <div className="card">
      <div className="card-header block items-start p-7.5 md:flex">
        <div>
          <h3 className="mb-1.25 flex items-center text-lg font-mono">
            ออเดอร์ #{tokenShort}
          </h3>
          <p className="text-default-400 mb-5">
            <span className="flex items-center gap-1">
              <Icon icon="calendar" className="align-middle" />
              {createdDate}
              <small className="text-default-400">{createdTime}</small>
            </span>
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}>
              <Icon icon={s.icon} className="text-sm" /> {s.label}
            </span>
            <span className={`badge badge-label text-2xs font-semibold ${t.cls}`}>
              <Icon icon={t.icon} className="text-sm" /> {t.label}
            </span>
          </div>
        </div>
        <div className="mt-4 md:ms-auto md:mt-0">
          <Link href="/orders" className="btn bg-light hover:text-primary me-1">
            <Icon icon="arrow-left" className="text-base" /> กลับ
          </Link>
        </div>
      </div>

      <div className="card-body px-7.5!">
        <h4 className="mb-5">รายการสินค้า</h4>
        <div className="table-wrapper">
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
              <tr className="border-default-300 border-t">
                <td colSpan={3} className="text-default-800 px-4 py-3 text-right font-bold uppercase">
                  ยอดรวมทั้งหมด
                </td>
                <td className="text-end font-bold bg-default-50">{formatAmount(order.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ลิงก์สำหรับผู้ซื้อ — อยู่ใต้ตาราง เพื่อให้ seller copy ง่าย */}
        <div className="mt-6 border-t border-default-200 pt-5">
          <h4 className="mb-2 text-sm font-semibold text-default-800 flex items-center gap-1.5">
            <Icon icon="link" className="text-base text-default-400" />
            ลิงก์สำหรับผู้ซื้อ
          </h4>
          <p className="text-default-400 text-xs mb-3">
            ส่งลิงก์นี้ให้ผู้ซื้อเพื่อยืนยันและรีวิวออเดอร์
          </p>
          {/* RC-8: ส่งแค่ publicToken — ไม่มี buyerContact/phone ผ่านมาที่นี่ */}
          <div className="flex flex-wrap gap-2">
            <OrderCopyLink publicToken={order.publicToken} />
            <SendSmsButton publicToken={order.publicToken} />
          </div>
        </div>

        {/* การดำเนินการออเดอร์ */}
        <div className="mt-6 border-t border-default-200 pt-5">
          <h4 className="mb-4 text-sm font-semibold text-default-800">การดำเนินการ</h4>
          <OrderActions order={{ publicToken: order.publicToken, status: order.status, fulfillmentMode: order.fulfillmentMode }} />
        </div>
      </div>
    </div>
  )
}

export default OrderSummary
