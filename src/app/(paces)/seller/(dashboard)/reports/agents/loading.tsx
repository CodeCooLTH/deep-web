/**
 * loading.tsx — skeleton ของ /seller/reports/agents
 * mirror layout: แถบตัวกรอง → แถวการ์ดสถิติ → ตาราง
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerTableSkeleton } from '../../_shared/SellerCardSkeleton'

const AgentReportLoading = () => (
  <>
    <PageBreadcrumb title="ผลงานแอดมิน" subtitle="รายงาน" />
    <span className="sr-only">กำลังโหลด...</span>
    <SellerTableSkeleton />
  </>
)

export default AgentReportLoading
