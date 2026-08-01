'use client'

/**
 * แถบ Tab ของหน้ากลุ่มคำ — ตั้งค่าตอบกลับ / AI Enhance / คลังคำตอบ
 * feature 00023 · user สั่ง 2026-08-01
 *
 * Base: src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx (segmented control —
 *   พื้น `bg-light` ก้อนเดียว ตัวที่เลือกเป็นการ์ด `bg-card shadow-sm` ยกขึ้น)
 *
 * ทำไม Tab เป็น "ลิงก์" ไม่ใช่ state ในหน้าเดียว:
 *   แต่ละ Tab โหลดข้อมูลคนละชุด (คำตอบ+เงื่อนไข / สวิตช์ AI / คลังคำถาม) การรวมเป็นหน้าเดียว
 *   แปลว่าต้องโหลดทั้งสามชุดทุกครั้งที่เข้าหน้า ทั้งที่ผู้ใช้ดูทีละอัน — และจะเสีย deep link
 *   (ส่งลิงก์คลังคำตอบให้เพื่อนร่วมร้านไม่ได้) แยกเป็น route ทำให้ RSC โหลดเฉพาะของ Tab นั้น
 *
 * NOTE: ไม่ใช้ `usePathname().startsWith` เพราะ `/[id]` เป็น prefix ของอีกสอง Tab
 *   จะทำให้ Tab แรก active ตลอดเวลา — เทียบ segment สุดท้ายแทน
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/helpers'

type Props = { keywordId: string }

const TABS = [
  { seg: '', label: 'ตั้งค่าตอบกลับ' },
  { seg: 'ai', label: 'AI Enhance' },
  { seg: 'qna', label: 'คลังคำตอบ' },
] as const

export default function KeywordTabs({ keywordId }: Props) {
  const pathname = usePathname()
  const base = `/settings/auto-reply/${keywordId}`
  // segment ที่อยู่หลัง id — '' สำหรับหน้าตั้งค่าตอบกลับ
  const current = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : ''

  return (
    <div className="bg-light mb-4 flex w-full items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="ส่วนของกลุ่มคำ">
      {TABS.map((t) => {
        const active = current === t.seg
        return (
          <Link
            key={t.seg}
            href={t.seg ? `${base}/${t.seg}` : base}
            role="tab"
            aria-selected={active}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-nowrap',
              active ? 'bg-card text-dark font-semibold shadow-sm' : 'text-default-600',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
