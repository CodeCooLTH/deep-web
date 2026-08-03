'use client'

/**
 * InboxTabs — สลับระหว่าง "ข้อความ" กับ "ความคิดเห็น" ในกล่องข้อความ (feature 00029)
 *
 * user สั่ง 2026-08-03 พร้อมภาพ Meta Business Suite: แท็บอยู่เหนือรายการ ไม่ใช่เมนูซ้ายแยก
 * — คนทำงานอยู่ในกล่องเดียว สลับดูว่าใครทักมา/ใครคอมเมนต์มา โดยไม่เปลี่ยนหน้า
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat — ชุด nav-link/nav-tabs ของ Paces
 * (โปรเจกต์ใช้ pattern เดียวกันนี้ที่ ChatbotTabs.tsx ของ settings/chatbot) ใช้ token ล้วน
 * ไม่มี arbitrary value
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'

const TABS = [
  { href: '/inbox', label: 'ข้อความ', icon: 'message-2' },
  { href: '/inbox/comments', label: 'ความคิดเห็น', icon: 'message-circle-2' },
] as const

export default function InboxTabs({ unansweredCount = 0 }: { unansweredCount?: number }) {
  const pathname = usePathname()
  // /inbox/[conversationId] ยังถือว่าอยู่แท็บ "ข้อความ" — เทียบ prefix ไม่ใช่ค่าเป๊ะ
  const isComments = pathname?.startsWith('/inbox/comments') ?? false

  return (
    <div className="border-default-200 flex gap-1 border-b px-4 pt-3">
      {TABS.map((t) => {
        const active = t.href === '/inbox/comments' ? isComments : !isComments
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${
              active
                ? 'border-primary text-primary'
                : 'text-default-700 hover:text-default-800 border-transparent'
            }`}
          >
            <Icon icon={t.icon} className="text-base" />
            {t.label}
            {t.href === '/inbox/comments' && unansweredCount > 0 && (
              <span className="bg-danger flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs text-white">
                {unansweredCount}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
