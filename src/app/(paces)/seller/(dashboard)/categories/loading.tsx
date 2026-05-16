/**
 * loading.tsx — skeleton สำหรับ /seller/categories
 * mirror layout: data table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const CategoriesLoading = () => (
  <div>
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </div>
)

export default CategoriesLoading
