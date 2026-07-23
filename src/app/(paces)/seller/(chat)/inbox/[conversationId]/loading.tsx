/**
 * loading.tsx — skeleton สำหรับ /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * rewrite (chat-standalone): ตัด PageBreadcrumb ออก — หน้าแชทเต็มจอไม่มี breadcrumb แล้ว (ดู
 * ChatHeader.tsx/(chat)/layout.tsx) เหลือแค่ skeleton ของ thread ตรง ๆ ให้ตรงกับหน้าจริง
 *
 * bug fix (user report prod 2026-07-23: "loading chat ตรงกลาง มันมี preload ซ้อนกัน 2 อัน"):
 * หน้านี้มี loading 2 ช่วงตามธรรมชาติ — (1) route-level นี้ ระหว่างรอ RSC ของ page.tsx (query
 * conversation/customer/orders) แล้ว (2) ChatThread เองระหว่างรอ GET ข้อความชุดแรกฝั่ง client
 * ปัญหาคือ "เรขาคณิตคนละอัน": ของเดิมที่นี่เป็น `.card` เปล่า (h-fit, เต็มความกว้าง ไม่มีคอลัมน์
 * ข้อมูลลูกค้า) พอ RSC เสร็จ skeleton ตัวที่ 2 โผล่แบบแคบลง (flex-1 ข้าง CustomerPanel w-96) และ
 * สูงเต็มจอ → เห็นเป็น skeleton คนละก้อนซ้อนกัน 2 รอบ. แก้ด้วยการ mirror โครงของ page.tsx ตรง ๆ
 * (flex h-full + คอลัมน์ข้อมูลลูกค้า ≥1024px) และให้การ์ดสูงเต็มเท่ากัน → ทั้ง 2 ช่วงทับกัน
 * พอดีจนดูเป็น skeleton ก้อนเดียวที่ค้างอยู่จนข้อความมาจริง
 *
 * Base: src/app/(paces)/seller/(dashboard)/auctions/[id]/loading.tsx (structure pattern)
 */
import { SellerThreadSkeleton, SellerCardSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'

const InboxThreadLoading = () => (
  // โครงเดียวกับ page.tsx เป๊ะ (thread flex-1 + ข้อมูลลูกค้า w-96 เฉพาะ ≥1024px)
  <div className="flex h-full">
    <SellerThreadSkeleton className="min-w-0 h-full flex-1" />
    <div className="hidden h-full w-96 shrink-0 lg:block">
      <SellerCardSkeleton />
    </div>
  </div>
)

export default InboxThreadLoading
