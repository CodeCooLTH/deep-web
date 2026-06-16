/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * icon-list pattern มาจาก Paces CustomerDetails (ul.space-y-2.5 + btn-icon circle + label/value)
 * ใช้ใน right column แทน ShippingAddress slot (2026-06-16)
 * - card layout, card-header, card-body เป็น Paces primitive
 * - formatDateTime จาก @/lib/format-date (พ.ศ. + เวลาไทย)
 * - icon: tabler:calendar, tabler:refresh, tabler:building-store
 * - render เสมอ (ไม่มีเงื่อนไข) — เหมาะกับ right column ที่ต้องมี card อยู่เสมอ
 */

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'

interface OrderDetailsProps {
  createdAtISO: string
  updatedAtISO: string
  shopName: string
}

const OrderDetails = ({ createdAtISO, updatedAtISO, shopName }: OrderDetailsProps) => {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">รายละเอียดคำสั่งซื้อ</h4>
      </div>
      <div className="card-body">
        <ul className="space-y-2.5">
          <li>
            <div className="flex items-start gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full shrink-0">
                <Icon icon="calendar" className="text-sm" />
              </span>
              <div>
                <p className="text-xs text-default-400 mb-0.5">วันที่สร้าง</p>
                <p className="text-sm text-default-800 mb-0">{formatDateTime(createdAtISO)}</p>
              </div>
            </div>
          </li>
          <li>
            <div className="flex items-start gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full shrink-0">
                <Icon icon="refresh" className="text-sm" />
              </span>
              <div>
                <p className="text-xs text-default-400 mb-0.5">วันที่อัปเดตล่าสุด</p>
                <p className="text-sm text-default-800 mb-0">{formatDateTime(updatedAtISO)}</p>
              </div>
            </div>
          </li>
          <li>
            <div className="flex items-start gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full shrink-0">
                <Icon icon="building-store" className="text-sm" />
              </span>
              <div>
                <p className="text-xs text-default-400 mb-0.5">สร้างโดย</p>
                <p className="text-sm text-default-800 mb-0">{shopName}</p>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default OrderDetails
