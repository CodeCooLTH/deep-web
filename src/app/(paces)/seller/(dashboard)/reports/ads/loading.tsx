/**
 * loading.tsx — skeleton ของ /seller/reports/ads (feature 00091)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/products/loading.tsx
 *   (ซึ่งใช้ src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx)
 *
 * 🛑 skeleton ต้องเลียนโครงของหน้าจริง: การ์ดสรุปใบเดียว + ตาราง (หน้านี้ไม่มีกราฟ จึงไม่ใช้ SellerChartSkeleton)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const AdSalesReportLoading = () => (
  <>
    <PageBreadcrumb title="ยอดขายตามโฆษณา" subtitle="รายงาน" hideTitleBelowLg />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="card mb-4">
      <div className="card-body">
        <div className="bg-default-100 mb-2 h-4 w-32 animate-pulse rounded" />
        <div className="bg-default-100 h-6 w-48 animate-pulse rounded" />
      </div>
    </div>
    <SellerTableSkeleton />
  </>
)

export default AdSalesReportLoading
