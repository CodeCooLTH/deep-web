/**
 * loading.tsx — skeleton ของ /seller/reports/ad-quality (00093)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/loading.tsx
 *   (ซึ่งใช้ src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx · กริด: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx)
 * 🛑 skeleton ต้องเลียนโครงของหน้าจริงทุก breakpoint: แถวกรอง + แถว 3 ใบ (③ md:col-span-2) + ④ ⑤ ⑥ เต็มแถว
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { PulseBar } from '../../_shared/SellerCardSkeleton'
import { ChartCardSkeleton, TableCardSkeleton, TopRowSkeleton } from './components/Skeletons'

const AdQualityLoading = () => (
  <>
    <PageBreadcrumb title="คุณภาพโฆษณา" subtitle="รายงาน" hideTitleBelowLg />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="mb-base flex flex-wrap items-center gap-2">
      <PulseBar className="h-9 w-64" />
      <PulseBar className="ms-auto h-9 w-40" />
    </div>
    <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      <TopRowSkeleton />
    </div>
    <div className="gap-base grid grid-cols-1">
      <ChartCardSkeleton />
      <TableCardSkeleton />
      <TableCardSkeleton />
    </div>
  </>
)

export default AdQualityLoading
