/**
 * loading.tsx — skeleton สำหรับ /seller/products
 * mirror ProductsListing แบบ responsive: ตาราง (SellerTableSkeleton) บน desktop ≥lg
 * + การ์ด (SellerProductCardSkeleton) บน mobile <lg — ตรงกับ breakpoint หน้าจริง
 * (ProductsListing: `hidden lg:block` ProductsTable + `lg:hidden` ProductCard list)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import {
  SellerTableSkeleton,
  SellerProductCardSkeleton,
} from '../_shared/SellerCardSkeleton'

const ProductsLoading = () => (
  <>
    <PageBreadcrumb title="สินค้า" trail={[{ label: 'การขาย' }]} />
    {/* desktop ≥lg: ตาราง (ตรงกับ ProductsTable) */}
    <div className="hidden lg:block">
      <SellerTableSkeleton />
    </div>
    {/* mobile <lg: การ์ด (ตรงกับ ProductCard list) */}
    <div className="lg:hidden">
      <SellerProductCardSkeleton />
    </div>
  </>
)

export default ProductsLoading
