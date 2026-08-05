'use client'

/**
 * CodCard — "เก็บเงินปลายทาง" การ์ดเงินสำหรับออเดอร์ COD
 *
 * ทำไมแยกการ์ด แทนที่จะเป็นแถวหนึ่งในการ์ด "การชำระเงิน":
 * หลังของออกจากร้านไปแล้ว **การกดยืนยันว่าได้เงินคืองานเดียวที่เหลือของร้าน** และเป็นตัวเดียวที่
 * ปลดใบนี้ออกจากช่อง "รอเงิน COD" บนหน้าแรก — ฝังเป็นแถวเล็ก ๆ ในตารางเท่ากับซ่อนงานที่ค้างอยู่
 *
 * การ์ดนี้แทน BillingDetails ทั้งใบเมื่อเป็น COD (วิธีชำระ/สถานะ/ยอด ซ้ำกันทุกบรรทัด —
 * user ทัก 2026-08-05 ว่าข้อมูลซ้ำซ้อนหลายจุด)
 *
 * ปุ่มอยู่บนการ์ดเฉพาะ ≥1024 — เล็กกว่านั้นปุ่มอยู่ในแถบ action ล่างจอ (OrderActionBar
 * variant="bottom") ที่มีปุ่มหลักของหน้าอยู่แล้ว ไม่ให้ปุ่มหลักโผล่ 2 ที่พร้อมกันบนมือถือ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/
 *       CustomerDetails.tsx (card + card-header + badge ขวาหัวการ์ด + แถวไอคอนกลม)
 */

import Icon from '@/components/wrappers/Icon'
import { formatDateTimeTH } from '@/lib/format-date'
import { formatAmount } from './order-detail-shared'

export type CodCardProps = {
  totalAmount: unknown
  /** ISO — มีค่า = ร้านกดยืนยันรับเงินแล้ว */
  codReceivedAtISO: string | null
  /** ชื่อคนที่กดยืนยัน (null = ไม่ทราบ/ระบบ) */
  receivedByLabel: string | null
  busy?: boolean
  onMarkReceived: () => void
  onUndo: () => void
}

export default function CodCard({
  totalAmount,
  codReceivedAtISO,
  receivedByLabel,
  busy = false,
  onMarkReceived,
  onUndo,
}: CodCardProps) {
  const received = Boolean(codReceivedAtISO)

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">เก็บเงินปลายทาง</h4>
        {/* เขียว = ได้เงินเข้าร้านจริงแล้วเท่านั้น (Verified-Means-Green) ระหว่างรอใช้ warning */}
        <span className={received ? 'badge bg-success/15 text-success-ink' : 'badge bg-warning/15 text-warning-ink'}>
          {received ? 'ได้รับเงินแล้ว' : 'ยังไม่ได้รับเงิน'}
        </span>
      </div>
      <div className="card-body">
        <div className="flex items-center gap-3">
          <span
            className={
              received
                ? 'bg-success/15 text-success-ink flex size-10 shrink-0 items-center justify-center rounded-full'
                : 'bg-warning/15 text-warning-ink flex size-10 shrink-0 items-center justify-center rounded-full'
            }
          >
            <Icon icon={received ? 'cash-banknote' : 'coin'} className="text-xl" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-default-900 mb-0 text-xl font-bold">{formatAmount(totalAmount)}</p>
            <p className="text-default-700 mb-0 text-xs">
              {received
                ? `รับเมื่อ ${formatDateTimeTH(codReceivedAtISO!)}${receivedByLabel ? ` · โดย ${receivedByLabel}` : ''}`
                : 'ขนส่งเก็บให้ตอนส่งถึง · โอนเข้าร้านตามรอบของขนส่ง'}
            </p>
          </div>
        </div>

        {/* iShip ไม่มีสถานะไหนที่แปลว่า "โอนเงินเข้าร้านแล้ว" (ตรวจครบ 15 สถานะ) เงินจึงต้อง
            ให้ร้านกดยืนยันเอง — ไม่มีทางรู้แทนได้ */}
        {received ? (
          <button
            className="btn border-default-300 text-default-700 mt-4 hidden w-full justify-center border text-sm font-medium disabled:opacity-60 lg:flex"
            disabled={busy}
            onClick={onUndo}
            type="button"
          >
            <Icon icon="arrow-back-up" className="me-1.5 text-base" aria-hidden="true" />
            ยกเลิกการยืนยัน
          </button>
        ) : (
          <button
            className="btn bg-primary hover:bg-primary-hover mt-4 hidden w-full justify-center text-sm font-medium text-white disabled:opacity-60 lg:flex"
            disabled={busy}
            onClick={onMarkReceived}
            type="button"
          >
            <Icon icon="cash" className="me-1.5 text-base" aria-hidden="true" />
            ได้รับเงินแล้ว
          </button>
        )}
      </div>
    </div>
  )
}
