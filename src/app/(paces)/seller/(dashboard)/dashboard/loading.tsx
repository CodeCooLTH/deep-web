/**
 * loading.tsx — skeleton สำหรับ /seller/dashboard
 * mirror layout: UserCard-skel + 3× stat card (grid) + chart
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import {
  SellerCardSkeleton,
  SellerChartSkeleton,
} from '../_shared/SellerCardSkeleton'

const DashboardLoading = () => (
  <div className="space-y-base">
    <span className="sr-only">กำลังโหลด...</span>

    {/* UserCard skeleton */}
    <SellerCardSkeleton />

    {/* 3 stat cards (grid) */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-base">
      <SellerCardSkeleton />
      <SellerCardSkeleton />
      <SellerCardSkeleton />
    </div>

    {/* chart area */}
    <SellerChartSkeleton />
  </div>
)

export default DashboardLoading
