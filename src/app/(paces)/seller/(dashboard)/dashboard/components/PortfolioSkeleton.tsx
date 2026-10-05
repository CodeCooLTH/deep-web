/**
 * PortfolioSkeleton — fallback ของ Suspense ส่วน "ภาพรวมทุกธุรกิจ" (mirror โครงจริง: หัว + แถบ 3 ช่อง + กราฟ + การ์ดร้านเทียม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx ผ่าน _shared/SellerCardSkeleton.tsx (PulseBar + .card)
 */
import { PulseBar } from '../../_shared/SellerCardSkeleton'

const PortfolioSkeleton = () => (
  <section role="status" aria-busy="true" className="mb-1.25">
    <span className="sr-only">กำลังโหลด</span>
    <div className="card mb-1.25">
      <div className="card-header flex-col items-start gap-2">
        <PulseBar className="h-4 w-40" />
        <PulseBar className="h-3 w-56" />
      </div>
      <div className="bg-light/25 border-b border-default-300 border-dashed">
        <div className="grid grid-cols-2 gap-base px-5 py-4 md:grid-cols-3">
          <div className="order-first col-span-2 space-y-2 md:order-none md:col-span-1">
            <PulseBar className="h-3 w-24" />
            <PulseBar className="h-6 w-32" />
          </div>
          <div className="space-y-2">
            <PulseBar className="h-3 w-20" />
            <PulseBar className="h-5 w-24" />
          </div>
          <div className="space-y-2">
            <PulseBar className="h-3 w-20" />
            <PulseBar className="h-5 w-12" />
          </div>
        </div>
      </div>
      <div className="p-5">
        <PulseBar className="h-65 w-full" />
      </div>
    </div>
    <div className="grid gap-1.25 md:grid-cols-2 2xl:grid-cols-3">
      {[0, 1].map((i) => (
        <div key={i} className="card">
          <div className="card-body space-y-3">
            <PulseBar className="h-9 w-2/3" />
            <PulseBar className="h-6 w-full" />
            <PulseBar className="h-3.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </section>
)

export default PortfolioSkeleton
