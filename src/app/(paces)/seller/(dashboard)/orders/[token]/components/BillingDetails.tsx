/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/BillingDetails.tsx
 *
 * copy จากธีม: `card-header` + `card-body` + รายการคู่ label/ค่า
 *
 * ตัดจากธีม:
 *   - รูปบัตรเครดิต Mastercard — ระบบไม่มีการชำระด้วยบัตร (โอน/พร้อมเพย์/เก็บปลายทาง เท่านั้น)
 *   - badge "Billing Details" ที่ซ้ำกับหัวการ์ดตัวเอง
 *   - ปุ่มดินสอที่หัวการ์ด — ไม่มีหน้าแก้ข้อมูลชำระเงินแยก
 *
 * ที่เพิ่ม: สถานะการชำระเงิน (getPaymentBadge — SSOT ที่คุมกฎ Verified-Means-Green อยู่แล้ว
 * เขียวเฉพาะ "ชำระแล้ว" จริง) · ช่องทางการขาย · สลิปโอนเงิน
 *
 * คอนทราสต์: ธีมใช้ `text-default-400` ทั้งการ์ด (2.46:1 ตก AA) และ badge เขียวทึบที่ไม่ใช่
 * token คู่หมึก → ใช้ `text-default-700`/`-800` และ badge จาก SSOT ที่ผ่าน AA แล้ว
 */

import Icon from '@/components/wrappers/Icon'
import { getPaymentBadge } from '@/lib/order-display'
import { formatDateTime } from '@/lib/format-date'
import { ORDER_PAYMENT_KIND_LABEL, type OrderPaymentKind } from '@/lib/order-payment'
import SalesChannelBadge from '@/components/safepay/SalesChannelBadge'
import { PAYMENT_LABELS, PAYMENT_ICONS } from '../../components/data'
import SlipViewer from './SlipViewer'

export type BillingDetailsProps = {
  status: string
  paymentMethod: string | null
  salesChannel: string | null
  slipFileId: string | null
  /**
   * feature 00062 — ISO ของเวลาที่ร้านกด "ได้รับเงินแล้ว" เอง (TRANSFER/PROMPTPAY/CASH)
   * null = ยังไม่ได้กด/ไม่ใช่วิธีชำระที่ร้านยืนยันเองได้ — ส่งเข้า getPaymentBadge ตัวเดียวกับ
   * ที่ status/paymentMethod/slipFileId ใช้ (SSOT เดียว, SDS TD-003)
   */
  paymentConfirmedAt: string | null
  /**
   * เงินที่ **ได้รับจริง** ของใบนี้ (feature 00050) · null = ไม่มีเรื่องเงินให้พูดถึง
   *
   * 🛑 ทำไมต้องมีที่นี่ (ปุ่มรับเงินย้ายมาอยู่บนจอนี้ด้วยแล้ว 2026-08-31): ก่อนหน้านี้จอนี้บอกได้แค่ "มีสลิปไหม"
   * ขณะที่ **หน้า `/o/[token]` ของลูกค้าบอกยอดที่รับแล้วและยอดค้าง** ⇒ ร้านรู้น้อยกว่าลูกค้า
   * บนจอของตัวเอง ซึ่งเป็นสภาพที่ผู้ขายต้องเปิดแชทหาทุกครั้งที่ลูกค้าถาม
   */
  money: {
    totalAmount: number
    depositAgreed: number
    totalReceived: number
    outstanding: number
    fullyPaid: boolean
    hasDeposit: boolean
    entries: { kind: string; amount: number; method: string; note: string | null; receivedAtIso: string; voided: boolean }[]
  } | null
  /**
   * ชุดเต็มของร้านบริการ — **ใช้ตัดสิน *ป้าย* เท่านั้น** ส่วน `money` ข้างบนใช้แสดง *บล็อกเงิน*
   *
   * 🛑 สองตัวนี้ไม่เท่ากันโดยตั้งใจ: `money` กั้นเพิ่มด้วย `hasMoneyStory()` (ยังไม่ตกลงมัดจำและ
   * ยังไม่รับเงินเลย = ไม่มีอะไรให้เล่า ⇒ ไม่ขึ้นบล็อก AC-SQ-07) แต่ **ป้ายต้องพูดความจริงเสมอ**
   * แม้ในใบที่ยังไม่มีเรื่องเงินให้เล่า — ซึ่งคือใบที่ป้ายเดิมโกหกว่า "ชำระแล้ว" พอดี
   *
   * `null`/ไม่ส่ง = ร้านที่ไม่มีบัญชีเงิน (ONLINE_SALES / LODGING) ⇒ ป้ายเดิมทุกประการ
   */
  serviceMoney?: { totalAmount: number; totalReceived: number; outstanding: number } | null
}

