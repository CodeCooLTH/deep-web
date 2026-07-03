/**
 * loading.tsx — skeleton สำหรับ /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 * mirror layout หน้าจริง: PageBreadcrumb (desktop) → SellerThreadSkeleton (bubble สลับซ้ายขวา)
 *
 * Base: src/app/(paces)/seller/(dashboard)/auctions/[id]/loading.tsx (structure pattern)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerThreadSkeleton } from '../../_shared/SellerCardSkeleton'

const InboxThreadLoading = () => (
  <>
    <div className="hidden lg:block">
      <PageBreadcrumb title="ข้อความ" trail={[{ label: 'ข้อความ', href: '/inbox' }]} />
    </div>
    <SellerThreadSkeleton />
  </>
)

export default InboxThreadLoading
