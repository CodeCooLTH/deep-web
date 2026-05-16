/**
 * loading.tsx — skeleton สำหรับ /seller/shop
 * mirror layout: card ที่มี form-ish fields (4-5 pulse rows)
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import { SellerCardSkeleton } from '../_shared/SellerCardSkeleton'

/**
 * ShopFormSkeleton — mimic shop settings form (มากกว่า 3 row ของ SellerCardSkeleton ปกติ)
 * สร้าง inline เพราะ layout เฉพาะ shop page ไม่ export ออกไป
 */
const ShopFormSkeleton = () => {
  // pulse bar helper ซ้ำจาก SellerCardSkeleton primitive (ไม่ import เพราะ internal only)
  const PulseBar = ({ className }: { className?: string }) => (
    <span className={`bg-default-300 block animate-pulse rounded ${className ?? ''}`} />
  )

  return (
    <div className="card">
      <div className="card-header">
        <PulseBar className="h-4 w-36" />
      </div>
      <div className="card-body space-y-4">
        {/* shop logo / avatar skeleton */}
        <div className="flex items-center gap-4">
          <span className="bg-default-300 animate-pulse rounded-full size-16 shrink-0" />
          <PulseBar className="h-8 w-24 rounded-full" />
        </div>
        {/* label + input × 4 ฟิลด์ */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <PulseBar className="h-3 w-20" />
            <PulseBar className="h-9 w-full rounded" />
          </div>
        ))}
        {/* save button */}
        <PulseBar className="h-9 w-28 rounded-full" />
        <span className="sr-only">กำลังโหลด...</span>
      </div>
    </div>
  )
}

const ShopLoading = () => (
  <div className="space-y-base">
    <span className="sr-only">กำลังโหลด...</span>
    <ShopFormSkeleton />
    {/* secondary stat card */}
    <SellerCardSkeleton />
  </div>
)

export default ShopLoading
