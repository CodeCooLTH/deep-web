/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * ปรับจาก Paces CustomerDetails (theme fidelity — 2026-06-16):
 * - เพิ่ม avatar: แสดง <Image> เมื่อมี avatar URL; fallback initial-letter circle (bg-primary/15);
 *   fallback สุดท้าย tabler:user icon circle เมื่อไม่มีทั้งชื่อและ avatar
 * - buyerContact mask ที่ server boundary (S-C1) — component รับ buyerContactMasked เท่านั้น
 * - ลบ: pencil/edit btn (ไม่มี feature), ธงชาติ, "Since 20XX", kebab Share/Edit/Block/Delete,
 *   email row, location row — ไม่มีข้อมูลเหล่านี้ใน schema SafePay
 * - คง: card layout, icon-list pattern (btn btn-icon bg-light size-6! rounded-full),
 *   empty-state ที่ชัดเจนเมื่อ buyerContactMasked null
 * - 2026-06-16: inline ShippingAddressData (เดิมอยู่ใน ShippingAddress.tsx ที่ลบแล้ว) + shipping block
 *   render ที่อยู่จัดส่งหลัง buyer section ไม่ว่าผู้ซื้อจะยืนยันแล้วหรือไม่ (shippingAddr อิสระ)
 */

import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'

/** type ที่อยู่จัดส่ง — inline ที่นี่หลัง ShippingAddress.tsx ถูกลบ; page.tsx import จากที่นี่ */
export type ShippingAddressData = {
  line1?: string | null
  subdistrict?: string | null
  district?: string | null
  province?: string | null
  postcode?: string | null
  note?: string | null
}

export type CustomerDetailsData = {
  /** เบอร์/อีเมลผู้ซื้อที่ mask แล้วจาก server (S-C1) — ห้ามส่ง raw ข้าม RSC boundary */
  buyerContactMasked: string | null
  buyerDisplayName: string | null
  buyerUsername: string | null
  /** ชื่อที่ร้านบันทึกตอนสร้างออเดอร์ (buyer อาจยังไม่ลงทะเบียน) */
  buyerName: string | null
  /** avatar URL (Facebook CDN / null) — ไม่ใช่ PII เพราะเป็น URL สาธารณะ */
  avatar: string | null
  /** ที่อยู่จัดส่ง — render อิสระจาก buyer-confirmed state (seller อาจใส่ก่อน buyer ยืนยัน) */
  shippingAddr: ShippingAddressData | null
}

interface CustomerDetailsProps {
  data: CustomerDetailsData
}

const CustomerDetails = ({ data }: CustomerDetailsProps) => {
  const {
    buyerContactMasked,
    buyerDisplayName,
    buyerUsername,
    buyerName,
    avatar,
    shippingAddr,
  } = data
  // ลำดับชื่อ: registered displayName/username > ชื่อที่ร้านบันทึก (buyerName)
  const registeredName = buyerDisplayName || buyerUsername || null
  const displayName = registeredName || buyerName || null

  // ประกอบบรรทัดที่อยู่ — ข้าม key ที่ว่าง
  // บรรทัด 2: ตำบล/แขวง + อำเภอ/เขต; บรรทัด 3: จังหวัด + รหัสไปรษณีย์
  const addrLine2 = shippingAddr
    ? [shippingAddr.subdistrict, shippingAddr.district].filter(Boolean).join(' ')
    : ''
  const addrLine3 = shippingAddr
    ? [shippingAddr.province, shippingAddr.postcode].filter(Boolean).join(' ')
    : ''
  const addrLines = shippingAddr
    ? [shippingAddr.line1, addrLine2, addrLine3].filter((l) => l && String(l).trim())
    : []

  return (
    <div className="card">
      <div className="card-header">
        {/* ลบ pencil/edit btn ออก — ไม่มี feature แก้ไขข้อมูลผู้ซื้อใน SafePay */}
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
            {/* avatar block — เหมือน theme: relative me-2.5 wrap รูปหรือ fallback */}
            <div className="mb-7.5 flex items-center">
              <div className="relative me-2.5">
                {avatar ? (
                  // กรณีมี avatar URL (Facebook CDN — ครอบคลุมใน next.config remotePatterns)
                  <Image
                    src={avatar}
                    alt={displayName ?? 'ผู้ซื้อ'}
                    width={44}
                    height={44}
                    className="size-11 rounded-full object-cover"
                  />
                ) : displayName ? (
                  // fallback: initial-letter circle เมื่อมีชื่อ
                  <div className="size-11 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-primary font-semibold text-base leading-none">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                ) : (
                  // fallback สุดท้าย: icon circle เมื่อไม่มีทั้งชื่อและ avatar
                  <div className="size-11 rounded-full bg-primary/15 flex items-center justify-center">
                    <Icon icon="user" className="text-lg text-primary" />
                  </div>
                )}
              </div>
              {displayName && (
                <div>
                  <h5 className="text-default-800 text-sm font-medium mb-0.5">{displayName}</h5>
                  <p className="text-default-400 text-xs">
                    {buyerUsername
                      ? `@${buyerUsername}`
                      : registeredName
                        ? 'ผู้ซื้อที่ลงทะเบียนแล้ว'
                        : 'ชื่อที่ร้านบันทึก'}
                  </p>
                </div>
              )}
            </div>
            {/* contact list — 1 row: เบอร์โทร (mask แล้ว) */}
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

        {/* ที่อยู่จัดส่ง — render อิสระจาก buyer-confirmed state (seller อาจกรอกก่อน buyer ยืนยัน) */}
        {shippingAddr && (
          <div className="border-t border-dashed border-default-300 mt-4 pt-4">
            <p className="text-xs text-default-400 mb-2">ที่อยู่จัดส่ง</p>
            <div className="flex items-start gap-2.5">
              <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full shrink-0 mt-0.5">
                <Icon icon="map-pin" className="text-sm" />
              </span>
              <div>
                {addrLines.length > 0 ? (
                  <p className="text-default-400 text-sm mb-0">
                    {addrLines.map((l, i) => (
                      <span key={i}>
                        {l}
                        {i < addrLines.length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="text-default-400 text-sm mb-0">—</p>
                )}
              </div>
            </div>
            {shippingAddr.note && shippingAddr.note.trim() && (
              <div className="bg-warning/15 rounded px-4 py-3 text-warning mt-3">
                <h6 className="mb-2.5 text-xs flex items-center gap-1.5">
                  <Icon icon="info-circle" className="text-sm" />
                  หมายเหตุการจัดส่ง
                </h6>
                <p className="italic mb-0">{shippingAddr.note}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CustomerDetails
