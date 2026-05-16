/**
 * SellerCardSkeleton — skeleton loading components สำหรับ seller pages
 *
 * Base (multi-source):
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx
 *     (bg-default-300 block h-X w-Y animate-pulse rounded, L75-83)
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/spinners/page.tsx (card structure)
 *   - theme/paces/Admin/TS/src/assets/css/custom/_card.css (card, card-body, card-header)
 *
 * export หลายตัวจากไฟล์เดียว — loading.tsx import ตามต้องการ
 * ใช้ pulse bars จาก Paces placeholder primitive: `bg-default-300 animate-pulse rounded`
 */

/** PulseBar — bar เดี่ยวสำหรับ compose skeleton */
const PulseBar = ({ className }: { className?: string }) => (
  <span className={`bg-default-300 block animate-pulse rounded ${className ?? ''}`} />
)

/**
 * SellerCardSkeleton — mimic stat card (title สั้น + value กลาง + sub บาง)
 * ใช้สำหรับ stat card, form section, หรือข้อมูลทั่วไป
 */
export const SellerCardSkeleton = () => (
  <div className="card">
    <div className="card-body space-y-3">
      {/* title สั้น */}
      <PulseBar className="h-3.5 w-1/3" />
      {/* value กลาง (ตัวเลขหลัก) */}
      <PulseBar className="h-7 w-1/2" />
      {/* sub text บาง */}
      <PulseBar className="h-3 w-2/3" />
      <span className="sr-only">กำลังโหลด...</span>
    </div>
  </div>
)

/**
 * SellerTableSkeleton — mimic data table (header + 5 แถว)
 * ใช้สำหรับ orders, products, customers, categories
 */
export const SellerTableSkeleton = () => (
  <div className="card">
    {/* header row */}
    <div className="card-header">
      <PulseBar className="h-4 w-32" />
      <PulseBar className="h-8 w-24 rounded-full" />
    </div>
    <div className="card-body space-y-3 p-0">
      {/* 5 แถวจำลอง table rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-3 border-b border-default-200 last:border-0"
        >
          {/* checkbox placeholder */}
          <PulseBar className="h-4 w-4 shrink-0" />
          {/* content cols */}
          <PulseBar className="h-3.5 w-24" />
          <PulseBar className="h-3.5 flex-1" />
          <PulseBar className="h-3.5 w-16" />
          <PulseBar className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
    <span className="sr-only">กำลังโหลด...</span>
  </div>
)

/**
 * SellerChartSkeleton — mimic chart area สูง ~360px
 * ใช้สำหรับ sales, dashboard chart section
 */
export const SellerChartSkeleton = () => (
  <div className="card">
    <div className="card-header">
      <PulseBar className="h-4 w-40" />
      <PulseBar className="h-8 w-28 rounded-full" />
    </div>
    <div className="card-body">
      {/* chart area block */}
      <PulseBar className="h-[360px] w-full rounded" />
      <span className="sr-only">กำลังโหลด...</span>
    </div>
  </div>
)

// default export ชี้ไปที่ SellerCardSkeleton เพื่อ convenience import
export default SellerCardSkeleton
