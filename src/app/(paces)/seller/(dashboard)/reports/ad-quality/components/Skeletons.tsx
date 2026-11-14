/**
 * Skeletons — โครงรอข้อมูล Meta (ใช้ทั้ง <Suspense fallback> ใน page.tsx และ loading.tsx)
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/loading.tsx (StatSkeleton) · src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { PulseBar, SellerChartSkeleton, SellerTableSkeleton } from '../../../_shared/SellerCardSkeleton'

export const StatSkeleton = ({ chart }: { chart?: boolean }) => (
  <div className="card h-full">
    <div className="card-body space-y-3">
      <PulseBar className="h-3.5 w-1/3" />
      <PulseBar className="h-7 w-1/2" />
      <PulseBar className="h-3 w-2/3" />
      {chart && <PulseBar className="h-40 w-full" />}
    </div>
  </div>
)

export const TopRowSkeleton = () => (
  <>
    <StatSkeleton chart />
    <StatSkeleton chart />
    <div className="md:col-span-2 xl:col-span-1"><StatSkeleton chart /></div>
  </>
)

export const ChartCardSkeleton = () => <SellerChartSkeleton />
export const TableCardSkeleton = () => <SellerTableSkeleton />
