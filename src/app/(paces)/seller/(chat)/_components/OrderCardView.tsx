'use client'

/**
 * OrderCardView — การ์ดคำสั่งซื้อแบบเดียวกันทั้งในแชท (message bubble) และแท็บคำสั่งซื้อ (right panel)
 * user request 2026-07-25: การ์ด 2 ที่ต้องหน้าตาเหมือนกัน + กดแล้วเปิดโมดัลแก้ไขเหมือนกัน → shared
 * component กัน drift. style: Paces token น้ำเงิน (HR7, ไม่ใช่เขียวตาม ref)
 *
 * โครง: หัวน้ำเงิน (ชื่อสินค้า + "คำสั่งซื้อ · #เลข") → รายการสินค้า (รูป/ชื่อ/จำนวน/ราคา) →
 * รายการรวม + ยอดสุทธิ → footer (action ที่ caller ใส่เอง: ส่งเข้าแชท / ดูคำสั่งซื้อ)
 * onEdit = แตะตัวการ์ด (ส่วน body) เปิดโมดัลแก้ไข; footer เป็น action แยก (stopPropagation ที่ caller)
 */
import Icon from '@/components/wrappers/Icon'

export type OrderCardViewData = {
  token: string
  orderNo?: string | null // เลขคำสั่งซื้ออ่านง่าย DP… (user 2026-07-25) — null สำหรับข้อมูลเก่าก่อน backfill
  status: string
  totalAmount: string // "1234.00"
  items: { name: string; qty: number; price: string; imageFileId: string | null }[]
  /** พัสดุ iShip ที่เปิดแล้ว (feature 00022) — ไม่ส่งมา = ไม่แสดงแถวนี้ */
  shipment?: { trackingNo: string | null; courierName: string | null } | null
}

export default function OrderCardView({
  data,
  onEdit,
  footer,
  className = '',
}: {
  data: OrderCardViewData
  /** แตะ body → เปิดโมดัลแก้ไข (ไม่ใส่ = การ์ดไม่คลิก เช่นฝั่ง buyer) */
  onEdit?: () => void
  /** action ท้ายการ์ด — ส่งเข้าแชท / ดูคำสั่งซื้อ (caller ใส่เอง) */
  footer?: React.ReactNode
  className?: string
}) {
  const title = data.items[0]?.name ?? 'คำสั่งซื้อ'
  // เลขคำสั่งซื้อ DP… (fallback โค้ด 8 หลักของ token สำหรับข้อมูลเก่าที่ยังไม่ backfill)
  const displayNo = data.orderNo || data.token.slice(0, 8).toUpperCase()
  const priceLabel = `฿${Number(data.totalAmount).toLocaleString('th-TH')}`

  const body = (
    <>
      {/* หัวการ์ด — Paces primary (น้ำเงิน) + เลขคำสั่งซื้อ */}
      <div className="bg-primary flex items-center gap-2.5 px-4 py-3 text-white">
        <Icon icon="receipt-2" className="shrink-0 text-2xl" />
        <div className="min-w-0">
          <p className="mb-0 truncate text-sm font-semibold">{title}</p>
          <p className="mb-0 truncate text-2xs opacity-90">คำสั่งซื้อ · {displayNo}</p>
        </div>
      </div>
      {/* รายการสินค้า + รวม + ยอดสุทธิ */}
      <div className="bg-card px-4 py-3">
        <div className="space-y-2">
          {data.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="bg-default-100 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
                {it.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${it.imageFileId}`} alt={it.name} className="size-full object-cover" />
                ) : (
                  <Icon icon="photo" className="text-default-400 text-base" />
                )}
              </span>
              <span className="text-default-700 min-w-0 flex-1 truncate">{it.name}</span>
              <span className="text-default-400 shrink-0 text-2xs">x{it.qty}</span>
              <span className="text-default-800 shrink-0 font-medium">฿{Number(it.price).toLocaleString('th-TH')}</span>
            </div>
          ))}
        </div>
        <div className="border-default-200 my-2.5 border-t border-dashed" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-default-500">รายการ</span>
          <span className="text-default-800 font-semibold">{data.items.length} รายการ</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-default-500">ยอดสุทธิ</span>
          <span className="text-primary font-bold">{priceLabel}</span>
        </div>
        {/* พัสดุที่เปิดแล้ว (feature 00022) — เขียวเพราะเป็นสิ่งที่เกิดขึ้นจริงแล้ว ไม่ใช่สถานะรอ */}
        {data.shipment?.trackingNo && (
          <div className="border-default-200 mt-2.5 flex items-center justify-between gap-2 border-t border-dashed pt-2 text-xs">
            <span className="text-default-500">พัสดุ</span>
            <span className="text-success min-w-0 truncate font-semibold">
              {data.shipment.courierName ? `${data.shipment.courierName} · ` : ''}
              {data.shipment.trackingNo}
            </span>
          </div>
        )}
      </div>
    </>
  )

  return (
    // ความกว้างมาจาก className ของ caller (แชท=w-64 พอดี bubble, right panel=w-full เต็มคอลัมน์)
    <div className={`border-default-200 overflow-hidden rounded-lg border ${className}`}>
      {/* แตะเพื่อแก้ไขได้เฉพาะออเดอร์ที่ยังรอดำเนินการ — ตรงกับกฎเดียวกับปุ่มแก้ไขในหน้ารายการ/รายละเอียด
          และกับ guard ใน updateOrder. เดิมเปิดโมดัลได้ทุกสถานะ แล้วไปเด้ง error ตอนกดบันทึก */}
      {onEdit && data.status === 'PENDING' ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`แก้ไขคำสั่งซื้อ ${title}`}
          className="hover:bg-default-50 block w-full cursor-pointer text-start transition-colors"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {footer}
    </div>
  )
}
