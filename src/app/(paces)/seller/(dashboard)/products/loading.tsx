/**
 * loading.tsx — skeleton สำหรับ /seller/products
 * mirror layout: data table
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerTableSkeleton } from '../_shared/SellerCardSkeleton'

const ProductsLoading = () => (
  <>
    <PageBreadcrumb title="สินค้า" trail={[{ label: 'การขาย' }]} />
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </>
)

export default ProductsLoading
