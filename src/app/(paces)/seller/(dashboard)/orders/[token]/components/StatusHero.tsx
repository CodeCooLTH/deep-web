/**
 * StatusHero — สถานะ order เท่านั้น (action ย้ายไป OrderActionPanel แล้ว)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * ย้าย STATUS_META + TYPE_META มาจาก OrderSummary เป็นเจ้าของใหม่
 * Layout: card + card-body (ไม่มี card-header เพื่อความเด่น)
 * โซนเดียว: badge status + type + ออเดอร์# + วันที่/เวลา (ลบโซนขวา action ออกแล้ว — S-13)
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'

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
}

export default function StatusHero({ publicToken, status, type, createdAtISO }: StatusHeroProps) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }
  const t = TYPE_META[type]   ?? { label: type,   cls: 'bg-default-100 text-default-700', icon: 'help-circle' }

  // วันที่+เวลาแสดงคู่กันบรรทัดเดียว → ยุบเป็น formatDateTime ครั้งเดียว
  const createdDisplay = formatDateTime(createdAtISO)

  return (
    <div className="card">
      <div className="card-body p-4 sm:p-7.5">
        {/* badges + ออเดอร์# + วันที่/เวลา — block แน่น (gap-1.25 ตาม theme header) */}
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
          {/* ออเดอร์ # — ไม่ใช้ font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม) */}
          <h3 className="text-lg mb-0 text-default-800">
            ออเดอร์ #{publicToken.slice(0, 8)}
          </h3>
          {/* วันที่/เวลา — formatDateTime รวมทั้งคู่ในฟอร์แมตเดียว */}
          <p className="text-default-400 text-sm flex items-center gap-1 mb-0">
            <Icon icon="calendar" className="align-middle" />
            {createdDisplay}
          </p>
        </div>
      </div>
    </div>
  )
}
