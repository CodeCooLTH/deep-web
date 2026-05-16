/**
 * loading.tsx — skeleton สำหรับ /seller/customers
 * mirror layout: data table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const CustomersLoading = () => (
  <div>
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </div>
)

export default CustomersLoading
