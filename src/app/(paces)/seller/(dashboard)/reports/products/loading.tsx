/**
 * loading.tsx — skeleton ของ /seller/reports/products (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 *
 * 🛑 skeleton ต้องเลียนโครงของหน้าจริงบน breakpoint เดียวกัน
 *
 * 🛑 เคยห่อกราฟด้วย `hidden md:block` ตอนที่หน้าจริงยังไม่มีกราฟบนมือถือ — **หน้าจริงเปลี่ยน
 * ไปแล้วตั้งแต่ 2026-08-30 แต่ skeleton ไม่ได้ตามไป** ⇒ บนมือถือเห็นโครงตารางก่อน แล้ว
 * การ์ดกราฟสูง ~300px โผล่มาดันทุกอย่างลง = จอกระตุกซึ่งเป็นสิ่งที่ skeleton มีไว้กันโดยเฉพาะ
 * (จับได้โดย /impeccable audit 2026-08-30 — ไม่มี gate ไหนเห็นเพราะคลาสถูกทุกตัวอักษร)
 * โครงหลอกจึงต้องซ่อนด้วย ไม่งั้นมือถือจะเห็นช่องว่างสูง 360px วาบหนึ่งแล้วหายไป
 * (บทเรียนจาก impeccable critique ของ /reports/agents 2026-08-27)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerChartSkeleton, SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const ProductSalesReportLoading = () => (
  <>
    <PageBreadcrumb title="ยอดขายรายสินค้า" subtitle="รายงาน" />
    <span className="sr-only">กำลังโหลด...</span>
    <div className="mb-4">
      <SellerChartSkeleton />
    </div>
    <SellerTableSkeleton />
  </>
)

export default ProductSalesReportLoading
