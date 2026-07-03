/**
 * loading.tsx — skeleton สำหรับ /inbox (feat 00011 Deep Chat, S-11)
 * mirror layout หน้าจริง: PageBreadcrumb (desktop) → SellerInboxSkeleton (card divide-y row)
 *
 * Base: src/app/(paces)/seller/(dashboard)/auctions/[id]/loading.tsx (structure pattern)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerInboxSkeleton } from '../_shared/SellerCardSkeleton'

const InboxLoading = () => (
  <>
    <div className="hidden lg:block">
      <PageBreadcrumb title="ข้อความ" />
    </div>
    <SellerInboxSkeleton />
  </>
)

export default InboxLoading
