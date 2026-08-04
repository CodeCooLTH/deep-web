/**
 * CommentsThreadSkeleton — skeleton ของ "คอลัมน์ความคิดเห็น" ตอนกำลังโหลดคอมเมนต์ของโพสต์
 *
 * ทำไมต้องมีตัวเอง ไม่ใช้ SellerThreadSkeleton: ตัวนั้นเป็น `.card` (ขอบ + มุมโค้ง + card-header
 * เส้นประ + แถบ composer ปลอมท้ายการ์ด) เพราะหน้าเธรดแชทจริงเป็นการ์ด — แต่คอลัมน์ความคิดเห็นเป็น
 * รายการเปล่าใน `w-full p-3` ไม่มีการ์ดหุ้ม และมีช่องพิมพ์จริงอยู่ใต้คอลัมน์แล้ว ผลคือตอนโหลดเห็น
 * กล่องมีขอบ+ระยะขอบโผล่มาแล้วหายไปตอนคอมเมนต์มา พร้อมช่องพิมพ์ปลอมซ้อนกับของจริง
 * (user report prod 2026-08-04 พร้อมภาพ: "ตอน preload มันมี padding ในหน้า chat comment")
 *
 * กฎที่พลาดไปคือกฎที่เขียนไว้เองบนหัว SellerCardSkeleton.tsx: "ห้ามเลือก skeleton คนละชนิดกับ
 * layout หน้าจริงบน breakpoint เดียวกัน" — ที่นี่จึงลอกโครงของจริงมาตรง ๆ:
 * คอมเมนต์ = avatar size-8 + บับเบิลกว้างไม่เต็มแถว, คำตอบของเพจย่อหน้า ms-10, ระยะห่างกลุ่ม mb-5
 */
import { PulseBar } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'

/** 1 กลุ่ม = คอมเมนต์ลูกค้า + (ถ้ามี) คำตอบของเพจย่อหน้าอยู่ใต้ — โครงเดียวกับ CommentBubble จริง */
const Group = ({ withReply, width }: { withReply?: boolean; width: string }) => (
  <div className="mb-5">
    <div className="flex items-start gap-2">
      <PulseBar className="size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <PulseBar className={`h-12 rounded-2xl ${width}`} />
        {/* แถวเวลา · ตอบ ที่อยู่นอกบับเบิล */}
        <PulseBar className="mt-1.5 ms-3 h-3 w-24" />
      </div>
    </div>
    {withReply && (
      <div className="ms-10 mt-2 flex items-start gap-2">
        <PulseBar className="size-7 shrink-0 rounded-full" />
        <PulseBar className="h-10 w-40 rounded-2xl" />
      </div>
    )}
  </div>
)

export default function CommentsThreadSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">กำลังโหลดความคิดเห็น...</span>
      {/* ความกว้างบับเบิลไม่เท่ากันตั้งใจ — เท่ากันหมดจะอ่านเป็นตาราง ไม่ใช่บทสนทนา */}
      <Group width="w-3/4" withReply />
      <Group width="w-1/2" />
      <Group width="w-2/3" withReply />
      <Group width="w-2/5" />
    </div>
  )
}
