/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingAddress.tsx
 *
 * ปรับจาก Paces ShippingAddress (Phase B — restore card ที่เคย drop):
 * - ตัด: map iframe (ไม่มี geo), edit button, phone/email, "Primary Address" badge
 * - แทนด้วย shippingAddress JSON จริงจาก order ({line1, subdistrict, district, province, postcode, note})
 * - คง: card layout, address block, delivery-instructions warning box (= note)
 * - render เฉพาะเมื่อมี shippingAddress (caller เช็คก่อน mount)
 */

import Icon from '@/components/wrappers/Icon'

export type ShippingAddressData = {
  line1?: string | null
  subdistrict?: string | null
  district?: string | null
  province?: string | null
  postcode?: string | null
  note?: string | null
}

interface ShippingAddressProps {
  address: ShippingAddressData
}

const ShippingAddress = ({ address }: ShippingAddressProps) => {
  const { line1, subdistrict, district, province, postcode, note } = address

  // ประกอบบรรทัดที่อยู่ — ข้าม key ที่ว่าง (client strip ตอนสร้างแล้ว แต่กันไว้)
  // บรรทัด 2: ตำบล/แขวง + อำเภอ/เขต ; บรรทัด 3: จังหวัด + รหัสไปรษณีย์
  const line2 = [subdistrict, district].filter(Boolean).join(' ')
  const line3 = [province, postcode].filter(Boolean).join(' ')
  const lines = [line1, line2, line3].filter((l) => l && l.trim())

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ที่อยู่จัดส่ง</h4>
      </div>
      <div className="card-body">
        <div className="mb-0">
          {lines.length > 0 ? (
            <p className="text-default-400 mb-0">
              {lines.map((l, i) => (
                <span key={i}>
                  {l}
                  {i < lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-default-400 mb-0">—</p>
          )}
        </div>
        {note && note.trim() && (
          <div className="bg-warning/15 rounded px-4 py-3 text-warning mt-5">
            <h6 className="mb-2.5 text-xs flex items-center gap-1.5">
              <Icon icon="info-circle" className="text-sm" />
              หมายเหตุการจัดส่ง
            </h6>
            <p className="italic mb-0">{note}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ShippingAddress
