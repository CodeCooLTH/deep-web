/**
 * loading.tsx — skeleton สำหรับ /seller/auctions
 * mirror AuctionListClient แบบ responsive: ตาราง (SellerTableSkeleton) บน desktop ≥lg
 * + แถวแบน (SellerOrderCardSkeleton) บน mobile <lg — ตรงกับ breakpoint หน้าจริง
 * เพิ่ม stat strip skeleton (SellerCardSkeleton x4) ให้ตรงกับ AuctionStatStrip ด้านบนสุด
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/loading.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import {
  SellerCardSkeleton,
  SellerTableSkeleton,
  SellerOrderCardSkeleton,
} from '../_shared/SellerCardSkeleton'

const AuctionsLoading = () => (
  <>
    <div className="hidden lg:block">
      <PageBreadcrumb title="การประมูล" trail={[{ label: 'การขาย' }]} />
    </div>

    {/* stat strip skeleton — 4 การ์ด (ตรงกับ AuctionStatStrip) */}
    <div className="mb-base grid grid-cols-2 gap-base lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SellerCardSkeleton key={i} />
      ))}
    </div>

    {/* desktop ≥lg: ตาราง (ตรงกับ AuctionDataTable) */}
    <div className="hidden lg:block">
      <SellerTableSkeleton />
    </div>
    {/* mobile <lg: แถวแบน (ตรงกับ AuctionRow list) */}
    <div className="lg:hidden">
      <SellerOrderCardSkeleton />
    </div>
  </>
)

export default AuctionsLoading
