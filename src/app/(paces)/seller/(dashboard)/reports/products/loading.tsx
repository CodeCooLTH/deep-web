/**
 * loading.tsx — skeleton ของ /seller/reports/products (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 *
 * 🛑 skeleton ต้องเลียนโครงของหน้าจริงบน breakpoint เดียวกัน — หน้านี้ซ่อนกราฟต่ำกว่า md
 * โครงหลอกจึงต้องซ่อนด้วย ไม่งั้นมือถือจะเห็นช่องว่างสูง 360px วาบหนึ่งแล้วหายไป
 * (บทเรียนจาก impeccable critique ของ /reports/agents 2026-08-27)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerChartSkeleton, SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const ProductSalesReportLoading = () => (
  <>
    <PageBreadcrumb title="ยอดขายรายสินค้า" subtitle="รายงาน" />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="mb-4 hidden md:block">
      <SellerChartSkeleton />
    </div>
    <SellerTableSkeleton />
  </>
)

export default ProductSalesReportLoading
