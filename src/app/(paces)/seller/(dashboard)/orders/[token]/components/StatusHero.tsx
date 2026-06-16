/**
 * StatusHeroV2 — สถานะ + action zone ใน card เดียว (Option D — Action-Prominent Lean)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *   (card shell + card-body p-7.5 + md:flex-row layout)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 *   (hs-dropdown markup: [--placement:bottom-right] + hs-dropdown-toggle + hs-dropdown-menu + dropdown-item + dropdown-divider)
 * Base: StatusHero.tsx เดิม (info zone — badges/h3/p คัดลอก 100%)
 *
 * [--placement:bottom-right] คือ Preline CSS variable ไม่ใช่ arbitrary Tailwind value
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import ShipForm from './ShipForm'
import SendSmsButton from './SendSmsButton'
import OrderCopyLink from './OrderCopyLink'

export const STATUS_META: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning',  icon: 'clock' },
  SHIPPED:   { label: 'จัดส่งแล้ว',  cls: 'bg-info/15 text-info',        icon: 'truck' },
  CONFIRMED: { label: 'สำเร็จ',      cls: 'bg-success/15 text-success',  icon: 'circle-check-filled' },
  CANCELLED: { label: 'ยกเลิก',      cls: 'bg-danger/15 text-danger',    icon: 'circle-x' },
}

export const TYPE_META: Record<string, { label: string; icon: string; cls: string }> = {
  PHYSICAL: { label: 'สินค้าจับต้องได้', icon: 'package',        cls: 'bg-primary/15 text-primary' },
  DIGITAL:  { label: 'ดิจิทัล',          icon: 'cloud-download', cls: 'bg-info/15 text-info' },
  SERVICE:  { label: 'บริการ',            icon: 'tool',           cls: 'bg-success/15 text-success' },
}

export interface StatusHeroProps {
  publicToken: string
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
}

export default function StatusHero({ publicToken, status, type, createdAtISO, fulfillmentMode }: StatusHeroProps) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }
  const t = TYPE_META[type]   ?? { label: type,   cls: 'bg-default-100 text-default-700', icon: 'help-circle' }

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
      <div className="card-body p-4 sm:p-7.5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          {/* ซ้าย: info zone — คัดลอกจาก StatusHero.tsx เดิม */}
          <div className="flex flex-col gap-1.25">
            {/* badges บรรทัดเดียวกัน — ขนาดเท่ากันทั้งคู่ */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}>
                <Icon icon={s.icon} className="text-sm" />
                {s.label}
              </span>
              <span className={`badge badge-label text-2xs font-semibold ${t.cls}`}>
                <Icon icon={t.icon} className="text-sm" />
                {t.label}
              </span>
            </div>
            {/* ออเดอร์ # — ห้าม font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม) */}
            <h3 className="text-lg mb-0 text-default-800">
              ออเดอร์ #{publicToken.slice(0, 8)}
            </h3>
            {/* วันที่/เวลา — formatDateTime รวมทั้งคู่ในฟอร์แมตเดียว */}
            <p className="text-default-400 text-sm flex items-center gap-1 mb-0">
              <Icon icon="calendar" className="align-middle" />
              {createdDisplay}
            </p>
          </div>

          {/* ขวา: action zone */}
          <div className="flex shrink-0 items-center gap-2">

            {/* PENDING + อื่น (NO_SHIPPING/DIGITAL/SERVICE) → SendSmsButton เป็น primary */}
            {isPending && !needsShipping && (
              <SendSmsButton publicToken={publicToken} />
            )}

            {/* SHIPPED → callout รอผู้ซื้อยืนยัน */}
            {isShipped && (
              <div className="bg-info/15 text-info rounded p-3 flex items-center gap-2 text-sm font-medium">
                <Icon icon="clock" className="shrink-0" />
                รอผู้ซื้อยืนยันรับสินค้า
              </div>
            )}

            {/* CONFIRMED → badge สำเร็จ */}
            {isConfirmed && (
              <span className="badge bg-success/15 text-success flex items-center gap-1.5">
                <Icon icon="circle-check-filled" className="text-base" />
                ออเดอร์สำเร็จแล้ว
              </span>
            )}

            {/* CANCELLED → badge ยกเลิก */}
            {isCancelled && (
              <span className="badge bg-danger/15 text-danger flex items-center gap-1.5">
                <Icon icon="circle-x" className="text-base" />
                ออเดอร์ถูกยกเลิกแล้ว
              </span>
            )}

            {/* ⋮ hs-dropdown overflow menu — [--placement:bottom-right] = Preline CSS var ไม่ใช่ arbitrary value */}
            <div className="hs-dropdown relative inline-flex [--placement:bottom-right]">
              <button
                type="button"
                className="hs-dropdown-toggle btn btn-icon border border-default-300 bg-card hover:bg-default-100 text-default-700"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-label="เมนูเพิ่มเติม"
              >
                <Icon icon="dots-vertical" className="size-4" />
              </button>
              <div className="hs-dropdown-menu" role="menu" aria-orientation="vertical">
                <div className="space-y-0.5 p-1">
                  {/* คัดลอกลิงก์ — OrderCopyLink render เป็น div>button; role="none" บน wrapper */}
                  <div className="dropdown-item" role="none">
                    <OrderCopyLink publicToken={publicToken} />
                  </div>
                  {/* ส่ง SMS — แสดงเฉพาะ SHIPPED หรือ PENDING+SHIPPED */}
                  {(isShipped || (isPending && needsShipping)) && (
                    <>
                      <hr className="dropdown-divider" />
                      <div className="p-0" role="none">
                        <SendSmsButton publicToken={publicToken} compact />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ShipForm full-width — นอก flex row กัน layout jump; ShipForm จัดการ toggle/collapse เอง ไม่ต้องมี wrapper toggle */}
        {isPending && needsShipping && (
          <div className="mt-3 border-t border-default-200 pt-3">
            <ShipForm publicToken={publicToken} />
          </div>
        )}
      </div>
    </div>
  )
}
