/**
 * loading.tsx — skeleton สำหรับ /seller/inspection
 * mirror layout: PlanStatusCard + StepLadder (4 การ์ด) + checklist + timeline
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 *   (pattern เดียวกับ verification/loading.tsx)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerCardSkeleton } from '../_shared/SellerCardSkeleton'

const InspectionLoading = () => (
  <>
    <PageBreadcrumb title="แผนการตรวจสอบ" />
    <div className="space-y-base">
      <span className="sr-only">กำลังโหลด...</span>

      {/* PlanStatusCard */}
      <SellerCardSkeleton />

      {/* StepLadder — 4 การ์ดขั้น */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-base">
        <SellerCardSkeleton />
        <SellerCardSkeleton />
        <SellerCardSkeleton />
        <SellerCardSkeleton />
      </div>

      {/* InspectionChecklistSection */}
      <SellerCardSkeleton />

      {/* RoundTimeline */}
      <SellerCardSkeleton />
    </div>
  </>
)

export default InspectionLoading
