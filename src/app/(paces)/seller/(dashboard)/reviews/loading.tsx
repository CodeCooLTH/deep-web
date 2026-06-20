/**
 * loading.tsx — skeleton สำหรับ /seller/reviews
 * mirror layout: stat card (summary) + table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerCardSkeleton, SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const ReviewsLoading = () => (
  <>
    <PageBreadcrumb title="รีวิว" trail={[{ label: 'การขาย' }]} />
    <div className="space-y-base">
      <span className="sr-only">กำลังโหลด...</span>
      {/* summary stat card */}
      <SellerCardSkeleton />
      {/* reviews table */}
      <SellerTableSkeleton />
    </div>
  </>
)

export default ReviewsLoading
