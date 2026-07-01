/**
 * loading.tsx — skeleton สำหรับ /seller/auctions/[id]
 * mirror layout หน้าจริง: ConsoleHead (card ยาว) → 4 stat card (grid) → 2-col
 * (ซ้าย col-span-2: chart + bid feed / ขวา: control panel + info card)
 *
 * Base: src/app/(paces)/seller/(dashboard)/auctions/loading.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerCardSkeleton, SellerChartSkeleton } from '../../_shared/SellerCardSkeleton'

const AuctionDetailLoading = () => (
  <>
    <div className="hidden lg:block">
      <PageBreadcrumb title="รายละเอียดประมูล" trail={[{ label: 'การประมูล', href: '/auctions' }]} />
    </div>

    {/* ConsoleHead skeleton */}
    <div className="mb-base">
      <SellerCardSkeleton />
    </div>

    {/* stat cards skeleton — 4 การ์ด (ราคา/บิด/เหลือเวลา/gauge) */}
    <div className="mb-base grid grid-cols-1 gap-base sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SellerCardSkeleton key={i} />
      ))}
    </div>

    {/* 2-col console (lg:grid-cols-3) */}
    <div className="grid grid-cols-1 gap-base lg:grid-cols-3">
      <div className="space-y-base lg:col-span-2">
        <SellerChartSkeleton />
        <SellerCardSkeleton />
      </div>
      <div className="space-y-base">
        <SellerCardSkeleton />
        <SellerCardSkeleton />
      </div>
    </div>
  </>
)

export default AuctionDetailLoading
