'use client'

// ปุ่มย้อนกลับ (mobile) — ใช้ history.back ถ้ามีประวัติ, ไม่งั้น fallback ไปหน้า parent (กันเปิดตรง/รีเฟรชแล้วค้าง)
import { useRouter } from 'next/navigation'

export default function MBackButton({ fallback }: { fallback: string }) {
  const router = useRouter()
  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(fallback)
  }
  /* 🛑 `size-11` (44px) ไม่ใช่ `size-9` (36) — The Forty-Four Rule
     `-mis-3` แทน `-mis-2`: กล่องโต 36→44 คือโตด้านละ 4 จึงต้องเลื่อนซ้ายเพิ่ม 4
     ไอคอนจึงอยู่ตำแหน่งเดิมเป๊ะ (ก่อน −8+7=−1 · หลัง −12+11=−1) โตเฉพาะพื้นที่ให้นิ้ว */
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label='ย้อนกลับ'
      className='size-11 -mis-3 rounded-full flex items-center justify-center border-0 bg-transparent cursor-pointer shrink-0 active:bg-[var(--mui-palette-action-hover)] transition-colors'
    >
      <i className='tabler-arrow-left text-[22px] text-[var(--mui-palette-text-primary)]' />
    </button>
  )
}
