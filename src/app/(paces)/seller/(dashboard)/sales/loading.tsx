/**
 * loading.tsx — skeleton สำหรับ /seller/sales
 * mirror layout: chart area เป็นหลัก
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { SellerChartSkeleton } from '../_shared/SellerCardSkeleton'

const SalesLoading = () => (
  <div>
    <span className="sr-only">กำลังโหลด...</span>
    <SellerChartSkeleton />
  </div>
)

export default SalesLoading
