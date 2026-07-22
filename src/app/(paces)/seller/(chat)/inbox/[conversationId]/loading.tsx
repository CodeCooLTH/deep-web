/**
 * loading.tsx — skeleton สำหรับ /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * rewrite (chat-standalone): ตัด PageBreadcrumb ออก — หน้าแชทเต็มจอไม่มี breadcrumb แล้ว (ดู
 * ChatHeader.tsx/(chat)/layout.tsx) เหลือแค่ skeleton ของ thread ตรง ๆ ให้ตรงกับหน้าจริง
 *
 * Base: src/app/(paces)/seller/(dashboard)/auctions/[id]/loading.tsx (structure pattern)
 */
import { SellerThreadSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'

const InboxThreadLoading = () => <SellerThreadSkeleton />

export default InboxThreadLoading
