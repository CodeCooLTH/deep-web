/**
 * CancelZone — danger zone card ยกเลิกออเดอร์ (แยกจาก OrderActionPanel)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx (card + card-header + card-body)
 * card variant: border border-dashed border-danger (Paces danger zone)
 *
 * หมายเหตุ icon: @/components/wrappers/Icon auto-prepend "tabler:" → ใช้ชื่อเปล่า "alert-triangle"
 * ไม่ใช่ "tabler:alert-triangle" (จะกลาย tabler:tabler:alert-triangle ซึ่งหาไม่เจอ)
 */
'use client'
import Icon from '@/components/wrappers/Icon'
import CancelOrderButton from './CancelOrderButton'

interface CancelZoneProps { publicToken: string; status: string }

export default function CancelZone({ publicToken, status }: CancelZoneProps) {
  if (status !== 'PENDING' && status !== 'SHIPPED') return null
  return (
    <div className="card border border-dashed border-danger">
      <div className="card-header">
        <h4 className="card-title flex items-center gap-1.5 text-danger"><Icon icon="alert-triangle" className="text-base" />โซนอันตราย</h4>
      </div>
      <div className="card-body flex flex-col gap-3">
        <p className="text-sm text-default-500">การยกเลิกออเดอร์ไม่สามารถย้อนกลับได้<br />กรุณายืนยันก่อนดำเนินการ</p>
        <CancelOrderButton publicToken={publicToken} status={status} />
      </div>
    </div>
  )
}
