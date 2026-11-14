/**
 * loading.tsx — skeleton ของ /seller/reports/ads (feature 00091 FR-009)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/products/loading.tsx
 *   (ซึ่งใช้ src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx)
 *   กริด: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx
 *
 * 🛑 skeleton ต้องเลียนโครงของหน้าจริงทุก breakpoint: แถวกรอง + กริด 4 แถวเดียวกับ AdSalesClient
 *   (③ ด่านล่างใช้ md:col-span-2 เหมือนหน้าจริง · ⑧ ซ่อนบนจอเล็กแล้วไปคู่ ⑤ — skeleton วาดที่ตำแหน่งเดสก์ท็อป)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { PulseBar, SellerChartSkeleton, SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const StatSkeleton = ({ chart }: { chart?: boolean }) => (
  <div className="card h-full">
    <div className="card-body space-y-3">
      <PulseBar className="h-3.5 w-1/3" />
      <PulseBar className="h-7 w-1/2" />
      <PulseBar className="h-3 w-2/3" />
      {chart && <PulseBar className="h-40 w-full" />}
    </div>
  </div>
)

const AdSalesReportLoading = () => (
  <>
    <PageBreadcrumb title="ยอดขายตามโฆษณา" subtitle="รายงาน" hideTitleBelowLg />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="mb-base flex flex-wrap items-center gap-2">
      <PulseBar className="h-9 w-64" />
      <PulseBar className="ms-auto h-9 w-24" />
    </div>
    <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      <StatSkeleton chart />
      <StatSkeleton chart />
      <div className="md:col-span-2 xl:col-span-1">
        <StatSkeleton chart />
      </div>
    </div>
    <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
      <div className="md:col-span-2 xl:col-span-3">
        <SellerChartSkeleton />
      </div>
      <StatSkeleton chart />
    </div>
    <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <StatSkeleton chart />
      </div>
      <div className="xl:col-span-5">
        <StatSkeleton chart />
      </div>
    </div>
    <div className="gap-base grid grid-cols-1 xl:grid-cols-4">
      <div className="max-xl:hidden">
        <StatSkeleton chart />
      </div>
      <div className="xl:col-span-3">
        <SellerTableSkeleton />
      </div>
    </div>
  </>
)

export default AdSalesReportLoading
