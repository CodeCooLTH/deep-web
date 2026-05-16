/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * ปรับจาก Paces CustomerDetails:
 * - ลบข้อมูล mock (fake customer avatar, flag image, email/phone hardcode) ออก
 * - แทนด้วย buyerContact จริงจาก order (mask ตาม PDPA — แสดงเฉพาะ 4 ตัวท้าย)
 * - ลบ: avatar image, country flag, dropdown actions (Share/Edit/Block/Delete)
 *   เหล่านี้ไม่มีข้อมูลใน schema SafePay
 * - คง: card layout, icon-list pattern สำหรับ contact info
 * - empty-state ที่สื่อความหมาย ถ้าผู้ซื้อยังไม่ยืนยัน
 */

import Icon from '@/components/wrappers/Icon'

function maskContact(c: string) {
  if (!c || c.length <= 4) return c || '—'
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

export type CustomerDetailsData = {
  buyerContact: string | null
  buyerDisplayName: string | null
  buyerUsername: string | null
}

interface CustomerDetailsProps {
  data: CustomerDetailsData
}

const CustomerDetails = ({ data }: CustomerDetailsProps) => {
  const { buyerContact, buyerDisplayName, buyerUsername } = data
  const displayName = buyerDisplayName || buyerUsername || null

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ข้อมูลผู้ซื้อ</h4>
      </div>
      <div className="card-body">
        {!buyerContact ? (
          // empty-state ที่ชัดเจน — ผู้ซื้อยังไม่ได้ยืนยันออเดอร์
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="user-off" className="text-3xl text-default-300 mb-2" />
            <p className="text-default-400 text-sm">ยังไม่มีผู้ซื้อยืนยัน</p>
            <p className="text-default-400 text-xs mt-1">
              ผู้ซื้อจะต้องยืนยัน OTP ผ่านลิงก์ก่อนข้อมูลจะปรากฏ
            </p>
          </div>
        ) : (
          <>
            {displayName && (
              <div className="mb-5 flex items-center">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 me-2.5">
                  <Icon icon="user" className="text-lg text-primary" />
                </div>
                <div>
                  <h5 className="text-default-800 text-sm font-medium mb-0.5">{displayName}</h5>
                  <p className="text-default-400 text-xs">ผู้ซื้อที่ลงทะเบียนแล้ว</p>
                </div>
              </div>
            )}
            <ul className="text-default-400 space-y-2.5">
              <li>
                <div className="flex items-center gap-2.5">
                  <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                    <Icon icon="phone" className="text-sm" />
                  </span>
                  <h5 className="text-default-400 font-medium text-sm">
                    {/* mask ตาม PDPA — แสดงเฉพาะ 4 ตัวท้าย */}
                    {maskContact(buyerContact)}
                  </h5>
                </div>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export default CustomerDetails
