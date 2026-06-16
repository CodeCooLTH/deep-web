/**
 * loading.tsx — skeleton สำหรับ /seller/badges
 * mirror layout: 3× badge card (grid)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerCardSkeleton } from '../_shared/SellerCardSkeleton'

const BadgesLoading = () => (
  <>
    <PageBreadcrumb title="ความสำเร็จ" trail={[{ label: 'ภาพรวม' }]} />
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-base">
      <span className="sr-only">กำลังโหลด...</span>
      <SellerCardSkeleton />
      <SellerCardSkeleton />
      <SellerCardSkeleton />
    </div>
  </>
)

export default BadgesLoading
