'use client'

// ปุ่มย้อนกลับ (mobile) — ใช้ history.back ถ้ามีประวัติ, ไม่งั้น fallback ไปหน้า parent (กันเปิดตรง/รีเฟรชแล้วค้าง)
import { useRouter } from 'next/navigation'

export default function MBackButton({ fallback }: { fallback: string }) {
  const router = useRouter()
  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(fallback)
  }
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label='ย้อนกลับ'
      className='size-9 -mis-2 rounded-full flex items-center justify-center border-0 bg-transparent cursor-pointer shrink-0 active:bg-[var(--mui-palette-action-hover)] transition-colors'
    >
      <i className='tabler-arrow-left text-[22px] text-[var(--mui-palette-text-primary)]' />
    </button>
  )
}
