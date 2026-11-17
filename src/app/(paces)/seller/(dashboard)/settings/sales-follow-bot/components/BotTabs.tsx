/**
 * BotTabs — แท็บ "บอท" / "ประวัติการส่ง" เป็นลิงก์ `?tab=log` (แชร์ลิงก์ได้) หน้าตา segmented แบบ ChatbotTabs (00095 S-7)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx
 *   + src/app/(paces)/seller/(dashboard)/settings/chatbot/ChatbotTabs.tsx (bg-light rounded-lg p-1)
 * ต่างจากพี่น้อง: แท็บ active มาเป็น prop จาก server (searchParams) ไม่ใช้ usePathname — ไม่ต้องเป็น client component
 */
import Link from 'next/link'

import { cn } from '@/utils/helpers'

export default function BotTabs({ active, labels }: { active: 'bots' | 'log'; labels: { aria: string; bots: string; log: string } }) {
  const tabs = [
    { id: 'bots' as const, href: '/settings/sales-follow-bot', label: labels.bots },
    { id: 'log' as const, href: '/settings/sales-follow-bot?tab=log', label: labels.log },
  ]
  return (
    <nav className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1 md:w-auto" aria-label={labels.aria}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? 'page' : undefined}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-nowrap md:flex-none md:px-4 lg:min-h-0',
            active === tab.id ? 'bg-card text-default-900 ring-default-300 font-semibold shadow-sm ring-1' : 'text-default-700',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
