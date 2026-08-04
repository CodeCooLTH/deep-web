/**
 * loading.tsx — skeleton ระหว่างสลับเข้าแท็บ "ความคิดเห็น" (feature 00029)
 *
 * ทำไมต้องมีไฟล์นี้ (user report prod 2026-08-04: "ตอนกด tab ความคิดเห็น มัน loading ไม่เหมือน
 * ตอนกด tab ข้อความ (preload มันบังหมดทุกอย่าง)"):
 * เดิมไม่มี loading ของ route นี้ Next จึงตกไปใช้ `../loading.tsx` ซึ่งเป็น `SellerInboxSkeleton`
 * ก้อนเดียวกว้างเต็มพื้นที่ — แถบแท็บ ข้อความ/ความคิดเห็น หายทั้งแถบ แล้วมีการ์ด skeleton
 * มาคลุมทั้งจอ ต่างจากตอนกดแท็บข้อความที่โครง 2 คอลัมน์ยังอยู่
 *
 * ที่นี่ mirror เรขาคณิตของหน้าจริง (CommentsClient): ซ้าย = คอลัมน์รายการ `lg:w-96` มี
 * skeleton แถว, ขวา = พื้นที่ว่างของโพสต์ — เปลี่ยนหน้าแล้วจึงไม่มีอะไรกระตุก และไม่มีอะไร
 * "บัง" เพราะ skeleton อยู่แค่ในคอลัมน์ที่ข้อมูลกำลังโหลดจริง
 *
 * Base: โครงคอลัมน์จาก CommentsClient.tsx (คอลัมน์รายการ + คอลัมน์โพสต์)
 *       แถว skeleton จาก _shared/SellerCardSkeleton.tsx (SellerInboxSkeleton)
 */
import { SellerInboxSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'

const CommentsLoading = () => (
  <div className="card m-0 flex h-full min-w-0 flex-1 flex-col rounded-none border-0 shadow-none">
    <div className="flex min-h-0 flex-1">
      <div className="border-default-200 flex min-w-0 flex-1 flex-col border-e lg:w-96 lg:flex-none lg:shrink-0">
        <SellerInboxSkeleton />
      </div>
      {/* คอลัมน์โพสต์ปล่อยว่างระหว่างโหลด — โผล่ที่ lg เท่ากับหน้าจริง (มือถือเห็นรายการก่อนเสมอ) */}
      <div className="hidden min-w-0 flex-1 lg:block" />
    </div>
  </div>
)

export default CommentsLoading
