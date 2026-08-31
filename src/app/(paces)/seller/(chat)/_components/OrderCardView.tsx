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
import { APPOINTMENT_STAGE_META, deriveAppointmentStage } from '@/lib/appointment-stage'
import { isAllDayAppointment } from '@/lib/appointments'
import { formatDateTH, formatTimeHM } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { canEditOrder } from '@/lib/order-display'

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
    /** เวลาของ "ขากลับ" — แถวที่ 2 ของ stepper อ่านจากสองช่องนี้ (null = ขนส่งไม่ได้แจ้ง) */
    returnStartedAt?: string | null
    returnedAt?: string | null
  } | null
  /** 'SHIPPED' | 'NO_SHIPPING' — NO_SHIPPING = งานไม่มีการส่งของ ไม่แสดง stepper (ห้ามเช็ค Order.type
   *  — ดู src/lib/iship/eligibility.ts) · ไม่ส่งมา (caller เก่า) = ปฏิบัติเหมือน SHIPPED */
  fulfillmentMode?: string
  /** ช่วงเวลานัด + สถานะนัด (feature 00024) — ไม่ส่งมา/null = ใบนี้ไม่มีนัด (walk-in)
   *  มีนัด = การ์ดแสดงแกน "นัดถึงขั้นไหน" แทนแกนพัสดุ (user report 2026-08-08) */
  serviceStart?: string | null
  serviceEnd?: string | null
  appointmentStatus?: string | null
  /** ยอดมัดจำที่ตกลงกันไว้ — ระบบไม่รู้ว่าจ่ายแล้วหรือยัง จึงแสดงได้แค่จำนวน ห้ามทำเป็นสถานะ */
  depositAmount?: string | null
  paymentMethod?: string | null
  codReceivedAt?: string | null
  /** Order.updatedAt ISO — ใช้เป็น `now` ตอนเรียก deriveOrderStage เพื่อปิด age-decay (ชิปในการ์ด
   *  ไม่หมดอายุ ต่างจากป้ายในรายการแชทโดยเจตนา — การ์ดว่างเปล่ากลางคันแย่กว่าป้ายค้าง) */
  statusAt?: string
  /**
   * Shop.vertical ของร้านเจ้าของใบนี้ — ตัวผันคำทั้งการ์ด (`ORDER_VOCAB`)
   *
   * อยู่ใน `data` ไม่ใช่ prop แยก เพราะการ์ดใบนี้ถูกเรนเดอร์ทั้งฝั่งร้าน (ซึ่งรู้ร้านที่ active อยู่แล้ว)
   * และฝั่ง**ลูกค้า**ในแอป Deep (ซึ่งไม่รู้อะไรเลยนอกจากสิ่งที่มากับการ์ด) — ผูกไว้กับตัวใบจึงเป็น
   * ทางเดียวที่ทั้งสองฝั่งพูดคำเดียวกันได้. ไม่ส่งมา/ค่าไม่รู้จัก → ชุดคำ ONLINE_SALES ตามเดิม
   */
  vertical?: string | null
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
    {
      status: data.status,
      statusAt,
      labelPrintedAt: null,
      carrierStatus: null,
      hasShipment: false,
      // ร้านคิวงาน/บ้านพักไม่ได้เรียกใบของตัวเองว่า "สั่งซื้อแล้ว" (user report 2026-08-12)
      vertical: data.vertical,
    },
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

  /**
   * ใบที่มีนัด — แสดงแกน "นัดถึงขั้นไหน" แทนสถานะออเดอร์ทั่วไป (2026-08-08)
   *
   * ต้องมาก่อนสาขา NO_SHIPPING เดิม เพราะออเดอร์บริการเข้าเงื่อนไขนั้นด้วย แล้วจะได้แค่
   * ชิปสถานะออเดอร์กว้าง ๆ ทั้งที่ข้อมูลที่ร้านอยากเห็นคือ "นัดวันไหน กี่โมง ถึงขั้นไหนแล้ว"
   *
   * ตัดสินจาก "มีข้อมูลนัดส่งมาไหม" ไม่ใช่จาก vertical — สอดคล้องกับที่สาขาข้างล่างตัดสินจาก
   * fulfillmentMode ไม่ใช่ Order.type (การ์ดนี้ถูกใช้จากหลาย caller ที่รู้ข้อมูลไม่เท่ากัน)
   */
  const apptStage = deriveAppointmentStage({
    serviceStart: data.serviceStart ?? null,
    appointmentStatus: data.appointmentStatus ?? null,
  })
  if (apptStage && data.serviceStart) {
    const meta = APPOINTMENT_STAGE_META[apptStage]
    const s = new Date(data.serviceStart)
    const e = data.serviceEnd ? new Date(data.serviceEnd) : null
    const when =
      Number.isNaN(s.getTime())
        ? null
        : !e || Number.isNaN(e.getTime())
          ? formatDateTH(s)
          : isAllDayAppointment(s, e)
            ? `${formatDateTH(s)} · ทั้งวัน`
            : `${formatDateTH(s)} · ${formatTimeHM(s)}–${formatTimeHM(e)}`
    const deposit = Number(data.depositAmount ?? 0)
    return (
      <div className="bg-card px-4">
        <div className="border-default-200 border-t border-dashed py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-default-700 text-sm">วันเข้าใช้บริการ</span>
            <span
              className={`${meta.cls} inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-2xs font-medium`}
            >
              <Icon icon={meta.icon} className="text-sm" aria-hidden="true" />
              {meta.label}
            </span>
          </div>
          {when && <p className="text-default-900 mb-0 mt-1 text-sm font-medium">{when}</p>}
          {/* มัดจำเป็นข้อมูลเฉย ๆ ไม่ใช่สถานะ — ระบบไม่มีคอลัมน์บอกว่าจ่ายแล้วหรือยัง
              (ห้ามใส่สีเขียว/ไอคอนถูก ไม่งั้นเป็นการยืนยันสิ่งที่เราไม่รู้) */}
          {/* คำเดียวกับที่การ์ดในแถบสถานะแชทใช้ — ระบบไม่รู้ว่าจ่ายแล้วหรือยัง จึงพูดได้แค่
              "ตกลงไว้เท่าไหร่" ห้ามใช้คำที่อ่านได้ว่าเป็นใบเสร็จ */}
          {deposit > 0 && (
            <p className="text-default-700 mb-0 mt-0.5 text-xs">
              มัดจำที่ตกลงไว้ ฿{deposit.toLocaleString('th-TH')}
            </p>
          )}
        </div>
      </div>
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
      /* prop นี้ optional มาแต่เดิม (คอมเมนต์บรรทัด ~113: caller รู้ข้อมูลไม่เท่ากัน) —
         ไม่รู้ = ถอยไปพฤติกรรมเดิมก่อน feature 00062 คือถือว่าเป็นออเดอร์ที่ส่งของ
         ไม่ใช่เดาว่าเป็นนัดรับ (เดาผิดทางนั้นจะซ่อนสถานะพัสดุของใบที่ส่งจริง) */
      fulfillmentMode: data.fulfillmentMode ?? 'SHIPPED',
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
        <ShipmentStepper
          shipmentStatus={sh.status ?? 'CREATED'}
          carrierStatus={sh.carrierStatus ?? null}
          returnStartedAt={sh.returnStartedAt ?? null}
          returnedAt={sh.returnedAt ?? null}
          size="md"
        />
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
}: {
  data: OrderCardViewData
  /** แตะ body → เปิดโมดัลแก้ไข (ไม่ใส่ = การ์ดไม่คลิก เช่นฝั่ง buyer) */
  onEdit?: () => void
  /** action ท้ายการ์ด — ส่งเข้าแชท / เปิดดูใบนี้ (caller ใส่เอง; คำมาจาก ORDER_VOCAB.viewLabel) */
  footer?: React.ReactNode
  className?: string
}) {
  /**
   * ชื่อเรียกรายการตามประเภทกิจการ — resolve จาก `data.vertical` ไม่ใช่รับ noun เป็น prop
   * และไม่ใช่อ่านจาก DraftOrderProvider: การ์ดใบนี้ตั้งใจให้ใช้ซ้ำนอกกล่องแชทได้ (ดู onEdit —
   * "ไม่ใส่ = การ์ดไม่คลิก เช่นฝั่ง buyer") การผูกกับ context ของแชทจะพังทันทีที่ใช้ตามเจตนานั้น
   */
  const orderNoun = resolveOrderVocab(data.vertical ?? '').noun
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
      {onEdit && canEditOrder(data.status) ? (
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
