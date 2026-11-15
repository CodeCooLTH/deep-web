/**
 * loading.tsx — skeleton ของ /seller/reports/ad-revenue (00091 เฟส 3)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ad-quality/loading.tsx
 *   (ซึ่งใช้ src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx · กริด: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx)
 * 🛑 skeleton ต้องเลียนโครงหน้าจริง: แถวกรอง + แถบแท็บ + การ์ด 2 ใบ (ไม่วาง spinner กลางจอ)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { PulseBar } from '../../_shared/SellerCardSkeleton'
import { ChartCardSkeleton, TableCardSkeleton } from '../ad-quality/components/Skeletons'

const AdRevenueLoading = () => (
  <>
    <PageBreadcrumb title="วิเคราะห์ยอดขายจากโฆษณา" subtitle="รายงาน" />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="mb-base flex flex-wrap items-center gap-2">
      <PulseBar className="h-9 w-64" />
      <PulseBar className="ms-auto h-9 w-40" />
    </div>
    <div className="mb-base flex gap-3">
      <PulseBar className="h-9 w-20" />
      <PulseBar className="h-9 w-20" />
      <PulseBar className="h-9 w-24" />
      <PulseBar className="h-9 w-20" />
    </div>
    <div className="gap-base grid grid-cols-1">
      <ChartCardSkeleton />
      <TableCardSkeleton />
    </div>
  </>
)

export default AdRevenueLoading
