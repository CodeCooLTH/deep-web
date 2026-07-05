import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { listNotifications, markAllNotificationsRead } from '@/services/notification.service'
import { formatDateTimeTH } from '@/lib/format-date'

export const metadata: Metadata = { title: 'การแจ้งเตือน' }

// map kind → icon + ปลายทางที่ปลอดภัย (chat → inbox กัน refId=conversationId ไม่ตรง shopId)
const KIND_META: Record<string, { icon: string; color: string; href?: string }> = {
  chat_message: { icon: 'tabler-message-2', color: 'var(--mui-palette-primary-main)', href: '/messages' },
  badge_earned: { icon: 'tabler-award', color: 'var(--mui-palette-warning-main)', href: '/badges' },
  won: { icon: 'tabler-trophy', color: 'var(--mui-palette-success-main)', href: '/orders' },
  outbid: { icon: 'tabler-gavel', color: 'var(--mui-palette-error-main)', href: '/m/auctions' },
}
const DEFAULT_META = { icon: 'tabler-bell', color: 'var(--mui-palette-text-secondary)', href: undefined as string | undefined }

export default async function MobileNotificationsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/dashboard')
  const userId = (session.user as { id: string }).id

  const { items } = await listNotifications(userId, { take: 50 })
  // เปิดหน้านี้ = อ่านทั้งหมด (badge บนกระดิ่งเคลียร์รอบถัดไป)
  await markAllNotificationsRead(userId)

  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-[17px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>การแจ้งเตือน</h1>

      {items.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-2 pbs-16 pbe-10 text-center'>
          <div className='size-16 rounded-full bg-[var(--mui-palette-action-hover)] flex items-center justify-center'>
            <i className='tabler-bell-off text-[28px] text-[var(--mui-palette-text-disabled)]' />
          </div>
          <p className='text-[14px] m-0 text-[var(--mui-palette-text-secondary)]'>ยังไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className='flex flex-col gap-2'>
          {items.map(n => {
            const meta = KIND_META[n.kind] ?? DEFAULT_META
            const inner = (
              <div
                className={`flex items-start gap-3 rounded-2xl border p-3 ${
                  n.read
                    ? 'bg-[var(--mui-palette-background-paper)] border-[var(--mui-palette-divider)]'
                    : 'bg-[var(--mui-palette-primary-lightOpacity)] border-[var(--mui-palette-primary-main)]/30'
                }`}
              >
                <div
                  className='size-9 rounded-xl flex items-center justify-center shrink-0'
                  style={{ background: 'var(--mui-palette-action-hover)' }}
                >
                  <i className={`${meta.icon} text-[20px]`} style={{ color: meta.color }} />
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-[14px] font-medium m-0 text-[var(--mui-palette-text-primary)] leading-snug'>{n.title}</p>
                  {n.body && (
                    <p className='text-[13px] m-0 mbs-0.5 text-[var(--mui-palette-text-secondary)] leading-snug line-clamp-2'>
                      {n.body}
                    </p>
                  )}
                  <p className='text-[11px] m-0 mbs-1 text-[var(--mui-palette-text-disabled)]'>
                    {formatDateTimeTH(n.createdAt)}
                  </p>
                </div>
                {!n.read && <span className='size-2 rounded-full bg-[var(--mui-palette-primary-main)] shrink-0 mbs-1.5' />}
              </div>
            )
            return meta.href ? (
              <Link key={n.id} href={meta.href} className='no-underline block'>
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
