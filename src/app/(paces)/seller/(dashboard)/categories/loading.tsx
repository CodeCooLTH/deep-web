/**
 * loading.tsx — skeleton สำหรับ /seller/categories
 * mirror layout: data table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const CategoriesLoading = () => (
  <>
    <PageBreadcrumb title="หมวดหมู่สินค้า" trail={[{ label: 'การขาย' }]} />
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </>
)

export default CategoriesLoading
