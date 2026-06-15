/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * ปรับจาก Paces CustomerDetails:
 * - ลบข้อมูล mock (fake customer avatar, flag image, email/phone hardcode) ออก
 * - แทนด้วย buyerContact จริงจาก order — **mask ที่ server boundary (page.tsx) ก่อนส่ง** (S-C1)
 *   component รับ buyerContactMasked ที่ mask แล้ว ไม่เห็น raw phone (กัน RSC flight leak —
 *   seller page อยู่ใต้ client VerticalLayout → server props serialize เข้า flight payload)
 * - ลบ: avatar image, country flag, dropdown actions (Share/Edit/Block/Delete)
 *   เหล่านี้ไม่มีข้อมูลใน schema SafePay
 * - คง: card layout, icon-list pattern สำหรับ contact info
 * - empty-state ที่สื่อความหมาย ถ้าผู้ซื้อยังไม่ยืนยัน
 * - payment/channel ย้ายไปอยู่ใน PaymentCard แล้ว (Batch B / B2) —
 *   component นี้เหลือเฉพาะ identity + contact
 */

import Icon from '@/components/wrappers/Icon'

export type CustomerDetailsData = {
  /** เบอร์/อีเมลผู้ซื้อที่ mask แล้วจาก server (S-C1) — ห้ามส่ง raw ข้าม RSC boundary */
  buyerContactMasked: string | null
  buyerDisplayName: string | null
  buyerUsername: string | null
  /** ชื่อที่ร้านบันทึกตอนสร้างออเดอร์ (buyer อาจยังไม่ลงทะเบียน) */
  buyerName: string | null
}

interface CustomerDetailsProps {
  data: CustomerDetailsData
}

const CustomerDetails = ({ data }: CustomerDetailsProps) => {
  const { buyerContactMasked, buyerDisplayName, buyerUsername, buyerName } = data
  // ลำดับชื่อ: registered displayName/username > ชื่อที่ร้านบันทึก (buyerName)
  const registeredName = buyerDisplayName || buyerUsername || null
  const displayName = registeredName || buyerName || null

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ข้อมูลผู้ซื้อ</h4>
      </div>
      <div className="card-body">
        {!buyerContactMasked ? (
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
                  <p className="text-default-400 text-xs">
                    {registeredName ? 'ผู้ซื้อที่ลงทะเบียนแล้ว' : 'ชื่อที่ร้านบันทึก'}
                  </p>
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
                    {/* mask แล้วจาก server (S-C1) — แสดงเฉพาะ 4 ตัวท้าย */}
                    {buyerContactMasked}
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
