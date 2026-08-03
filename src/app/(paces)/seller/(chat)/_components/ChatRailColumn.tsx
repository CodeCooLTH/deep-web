'use client'

/**
 * ChatRailColumn — คอลัมน์ซ้ายของหน้าแชท (ตัวห่อ ChatRail)
 *
 * bug fix 2026-08-03 (user report พร้อมภาพ): เปิดแท็บ "ความคิดเห็น" บนเดสก์ท็อปแล้วเห็นแท็บซ้อน
 * 2 ชั้น — rail ยังโชว์รายการแชท + แท็บของตัวเอง ส่วนคอลัมน์กลางเป็นหน้าความคิดเห็นที่มีแท็บอีกชุด
 * user: "มันควรทับช่องแชทไปเลยป่ะ" → ใช่
 *
 * แท็บความคิดเห็นเป็น "โหมดของทั้งกล่องข้อความ" ไม่ใช่เนื้อหาที่ยัดเข้าไปในคอลัมน์กลาง — เมื่ออยู่
 * โหมดนั้น rail (ซึ่งเป็นรายการแชท) ต้องหายไปทั้งคอลัมน์ ไม่ใช่แค่เนื้อข้างใน ไม่งั้นความกว้าง
 * lg:w-80/xl:w-96 ยังกินที่อยู่และหน้าความคิดเห็นจะถูกบีบอยู่ครึ่งขวา
 *
 * ต้องเป็น client component เพราะ layout.tsx เป็น server — อ่าน pathname ไม่ได้
 */
import { usePathname } from 'next/navigation'
import ChatRail from './ChatRail'

export default function ChatRailColumn({
  shopId,
  hasShipping,
}: {
  shopId: string | null
  hasShipping: boolean
}) {
  const pathname = usePathname()
  if (pathname?.startsWith('/inbox/comments')) return null

  return (
    // xl:w-96 — เท่ากับ Customer Panel ฝั่งขวา (user request 2026-07-23) ให้ 2 คอลัมน์ข้างเท่ากัน
    // lg:w-80 (320px) สำหรับช่วงแท็บเล็ต 1024-1279 (bug fix 2026-08-01 จาก user report iPad Pro)
    <div className="border-default-200 hidden shrink-0 flex-col border-e lg:flex lg:w-80 xl:w-96">
      <ChatRail shopId={shopId} hasShipping={hasShipping} />
    </div>
  )
}
