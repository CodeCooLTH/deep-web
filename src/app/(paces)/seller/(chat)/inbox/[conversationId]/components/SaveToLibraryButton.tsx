'use client'

/**
 * SaveToLibraryButton — ปุ่ม "เก็บเข้าคลัง" บนเดสก์ท็อป (feature 00048)
 *
 * Base: CopyMessageButton ใน ChatThread.tsx:177-208 (ไอคอนวงกลม size-7 ที่โผล่ตอน hover แถวข้อความ
 * ด้วย `lg:group-hover:flex`)
 *
 * 🛑 ทำไมเป็นปุ่มแยก ไม่ใช่ item ใน popover ของ MessageActionBubble: `useLongPress` รับ **touch
 * เท่านั้น** (ไม่มี onMouseDown) และ popover ที่เปิดจากปุ่มหน้ายิ้มบนเดสก์ท็อปเป็น
 * `mode:'reactions'` ซึ่ง `actionTargetActions` คืน `[]` ⇒ ไม่แสดงแถวคำสั่งเลย
 * การรื้อให้ปุ่มหน้ายิ้มเปิดเมนูเต็มจะกระทบพฤติกรรมที่ใช้อยู่บน prod โดยไม่ได้ประโยชน์กับผู้ใช้
 *
 * 🛑 ต่างจาก CopyMessageButton ตรงที่นี่เป็น **สถานะจริง ไม่ใช่ flash ชั่วคราว** — ไอคอนสะท้อนว่า
 * ไฟล์อยู่ในคลังหรือยัง ไม่ใช่ว่าเพิ่งกดไปเมื่อกี้
 */
import Icon from '@/components/wrappers/Icon'
import { LIBRARY_COPY, LIBRARY_ICONS } from '@/lib/customer-file-library'

export default function SaveToLibraryButton({
  saved,
  busy,
  onToggle,
}: {
  saved: boolean
  busy: boolean
  onToggle: () => void
}) {
  const label = saved ? LIBRARY_COPY.unsave : LIBRARY_COPY.save
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 lg:group-hover:flex ${
        saved ? 'text-primary' : 'text-default-700 hover:bg-default-100'
      }`}
    >
      <Icon icon={saved ? LIBRARY_ICONS.saved : LIBRARY_ICONS.save} className="size-4" />
    </button>
  )
}