const baht = (n: number) =>
  `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BillingDetails({
  status,
  paymentMethod,
  salesChannel,
  slipFileId,
  paymentConfirmedAt,
  money,
  serviceMoney = null,
}: BillingDetailsProps) {
  // มีเรื่องเงินให้พูดถึง = ถือว่ามีข้อมูลการชำระ แม้ยังไม่ได้ระบุวิธีชำระ/ช่องทาง
  const hasPaymentInfo = paymentMethod !== null || salesChannel !== null || money !== null
  /* 🛑 ส่ง `serviceMoney` เข้าไปด้วย — บัญชีเงินชนะ `Order.status` เมื่อร้านมีบัญชี
     (ดูเหตุผลเต็มที่พารามิเตอร์ `money` ของ getPaymentBadge) ร้านที่ไม่มีบัญชีส่ง undefined
     ⇒ ป้ายเดิมไม่ขยับสักพิกเซล */
  const paymentBadge = getPaymentBadge(status, paymentMethod, slipFileId, paymentConfirmedAt, serviceMoney ?? undefined)
  const paymentIcon = paymentMethod ? (PAYMENT_ICONS[paymentMethod] ?? 'wallet') : 'credit-card-off'
  const paymentLabel = paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'ยังไม่ระบุวิธีชำระ'

  return (
    <div className="card">
      <div className="card-header">
        {/* 🛑 ชื่อการ์ดต้องไม่ชนกับ `PaymentReceivedCard` ซึ่งใช้ชื่อ "การชำระเงิน" ตาม
            00062 UX §A3 (1) — วัดจอจริง 2026-08-31: ออเดอร์ขายออนไลน์ที่ไม่ใช่ COD ขึ้น
            การ์ดชื่อ **"การชำระเงิน" ซ้ำกัน 2 ใบ** ในหน้าเดียวมาตลอด (ของเดิม ไม่ใช่ของใหม่)
            ใบนั้นเป็นการ์ด *การกระทำ* (กดยืนยันรับเงิน/ยกเลิก) ส่วนใบนี้เป็น *รายละเอียด*
            (วิธีชำระ · ช่องทาง · สลิป · เงินที่รับแล้ว) ชื่อจึงต้องบอกความต่างนั้น */}
        <h4 className="card-title">รายละเอียดการชำระเงิน</h4>
      </div>
      <div className="card-body">
        {!hasPaymentInfo ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="credit-card-off" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
            <p className="text-default-700 text-sm">ไม่มีข้อมูลการชำระเงิน</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            <li>
              <p className="text-default-800 mb-0.5 text-2xs">วิธีชำระ</p>
              <p className="text-default-900 mb-0 flex items-center gap-1.5 text-sm font-medium">
                <Icon icon={paymentIcon} className="text-default-700 text-sm" aria-hidden="true" />
                {paymentLabel}
              </p>
            </li>
            {paymentBadge && (
              <li>
                <p className="text-default-800 mb-1 text-2xs">สถานะ</p>
                <span className={paymentBadge.cls}>{paymentBadge.label}</span>
              </li>
            )}
            {salesChannel && (
              <li>
                <p className="text-default-800 mb-1 text-2xs">ช่องทางการขาย</p>
                <SalesChannelBadge channel={salesChannel} />
              </li>
            )}
            {slipFileId && (
              <li>
                <p className="text-default-800 mb-1 text-2xs">สลิปโอนเงิน</p>
                <SlipViewer slipFileId={slipFileId} />
              </li>
            )}
            {money && (
              <li>
                {/* 🛑 "รับแล้ว/ค้าง" คนละบรรทัดกับ "มัดจำที่ตกลงไว้" เสมอ — สองอันตอบคนละคำถาม
                    (ข้อตกลง vs ข้อเท็จจริง · BR-SQ-02) ห้ามยุบรวมเป็นบรรทัดเดียว */}
                <p className="text-default-800 mb-1 text-2xs">เงินที่รับแล้ว</p>
                <div className="bg-default-100 rounded-lg p-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-success-ink text-sm font-semibold tabular-nums">
                      {baht(money.totalReceived)}
                    </span>
                    <span
                      className={`text-2xs font-medium ${
                        money.fullyPaid ? 'text-success-ink' : 'text-warning-ink'
                      }`}
                    >
                      {money.fullyPaid ? 'ครบแล้ว' : `ค้าง ${baht(money.outstanding)}`}
                    </span>
                  </div>
                  {money.hasDeposit && (
                    <p className="text-default-600 mb-0 mt-1.5 border-t border-dashed pt-1.5 text-2xs">
                      มัดจำที่ตกลงไว้ {baht(money.depositAgreed)}
                    </p>
                  )}
                  {money.entries.length === 0 ? (
                    /* ห้ามเขียนว่า "ยังไม่ได้จ่าย" — ระบบรู้แค่ว่ายังไม่มีใครกดยืนยัน */
                    <p className="text-default-600 mb-0 mt-1.5 text-2xs">
                      ยังไม่มีใครกดยืนยันรับเงิน — กดปุ่ม &ldquo;รับเงินแล้ว&rdquo; ได้ที่แถบด้านล่าง
                    </p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {money.entries.map((e, k) => (
                        <li
                          key={k}
                          className={`flex items-baseline gap-1.5 text-2xs ${
                            e.voided ? 'text-default-400' : 'text-default-700'
                          }`}
                        >
                          <span className={`tabular-nums font-medium ${e.voided ? 'line-through' : ''}`}>
                            {baht(e.amount)}
                          </span>
                          <span>{ORDER_PAYMENT_KIND_LABEL[e.kind as OrderPaymentKind] ?? e.kind}</span>
                          <span className="ms-auto">{formatDateTime(new Date(e.receivedAtIso))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
