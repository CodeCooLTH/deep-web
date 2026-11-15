/**
 * loading.tsx — skeleton ของ /seller/reports/ads-summary (00094) · ทั้งหน้าเพราะดึงก้อนเดียว (ดู page.tsx)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ad-quality/loading.tsx
 *   (ซึ่งใช้ src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx · กริด: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx)
 * 🛑 skeleton ต้องเลียนโครงของหน้าจริง: แถวกรอง + การ์ดหลัก 4 + ตัวเลขรอง 2 กลุ่ม + แนวโน้ม + funnel/กลุ่มผู้ชม + ตาราง + ครีเอทีฟ + ความคุ้มค่า
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { PulseBar, SellerChartSkeleton, SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const StatSkeleton = () => (
  <div className="card h-full">
    <div className="card-body space-y-3">
      <PulseBar className="h-3.5 w-1/3" />
      <PulseBar className="h-7 w-1/2" />
      <PulseBar className="h-3 w-2/3" />
    </div>
  </div>
)

const AdsSummaryLoading = () => (
  <>
    <PageBreadcrumb title="สรุปโฆษณา" subtitle="รายงาน" hideTitleBelowLg />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="mb-base flex flex-wrap items-center gap-2">
      <PulseBar className="h-9 w-64" />
      <PulseBar className="ms-auto h-9 w-40" />
    </div>
    <div className="gap-base mb-base grid grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)}
    </div>
    <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <StatSkeleton key={i} />)}
    </div>
    <div className="gap-base grid grid-cols-1">
      <SellerChartSkeleton />
      <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-8"><SellerChartSkeleton /></div>
        <div className="xl:col-span-4"><SellerChartSkeleton /></div>
      </div>
      <SellerTableSkeleton />
      <SellerChartSkeleton />
      <SellerChartSkeleton />
    </div>
  </>
)

export default AdsSummaryLoading
