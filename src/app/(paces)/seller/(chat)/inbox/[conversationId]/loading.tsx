/**
 * loading.tsx ของห้องแชท — โครงรูปห้อง (S4, มติ user 2026-09-29)
 *
 * ทำไมใส่กลับ ทั้งที่ e3248a1f ถอดออกไป: ตอนถอดคาดว่า "ไม่มี loading = จอเดิมค้างจนห้องใหม่พร้อม"
 * แต่ Next ใช้ loading ของ segment แม่ต่อ ⇒ `inbox/loading.tsx` (สเกเลตัน *รายการ*) มาครอบห้องแทน
 * ทุกครั้งที่เปิดห้องที่ไม่ได้ prefetch = อาการ "เปิดห้องแล้วกระพริบ" (audit 2026-09-29 §2)
 *
 * เรขาคณิตต้องตรง page.tsx: `flex h-full` + เธรด flex-1 + ช่องขวา `w-96 xl:block` (CustomerPanel)
 * และ className ของ SellerThreadSkeleton ต้องเท่ากับที่ ChatThread ใช้ตอน loadingInitial
 * (`min-w-0 h-full flex-1`) ไม่งั้นจะเห็น "preload ซ้อน 2 อัน" แบบบั๊ก 2026-07-23
 *
 * Base: inbox/comments/loading.tsx (โครง segment + ช่องว่างคอลัมน์ข้าง) · SellerThreadSkeleton
 */
import { SellerThreadSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'

const ConversationLoading = () => (
  <div className="flex h-full">
    <SellerThreadSkeleton className="min-w-0 h-full flex-1" />
    <div className="hidden h-full w-96 shrink-0 xl:block" />
  </div>
)

export default ConversationLoading
