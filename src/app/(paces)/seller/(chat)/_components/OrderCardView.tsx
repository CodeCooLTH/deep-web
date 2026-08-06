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
import ShipmentStepper from './ShipmentStepper'
import { courierLogoUrl } from '@/lib/iship/courier'
import { deriveOrderStage } from '@/lib/order-stage'
import { orderShippingStage } from '@/lib/chat-order-progress'
import { pacesToast } from '@/lib/paces-toast'

export type OrderCardViewData = {
  token: string
  orderNo?: string | null // เลขคำสั่งซื้ออ่านง่าย DP… (user 2026-07-25) — null สำหรับข้อมูลเก่าก่อน backfill
  status: string
  totalAmount: string // "1234.00"
  items: { name: string; qty: number; price: string; imageFileId: string | null }[]
  /** พัสดุ iShip ที่เปิดแล้ว (feature 00022) — ขยาย 2026-08-05 (Order Progress): status/carrierStatus/
   *  courierCode ให้ section พัสดุแสดง timeline 4 ขั้น + โลโก้ขนส่งได้ ไม่ใช่แค่บรรทัดเลข */
  shipment?: {
    trackingNo: string | null
    courierName: string | null
    courierCode?: string | null
    status?: string
    carrierStatus?: string | null
  } | null
  /** 'SHIPPED' | 'NO_SHIPPING' — NO_SHIPPING = งานไม่มีการส่งของ ไม่แสดง stepper (ห้ามเช็ค Order.type
   *  — ดู src/lib/iship/eligibility.ts) · ไม่ส่งมา (caller เก่า) = ปฏิบัติเหมือน SHIPPED */
  fulfillmentMode?: string
  paymentMethod?: string | null
  codReceivedAt?: string | null
  /** Order.updatedAt ISO — ใช้เป็น `now` ตอนเรียก deriveOrderStage เพื่อปิด age-decay (ชิปในการ์ด
   *  ไม่หมดอายุ ต่างจากป้ายในรายการแชทโดยเจตนา — การ์ดว่างเปล่ากลางคันแย่กว่าป้ายค้าง) */
  statusAt?: string
}

/**
 * ShipmentSection — สถานะการส่งท้ายการ์ด (งาน Order Progress 2026-08-05)
 *
 * แทนบรรทัด "พัสดุ · Flash · TH…" เดิม ด้วย timeline 4 ขั้น + โลโก้ขนส่ง + ปุ่มคัดลอก
 * ลำดับเงื่อนไข (ux spec 2026-08-05): ยกเลิก → ไม่มีการส่งของ (fulfillmentMode — ห้ามเช็ค
 * Order.type ดู lib/iship/eligibility.ts) → มีพัสดุ → ยังไม่มีพัสดุ
 *
 * Base: src/components/safepay/iship/ShipmentStatusView.tsx (โครง head + handleCopy)
 */
