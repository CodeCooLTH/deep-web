'use client'

/**
 * Left sidebar สำหรับหน้า buyer account (Shopee-inspired)
 *
 * รูปแบบ:
 * - User card บนสุด: avatar + displayName + link "แก้ไขข้อมูลส่วนตัว"
 * - Menu items พร้อม icon + active highlight ตาม pathname
 *
 * Base: composed จาก Vuexy MUI Avatar/Typography + next/link (ไม่มี theme file
 * ตรงๆ สำหรับ Shopee-style pattern — compose จาก primitives ตามที่ user ขอ)
 */
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'
import classnames from 'classnames'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type SessionUser = {
  displayName?: string
  avatar?: string | null
  username?: string
  isShop?: boolean
}

type MenuItem = {
  href: string
  label: string
  icon: string
  external?: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { href: '/dashboard', label: 'หน้าหลักของฉัน', icon: 'tabler-home' },
  { href: '/orders', label: 'การซื้อของฉัน', icon: 'tabler-shopping-bag' },
  // B2 (feat 00011 Deep Chat, UX-Design-Spec.md resolved decision) — buyer inbox entry point
  { href: '/messages', label: 'ข้อความ', icon: 'tabler-message' },
  { href: '/reviews', label: 'รีวิวที่ให้', icon: 'tabler-star' },
  { href: '/badges', label: 'ความสำเร็จ', icon: 'tabler-award' },
  { href: '/settings/verification', label: 'ยืนยันตัวตน', icon: 'tabler-shield-check' },
  { href: '/settings/profile', label: 'ตั้งค่าบัญชี', icon: 'tabler-user-cog' },
]

export default function AccountSidebar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const user = (session?.user ?? {}) as SessionUser

  const displayName = user.displayName ?? ''
  const avatarUrl = user.avatar ?? undefined

  return (
    <nav className='flex flex-col gap-4 lg:sticky lg:top-24'>
      {/* User card */}
      <div className='flex items-center gap-3 pb-4 border-b border-[var(--mui-palette-divider)]'>
        <Avatar src={avatarUrl} sx={{ width: 56, height: 56 }}>
          {displayName.slice(0, 1)}
        </Avatar>
        <div className='min-w-0 flex-1'>
          <Typography className='font-semibold truncate'>{displayName || 'ผู้ใช้'}</Typography>
          <Link
            href='/settings/profile'
            className='text-xs text-[var(--mui-palette-text-secondary)] hover:text-[var(--mui-palette-primary-main)] inline-flex items-center gap-1 mt-0.5'
          >
            <i className='tabler-pencil text-sm' />
            แก้ไขข้อมูลส่วนตัว
          </Link>
        </div>
      </div>

      {/* Menu */}
      <ul className='flex flex-col gap-1'>
        {MENU_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={classnames(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                  active
                    ? 'bg-[var(--mui-palette-primary-lightOpacity)] text-[var(--mui-palette-primary-main)] font-medium'
                    : 'text-[var(--mui-palette-text-primary)] hover:bg-[var(--mui-palette-action-hover)]',
                )}
              >
                <i className={`${item.icon} text-xl shrink-0`} />
                <span className='text-sm'>{item.label}</span>
              </Link>
            </li>
          )
        })}

        {/* Public profile (conditional — only when username known) */}
        {user.username && (
          <li>
            <Link
              href={`/u/${user.username}`}
              className='flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-[var(--mui-palette-text-primary)] hover:bg-[var(--mui-palette-action-hover)]'
            >
              <i className='tabler-external-link text-xl shrink-0' />
              <span className='text-sm'>โปรไฟล์สาธารณะ</span>
            </Link>
          </li>
        )}

        {/* Seller shortcut (conditional) */}
        {user.isShop && (
          <li>
            <a
              href={
                process.env.NEXT_PUBLIC_SELLER_URL ??
                'https://seller.deepthailand.app/dashboard'
              }
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-[var(--mui-palette-text-primary)] hover:bg-[var(--mui-palette-action-hover)]'
            >
              <i className='tabler-building-store text-xl shrink-0' />
              <span className='text-sm flex-1'>ไปหน้าร้านค้า</span>
              <i className='tabler-external-link text-sm text-[var(--mui-palette-text-disabled)]' />
            </a>
          </li>
        )}
      </ul>
    </nav>
  )
}
