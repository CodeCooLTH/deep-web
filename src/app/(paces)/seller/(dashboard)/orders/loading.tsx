/**
 * loading.tsx — skeleton สำหรับ /seller/orders
 * เปลี่ยนจาก table skeleton → card skeleton เพราะ orders page ใช้ card layout บน mobile
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 *   (extend PulseBar pattern จาก theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerOrderCardSkeleton } from '../_shared/SellerCardSkeleton'

const OrdersLoading = () => (
  <>
    <PageBreadcrumb title="คำสั่งซื้อ" trail={[{ label: 'การขาย' }]} />
    <SellerOrderCardSkeleton />
  </>
)

export default OrdersLoading
