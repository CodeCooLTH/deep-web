/**
 * StatusHeroV2 — สถานะ + action zone ใน card เดียว (Option D — Action-Prominent Lean)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *   (card shell + card-body p-7.5 + md:flex-row layout)
 * Base: StatusHero.tsx เดิม (info zone — badges/h3/p คัดลอก 100%)
 *
 * Action zone: ปุ่มแสดง inline ตรง ๆ แทน ⋮ dropdown — ลบ hs-dropdown ทิ้งทั้งก้อน
 * (user request 2026-06-16: ต้องการเห็นปุ่มโดยตรง ไม่ต้องกด ⋮ ก่อน)
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { ORDER_STATUS_META } from '@/lib/order-display'
import ShipForm from './ShipForm'
import SendSmsButton from './SendSmsButton'
import OrderCopyLink from './OrderCopyLink'
import CancelOrderButton from './CancelOrderButton'

// SSOT ย้ายไป src/lib/order-display.ts (ORDER_STATUS_META) — ชิปเลขออเดอร์ใน inbox ใช้ชุดเดียวกัน
// re-export ชื่อเดิมไว้ กัน import ที่อื่นพัง (ปัจจุบันใช้เฉพาะในไฟล์นี้)
export const STATUS_META = ORDER_STATUS_META

export const TYPE_META: Record<string, { label: string; icon: string; cls: string }> = {
  PHYSICAL: { label: 'สินค้าจับต้องได้', icon: 'package',        cls: 'bg-primary/15 text-primary' },
  DIGITAL:  { label: 'ดิจิทัล',          icon: 'cloud-download', cls: 'bg-info/15 text-info' },
  SERVICE:  { label: 'บริการ',            icon: 'tool',           cls: 'bg-success/15 text-success' },
}

export interface StatusHeroProps {
  publicToken: string
  shortCode?: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
  /** true = order เกิดจากการชนะประมูล (มี auctionId) → badge ค้อนประมูล */
  isFromAuction?: boolean
}

export default function StatusHero({ publicToken, shortCode, status, createdAtISO, fulfillmentMode, isFromAuction }: StatusHeroProps) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }

  // วันที่+เวลาแสดงคู่กันบรรทัดเดียว → ยุบเป็น formatDateTime ครั้งเดียว
  const createdDisplay = formatDateTime(createdAtISO)

  const isPending   = status === 'PENDING'
  const isShipped   = status === 'SHIPPED'
  const isConfirmed = status === 'CONFIRMED'
  const isCancelled = status === 'CANCELLED'
  // needsShipping: ตัดสิน primary CTA ว่าต้องแสดงปุ่ม ShipForm หรือ SendSmsButton
  const needsShipping = fulfillmentMode === 'SHIPPED'

  return (
    <div className="card">
      <div className="card-body p-5 sm:p-7.5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          {/* ซ้าย: info zone — คัดลอกจาก StatusHero.tsx เดิม */}
          <div className="flex flex-col gap-1.25">
            {/* status badge — type badge ถูกเอาออก (user request 2026-06-16) */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}>
                <Icon icon={s.icon} className="text-sm" />
                {s.label}
              </span>
              {isFromAuction && (
                <span className="badge badge-label bg-warning/15 text-warning text-2xs font-semibold">
                  <Icon icon="gavel" className="text-sm" />
                  จากการประมูล
                </span>
              )}
            </div>
            {/* เลขคำสั่งซื้อ DP… (user 2026-07-25) — ห้าม font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม) */}
            <h3 className="text-lg mb-0 text-default-800">
              {formatOrderNo(publicToken, createdAtISO)}
            </h3>
            {/* วันที่/เวลา — formatDateTime รวมทั้งคู่ในฟอร์แมตเดียว */}
            <p className="text-default-400 text-sm flex items-center gap-1 mb-0">
              <Icon icon="calendar" className="align-middle" />
              {createdDisplay}
            </p>
          </div>

          {/* ขวา: action zone — inline buttons (ลบ hs-dropdown แล้ว, user ต้องการเห็นปุ่มตรง ๆ) */}
          <div className="flex shrink-0 flex-col gap-2 md:items-end">

            {/* PENDING + needsShipping (PHYSICAL/SHIPPED) → [คัดลอกลิงก์] [ส่ง SMS] */}
            {isPending && needsShipping && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
                <SendSmsButton publicToken={publicToken} compact />
              </div>
            )}

            {/* PENDING + อื่น (NO_SHIPPING/DIGITAL/SERVICE) → [ส่ง SMS (primary)] [คัดลอกลิงก์] */}
            {isPending && !needsShipping && (
              <div className="flex items-center gap-2 flex-wrap">
                <SendSmsButton publicToken={publicToken} compact />
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
              </div>
            )}

            {/* SHIPPED → callout + [คัดลอกลิงก์] [ส่ง SMS] */}
            {isShipped && (
              <>
                <div className="bg-info/15 text-info rounded p-3 flex items-center gap-2 text-sm font-medium">
                  <Icon icon="clock" className="shrink-0" />
                  รอผู้ซื้อยืนยันรับสินค้า
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
                  <SendSmsButton publicToken={publicToken} compact />
                </div>
              </>
            )}

            {/* CONFIRMED → [คัดลอกลิงก์] (status badge มุมซ้ายแสดงสถานะแล้ว ไม่ซ้ำ label) */}
            {isConfirmed && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
              </div>
            )}

            {/* CANCELLED → [คัดลอกลิงก์] (status badge มุมซ้ายแสดงสถานะแล้ว ไม่ซ้ำ label) */}
            {isCancelled && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
              </div>
            )}

            {/* ยกเลิกออเดอร์ — destructive แยก row ล่าง; คืน null อัตโนมัติสำหรับ CONFIRMED/CANCELLED */}
            <CancelOrderButton publicToken={publicToken} status={status} className="md:w-auto" />

          </div>
        </div>

        {/* ShipForm full-width — นอก flex row กัน layout jump; ShipForm จัดการ toggle/collapse เอง ไม่ต้องมี wrapper toggle */}
        {isPending && needsShipping && (
          <div className="mt-3 border-t border-default-300 pt-3">
            <ShipForm publicToken={publicToken} />
          </div>
        )}
      </div>
    </div>
  )
}
