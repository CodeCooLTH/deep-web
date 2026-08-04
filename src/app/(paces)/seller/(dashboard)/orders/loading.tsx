/**
 * loading.tsx — skeleton สำหรับ /seller/orders
 * mirror OrdersList แบบ responsive: ตาราง (SellerTableSkeleton) บน desktop ≥lg
 * + การ์ด (SellerOrderCardSkeleton) บน mobile <lg — ตรงกับ breakpoint หน้าจริง
 * (OrdersList: `hidden lg:block` OrdersTable + `lg:hidden` OrderCard list)
 *
 * กฎ: หน้า list ที่เป็น "ตาราง" บน desktop ใช้ SellerTableSkeleton (เหมือน /products)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import {
  SellerTableSkeleton,
  SellerOrderCardSkeleton,
} from '../_shared/SellerCardSkeleton'

const OrdersLoading = () => (
  <>
    {/* feature 00030: skeleton ทำงานก่อน RSC resolve shop จึงยังไม่รู้ vertical — ใช้คำกลาง
        "รายการ" แทนการเดาคำของประเภทร้าน (เดาผิดแล้วหัวหน้าจะกระพริบเปลี่ยนคำตอนโหลดเสร็จ) */}
    <PageBreadcrumb title="รายการ" trail={[{ label: 'การขาย' }]} />
    {/* desktop ≥lg: ตาราง (ตรงกับ OrdersTable) */}
    <div className="hidden lg:block">
      <SellerTableSkeleton />
    </div>
    {/* mobile <lg: การ์ด (ตรงกับ OrderCard list) */}
    <div className="lg:hidden">
      <SellerOrderCardSkeleton />
    </div>
  </>
)

export default OrdersLoading
