'use client'

/**
 * Bottom tab bar ของ mobile web app (/m) — 5 tab (เน้น trust):
 * หน้าแรก · คำสั่งซื้อ · [เช็กมิจฉาชีพ ยกลอยกลาง = signature] · แชท · โปรไฟล์
 * href = URL จริง (/dashboard, /orders, …) → proxy rewrite เป็น /m/* บนมือถือ (URL ไม่เปลี่ยน)
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import classnames from 'classnames'

type Tab = { href: string; label: string; icon: string }

const LEFT: Tab[] = [
  { href: '/dashboard', label: 'หน้าแรก', icon: 'tabler-home' },
  { href: '/orders', label: 'คำสั่งซื้อ', icon: 'tabler-shopping-bag' },
]
const RIGHT: Tab[] = [
  { href: '/messages', label: 'แชท', icon: 'tabler-message' },
  { href: '/settings/profile', label: 'โปรไฟล์', icon: 'tabler-user' },
]

// หน้า sub ที่ให้ highlight tab แม่ (nav โชว์แค่ 5 tab แต่ครอบคลุมหน้าลูก)
const GROUP: Record<string, string[]> = {
  '/dashboard': ['/shops', '/auctions'],
  '/settings/profile': ['/reviews', '/badges', '/settings', '/notifications']
}

export default function AppBottomNav() {
  const pathname = usePathname()
  const matchPrefix = (p: string) => pathname === p || pathname.startsWith(`${p}/`)
  const isActive = (href: string) => matchPrefix(href) || (GROUP[href]?.some(matchPrefix) ?? false)

  const tabItem = (t: Tab) => {
    const active = isActive(t.href)
    return (
      <Link
        key={t.href}
        href={t.href}
        className={classnames(
          'flex flex-1 flex-col items-center justify-center gap-1 pt-2.5 pb-1.5 min-h-[58px] no-underline transition-colors',
          active ? 'text-[var(--mui-palette-primary-main)]' : 'text-[var(--mui-palette-text-secondary)]'
        )}
      >
        <i className={classnames(t.icon, 'text-[22px]')} />
        <span className='text-[11px] leading-none'>{t.label}</span>
      </Link>
    )
  }

  const checkActive = pathname === '/check' || pathname.startsWith('/check/')

  return (
    <nav
      className='shrink-0 z-30 border-t border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)]'
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
    >
      <div className='relative flex items-stretch'>
        {LEFT.map(tabItem)}

        {/* ปุ่มกลาง — เช็กมิจฉาชีพ ยกลอย (signature) */}
        <div className='flex flex-1 flex-col items-center justify-end pb-1.5'>
          <Link
            href='/check'
            className={classnames(
              'flex items-center justify-center rounded-full size-14 -mt-6 shadow-[0_2px_6px_rgb(115_103_240_/_0.3)] no-underline transition-transform active:scale-95 text-white',
              checkActive ? 'bg-[var(--mui-palette-primary-dark)]' : 'bg-[var(--mui-palette-primary-main)]'
            )}
            aria-label='เช็กมิจฉาชีพ'
          >
            <i className='tabler-shield-search text-[26px]' />
          </Link>
          <span
            className={classnames(
              'text-[11px] leading-none mt-1',
              checkActive ? 'text-[var(--mui-palette-primary-main)]' : 'text-[var(--mui-palette-text-secondary)]'
            )}
          >
            เช็กมิจฉาชีพ
          </span>
        </div>

        {RIGHT.map(tabItem)}
      </div>
    </nav>
  )
}
