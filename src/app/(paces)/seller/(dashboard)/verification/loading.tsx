/**
 * loading.tsx — skeleton สำหรับ /seller/verification
 * mirror layout: header card + 3 verification level cards (L1/L2/L3)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { SellerCardSkeleton } from '../_shared/SellerCardSkeleton'

const VerificationLoading = () => (
  <div className="space-y-base">
    <span className="sr-only">กำลังโหลด...</span>

    {/* header summary card */}
    <SellerCardSkeleton />

    {/* L1 / L2 / L3 verification level cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-base">
      <SellerCardSkeleton />
      <SellerCardSkeleton />
      <SellerCardSkeleton />
    </div>
  </div>
)

export default VerificationLoading
