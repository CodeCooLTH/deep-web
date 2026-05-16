/**
 * loading.tsx — skeleton สำหรับ /seller/orders
 * mirror layout: data table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const OrdersLoading = () => (
  <div>
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </div>
)

export default OrdersLoading
