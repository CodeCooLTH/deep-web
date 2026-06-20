/**
 * loading.tsx — skeleton สำหรับ /seller/customers
 * mirror layout: data table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const CustomersLoading = () => (
  <>
    <PageBreadcrumb title="ลูกค้า" subtitle="ร้านค้า" />
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </>
)

export default CustomersLoading
