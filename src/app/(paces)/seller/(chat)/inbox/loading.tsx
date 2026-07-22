/**
 * loading.tsx — skeleton สำหรับ /inbox (feat 00011 Deep Chat, S-11)
 *
 * rewrite (chat-standalone): ตัด PageBreadcrumb ออก — หน้าแชทเต็มจอไม่มี breadcrumb แล้ว (ดู
 * ChatHeader.tsx/(chat)/layout.tsx) เหลือแค่ skeleton ของ list ตรง ๆ ให้ตรงกับหน้าจริง
 *
 * Base: src/app/(paces)/seller/(dashboard)/auctions/[id]/loading.tsx (structure pattern)
 */
import { SellerInboxSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'

const InboxLoading = () => <SellerInboxSkeleton />

export default InboxLoading
