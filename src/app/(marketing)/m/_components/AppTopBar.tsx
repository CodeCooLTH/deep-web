// Top bar ของ mobile web app (/m) — โลโก้ icon (ไม่มี wordmark) + ช่องเช็กก่อนโอน + กระดิ่งแจ้งเตือน.
// sticky, server component: อ่าน unread count เองเพื่อโชว์ badge บนกระดิ่ง.
import Link from 'next/link'
import { getServerSession } from 'next-auth'

import VuexyLogo from '@core/svg/Logo'
import { authOptions } from '@/lib/auth'
import { getUnreadNotificationCount } from '@/services/notification.service'

export default async function AppTopBar() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const unread = userId ? await getUnreadNotificationCount(userId) : 0

  return (
    <header
      className='sticky top-0 z-20 bg-[var(--mui-palette-background-paper)] shadow-[0_2px_10px_rgb(47_43_61_/_0.06)]'
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className='flex items-center gap-2.5 pli-4 plb-3'>
        <Link href='/dashboard' aria-label='หน้าแรก' className='shrink-0 no-underline flex items-center'>
          <VuexyLogo className='text-[var(--mui-palette-primary-main)]' style={{ fontSize: '1.75rem' }} />
        </Link>

        <Link
          href='/check'
          className='flex-1 flex items-center gap-2 h-10 pli-4 rounded-full bg-[var(--mui-palette-action-hover)] border border-[var(--mui-palette-divider)] no-underline min-w-0 transition-colors hover:border-[var(--mui-palette-primary-main)]'
        >
          <i className='tabler-search text-[1.25rem] text-[var(--mui-palette-primary-main)] shrink-0' />
          <span className='text-sm text-[var(--mui-palette-text-secondary)] truncate'>เช็กก่อนโอน — เบอร์ / บัญชี / ร้าน</span>
        </Link>

        <Link
          href='/m/notifications'
          aria-label={unread > 0 ? `แจ้งเตือน ${unread} รายการ` : 'แจ้งเตือน'}
          className='relative shrink-0 size-10 rounded-full flex items-center justify-center no-underline bg-[var(--mui-palette-action-hover)] border border-[var(--mui-palette-divider)] transition-colors hover:border-[var(--mui-palette-primary-main)]'
        >
          <i className='tabler-bell text-[1.35rem] text-[var(--mui-palette-text-primary)]' />
          {unread > 0 && (
            <span className='absolute -top-1 -right-1 min-is-[18px] h-[18px] pli-1 rounded-full bg-[var(--mui-palette-error-main)] text-white text-[10px] font-bold leading-[18px] text-center'>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
