'use client'

/**
 * แถบ Tab ของเมนู ChatBot — ตั้งค่าบอท / บุคลิก / คลังความรู้ / ประวัติการตอบ
 * feature 00023 · user สั่ง 2026-08-01 ("บุคลิก AI ต้องโยกเข้าเมนู DeepBot เพื่อเป็นการตั้งค่าตัวบอท")
 *
 * Base: settings/auto-reply/[id]/KeywordTabs.tsx (segmented control ชุดเดียวกัน)
 *
 * NOTE: แท็บ "บุคลิก" ชี้ไป /settings/ai ซึ่งเป็นหน้าของ feature 00019 (AI ร่างคำตอบให้คนกดส่ง)
 * ไม่ใช่บุคลิกของ DeepBot โดยตรง — คงเส้นทางเดิมไว้เพื่อไม่ต้องรื้อหน้านั้นทั้งหน้า
 * แต่จัดให้อยู่ในชุดเดียวกันตามที่ user ต้องการให้ "ตั้งค่าตัวบอท" อยู่ที่เดียว
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/helpers'

const TABS = [
  { href: '/settings/chatbot', label: 'ตั้งค่าบอท' },
  { href: '/settings/ai', label: 'บุคลิก' },
  { href: '/settings/chatbot/knowledge', label: 'คลังความรู้' },
  { href: '/settings/chatbot/logs', label: 'ประวัติการตอบ' },
] as const

export default function ChatbotTabs() {
  const pathname = usePathname()

  return (
    <div className="bg-light mb-4 flex w-full items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="ส่วนของ ChatBot">
      {TABS.map((t) => {
        // เทียบเต็ม path — /settings/chatbot เป็น prefix ของ /settings/chatbot/knowledge
        // ถ้าใช้ startsWith แท็บแรกจะ active ตลอด
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
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