function ShipmentSection({ data }: { data: OrderCardViewData }) {
  // ชิปสถานะออเดอร์ — label/icon/cls ชุดเดียวกับป้ายในรายการแชท (ORDER_STAGE_META) แต่ปิด
  // age-decay ด้วยการล็อก now = statusAt: ป้ายในลิสต์หายได้ (กันรก) แต่ชิปในการ์ดหายแล้ว
  // เหลือช่องว่างเปล่า — statusAt ไม่มี (caller เก่า) age = 0 เหมือนกัน จึงไม่มีทางโดนซ่อน
  const statusAt = data.statusAt ?? new Date(0).toISOString()
  const stage = deriveOrderStage(
    { status: data.status, statusAt, labelPrintedAt: null, carrierStatus: null, hasShipment: false },
    Date.parse(statusAt),
  )
  const stageChip = stage && (
    <span className={`${stage.cls} inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-2xs font-medium`}>
      <Icon icon={stage.icon} className="text-sm" aria-hidden="true" />
      {stage.label}
    </span>
  )

  // ยกเลิก = จบ ไม่มี timeline (stage คืน CANCELLED ภายใน 1 วัน แต่ล็อก age=0 แล้วจึงได้เสมอ)
  if (data.status === 'CANCELLED') {
    return (
      <div className="bg-card px-4"><div className="border-default-200 border-t border-dashed py-2.5">{stageChip}</div></div>
    )
  }

  // งานที่ไม่มีการส่งของ (ขายหน้าร้าน/บริการ/จอง) — สถานะออเดอร์พอ ไม่มีขั้นตอนพัสดุให้ไล่
  if (data.fulfillmentMode === 'NO_SHIPPING') {
    return (
      <div className="bg-card px-4">
        <div className="border-default-200 flex items-center justify-between gap-2 border-t border-dashed py-2.5">
          <span className="text-default-700 text-sm">สถานะ</span>
          {stageChip}
        </div>
      </div>
    )
  }

  const sh = data.shipment
  // caller เก่าที่ยังไม่ส่ง status มา (shipment มีแต่เลข) → แสดงแบบบรรทัดเดิม ไม่เดา stepper
  if (sh?.trackingNo && sh.status == null) {
    return (
      <div className="bg-card px-4">
        <div className="border-default-200 flex items-center justify-between gap-2 border-t border-dashed py-2.5 text-xs">
        <span className="text-default-700">พัสดุ</span>
        <span className="text-success min-w-0 truncate font-semibold">
          {sh.courierName ? `${sh.courierName} · ` : ''}
          {sh.trackingNo}
        </span>
        </div>
      </div>
    )
  }

  // ยังไม่มีพัสดุ (หรือใบล่าสุดสร้างไม่สำเร็จ) — บอกสถานะออเดอร์แทน
  if (!sh || sh.status === 'FAILED') {
    return (
      <div className="bg-card px-4">
        <div className="border-default-200 flex items-center justify-between gap-2 border-t border-dashed py-2.5">
          <span className="text-default-700 text-sm">สถานะ</span>
          {stageChip}
        </div>
      </div>
    )
  }

  const logoUrl = courierLogoUrl(sh.courierCode, sh.courierName)
  // COD ส่งถึงแล้วแต่ยังไม่กดรับเงิน — stepper ขึ้นเขียวเต็ม (ของถึงจริง) แต่ใบยังค้างในแถบงาน
  // จึงต้องบอกเหตุผลตรงนี้ ไม่งั้นร้านงงว่า "เขียวแล้วทำไมยังไม่จบ"
  const awaitingCod =
    orderShippingStage({
      status: data.status,
      paymentMethod: data.paymentMethod,
      codReceivedAt: data.codReceivedAt,
      shipment: { status: sh.status ?? 'CREATED', carrierStatus: sh.carrierStatus ?? null },
    }) === 'AWAITING_COD'

  async function handleCopy() {
    if (!sh?.trackingNo) return
    try {
      await navigator.clipboard.writeText(sh.trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      // clipboard ต้องการ https — dev ที่ไม่ใช่ https จะล้ม ให้บอกตามตรง (เหมือน ShipmentStatusView)
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  return (
    <div className="bg-card px-4">
      <div className="border-default-200 border-t border-dashed py-2.5">
      <div className="flex items-center gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={sh.courierName ?? 'ขนส่ง'} className="size-8.5 shrink-0 rounded-lg object-contain" />
        ) : (
          <span className="bg-default-100 text-default-700 flex size-8.5 shrink-0 items-center justify-center rounded-lg">
            <Icon icon="truck-delivery" className="text-base" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {sh.courierName && <p className="text-default-700 mb-0 truncate text-2xs">{sh.courierName}</p>}
          <p className="text-default-900 mb-0 truncate text-xs font-bold tabular-nums">{sh.trackingNo ?? '—'}</p>
        </div>
        {sh.trackingNo && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="คัดลอกเลขพัสดุ"
            className="btn btn-sm btn-icon text-default-700 hover:bg-default-100 shrink-0"
          >
            <Icon icon="copy" className="text-base" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-1.5">
        <ShipmentStepper shipmentStatus={sh.status ?? 'CREATED'} carrierStatus={sh.carrierStatus ?? null} size="md" />
      </div>
      {awaitingCod && (
        <p className="bg-info/15 text-info-ink mb-0 mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-2xs">
          <Icon icon="cash" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>ส่งถึงแล้ว — รอยืนยันรับเงินปลายทาง</span>
        </p>
      )}
      </div>
    </div>
  )
}

export default function OrderCardView({
  data,
  onEdit,
  footer,
  className = '',
  orderNoun = 'คำสั่งซื้อ',
}: {
  data: OrderCardViewData
  /** แตะ body → เปิดโมดัลแก้ไข (ไม่ใส่ = การ์ดไม่คลิก เช่นฝั่ง buyer) */
  onEdit?: () => void
  /** action ท้ายการ์ด — ส่งเข้าแชท / ดูคำสั่งซื้อ (caller ใส่เอง) */
  footer?: React.ReactNode
  className?: string
  /**
   * ชื่อเรียกรายการตามประเภทกิจการ (ORDER_VOCAB.noun) — "คำสั่งซื้อ" / "การเข้ารับบริการ" / "บิลเข้าพัก"
   *
   * รับเป็น prop ไม่ใช่อ่านจาก DraftOrderProvider โดยตรง เพราะการ์ดใบนี้ตั้งใจให้ใช้ซ้ำนอกกล่องแชทได้
   * (ดู onEdit — "ไม่ใส่ = การ์ดไม่คลิก เช่นฝั่ง buyer") การผูกกับ context ของแชทจะทำให้พังทันที
   * ที่มีคนเอาไปใช้จริงตามเจตนานั้น
   */
  orderNoun?: string
}) {
  const title = data.items[0]?.name ?? orderNoun
  // เลขคำสั่งซื้อ DP… (fallback โค้ด 8 หลักของ token สำหรับข้อมูลเก่าที่ยังไม่ backfill)
  const displayNo = data.orderNo || data.token.slice(0, 8).toUpperCase()
  const priceLabel = `฿${Number(data.totalAmount).toLocaleString('th-TH')}`

  const body = (
    <>
      {/* หัวการ์ด — Paces primary (น้ำเงิน) + เลขคำสั่งซื้อ */}
      <div className="bg-primary flex items-center gap-2.5 px-4 py-2.5 text-white">
        <Icon icon="receipt-2" className="shrink-0 text-2xl" />
        <div className="min-w-0">
          <p className="mb-0 truncate text-sm font-semibold">{title}</p>
          <p className="mb-0 truncate text-2xs opacity-90">{orderNoun} · {displayNo}</p>
        </div>
      </div>
      {/* รายการสินค้า + รวม + ยอดสุทธิ */}
      <div className="bg-card px-4 py-2.5">
        <div className="space-y-1.5">
          {data.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="bg-default-100 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
                {it.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${it.imageFileId}`} alt={it.name} className="size-full object-cover" />
                ) : (
                  <Icon icon="photo" className="text-default-700 text-base" />
                )}
              </span>
              <span className="text-default-700 min-w-0 flex-1 truncate">{it.name}</span>
              <span className="text-default-700 shrink-0 text-2xs">x{it.qty}</span>
              <span className="text-default-800 shrink-0 font-medium">฿{Number(it.price).toLocaleString('th-TH')}</span>
            </div>
          ))}
        </div>
        <div className="border-default-200 my-2 border-t border-dashed" />
        {/* แถว "รายการ N รายการ" ถูกตัด (user 2026-08-06 ขอ compact) — จำนวนนับได้จากลิสต์ข้างบนเอง */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-default-700">ยอดสุทธิ</span>
          <span className="text-primary font-bold">{priceLabel}</span>
        </div>
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
          aria-label={`แก้ไข${orderNoun} ${title}`}
          className="hover:bg-default-50 block w-full cursor-pointer text-start transition-colors"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {/* section พัสดุอยู่นอกปุ่มแก้ไขโดยเจตนา — ข้างในมีปุ่มคัดลอกเลขพัสดุ ถ้าอยู่ใต้ <button>
          จะเป็น nested interactive (invalid HTML + focus พัง) */}
      <ShipmentSection data={data} />
      {footer}
    </div>
  )
}
