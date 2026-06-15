/**
 * StatusHero — สถานะ + primary next-action (action-first)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * ย้าย STATUS_META + TYPE_META มาจาก OrderSummary เป็นเจ้าของใหม่
 * Layout: card + card-body (ไม่มี card-header เพื่อความเด่น)
 * โซนซ้าย: badge status + type + ออเดอร์# + วันที่/เวลา
 * โซนขวา: primary action ต่าง state
 * responsive: md:flex md:items-center md:justify-between; mobile stack flex-col gap-3
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import ShipForm from './ShipForm'
import SendSmsButton from './SendSmsButton'

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
  fulfillmentMode: string
  createdAtISO: string
}

export default function StatusHero({ publicToken, status, type, fulfillmentMode, createdAtISO }: StatusHeroProps) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }
  const t = TYPE_META[type]   ?? { label: type,   cls: 'bg-default-100 text-default-700', icon: 'help-circle' }

  const createdDate = new Date(createdAtISO).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const createdTime = new Date(createdAtISO).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const tokenShort = publicToken.slice(0, 8)

  return (
    <div className="card">
      <div className="card-body md:flex md:items-center md:justify-between gap-base">
        {/* โซนซ้าย: badges + token + วันที่ */}
        <div className="flex flex-col gap-3">
          {/* badges บรรทัดเดียวกัน */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`badge badge-label text-xs font-semibold ${s.cls}`}>
              <Icon icon={s.icon} className="text-sm" />
              {s.label}
            </span>
            <span className={`badge badge-label text-2xs ${t.cls}`}>
              <Icon icon={t.icon} className="text-sm" />
              {t.label}
            </span>
          </div>
          {/* ออเดอร์ # */}
          <h3 className="text-lg font-mono mb-0 text-default-800">
            ออเดอร์ #{tokenShort}
          </h3>
          {/* วันที่/เวลา */}
          <p className="text-default-400 text-sm flex items-center gap-1 mb-0">
            <Icon icon="calendar" className="align-middle" />
            {createdDate}
            <small className="text-default-400">{createdTime}</small>
          </p>
        </div>

        {/* โซนขวา: primary action per state — mobile เต็มกว้าง (ปุ่ม w-full ใน child) */}
        <div className="mt-4 md:mt-0 md:ms-auto w-full md:w-auto">
          {status === 'PENDING' && fulfillmentMode === 'SHIPPED' && (
            <ShipForm publicToken={publicToken} />
          )}

          {status === 'PENDING' && fulfillmentMode === 'NO_SHIPPING' && (
            /* default size — ห้ามแตะ SendSmsButton props */
            <SendSmsButton publicToken={publicToken} />
          )}

          {status === 'SHIPPED' && (
            <div className="bg-info/15 text-info rounded-lg p-3 flex items-center gap-2 text-sm">
              <Icon icon="clock" className="shrink-0" />
              รอผู้ซื้อยืนยันรับสินค้า
            </div>
          )}

          {status === 'CONFIRMED' && (
            <div className="flex items-center gap-2 text-success text-sm font-medium">
              <Icon icon="circle-check-filled" className="shrink-0" />
              ออเดอร์สำเร็จแล้ว
            </div>
          )}

          {status === 'CANCELLED' && (
            <div className="flex items-center gap-2 text-danger text-sm font-medium">
              <Icon icon="circle-x" className="shrink-0" />
              ออเดอร์ถูกยกเลิกแล้ว
            </div>
          )}
          {/* unknown status → ไม่มี action element */}
        </div>
      </div>
    </div>
  )
}
