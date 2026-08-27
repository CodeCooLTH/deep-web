/**
 * loading.tsx — skeleton ของ /seller/reports/agents
 * mirror layout: แถบตัวกรอง → แถวการ์ดสถิติ → ตาราง
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerCardSkeleton, SellerChartSkeleton, SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const AgentReportLoading = () => (
  <>
    <PageBreadcrumb title="การตอบแชทของแอดมิน" subtitle="รายงาน" />
    <span className="sr-only">กำลังโหลด...</span>
    {/* 🛑 skeleton ต้องเลียนโครงของหน้าจริงบน breakpoint เดียวกัน — SellerCardSkeleton.tsx
        เขียนกฎนี้ไว้เอง ก่อนหน้านี้คอมเมนต์อ้างว่า mirror แล้วแต่ render แค่ตาราง
        (impeccable critique 2026-08-27 · P2) */}
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <SellerCardSkeleton key={i} />
      ))}
    </div>
    <SellerTableSkeleton />
  </>
)

export default AgentReportLoading
