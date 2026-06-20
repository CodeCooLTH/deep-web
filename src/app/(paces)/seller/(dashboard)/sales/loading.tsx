/**
 * loading.tsx — skeleton สำหรับ /seller/sales
 * mirror layout: chart area เป็นหลัก
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerChartSkeleton } from '../_shared/SellerCardSkeleton'

const SalesLoading = () => (
  <>
    <PageBreadcrumb title="ภาพรวมยอดขาย" trail={[{ label: 'ภาพรวม' }]} />
    <span className="sr-only">กำลังโหลด...</span>
    <SellerChartSkeleton />
  </>
)

export default SalesLoading
