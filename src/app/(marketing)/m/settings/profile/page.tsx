import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

import type { ThemeColor } from '@core/types'
import CustomAvatar from '@core/components/mui/Avatar'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrdersByBuyer } from '@/services/order.service'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'

import SignOutButton from '@/app/(marketing)/(buyer-app)/dashboard/SignOutButton'

export const metadata: Metadata = { title: 'บัญชีของฉัน' }

const ORDER_STRIP: Array<{ key: string; label: string; icon: string; color: ThemeColor }> = [
  { key: 'PENDING', label: 'รอดำเนินการ', icon: 'tabler-clock', color: 'warning' },
  { key: 'SHIPPED', label: 'จัดส่งแล้ว', icon: 'tabler-truck', color: 'info' },
  { key: 'CONFIRMED', label: 'สำเร็จ', icon: 'tabler-circle-check', color: 'success' },
  { key: 'CANCELLED', label: 'ยกเลิก', icon: 'tabler-x', color: 'error' },
]

type Row = { href: string; icon: string; label: string; count?: number }

const MenuRow = ({ href, icon, label, count }: Row) => (
  <Link
    href={href}
    className='flex items-center gap-3 pli-5 plb-3.5 no-underline border-b border-[var(--mui-palette-divider)] last:border-b-0 hover:bg-[var(--mui-palette-action-hover)] transition-colors'
  >
    <i className={`${icon} text-[22px] text-[var(--mui-palette-text-secondary)]`} />
    <Typography className='flex-1' color='text.primary'>
      {label}
    </Typography>
    {typeof count === 'number' && count > 0 && (
      <Typography variant='body2' color='text.secondary'>
        {count}
      </Typography>
    )}
    <i className='tabler-chevron-right text-[20px] text-[var(--mui-palette-text-disabled)]' />
  </Link>
)

const MenuSection = ({ title, rows }: { title: string; rows: Row[] }) => (
  <div className='flex flex-col gap-2'>
    <Typography variant='body2' className='font-semibold pli-1' color='text.secondary'>
      {title}
    </Typography>
    <Card>
      <div className='flex flex-col'>
        {rows.map(r => (
          <MenuRow key={r.href + r.label} {...r} />
        ))}
      </div>
    </Card>
  </div>
)

/** หน้าบัญชี mobile (/m) — account hub แบบแอป: header tier → สถานะออเดอร์ → เมนู → ออกจากระบบ */
export default async function MobileAccountPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/settings/profile')

  const userId = (session.user as { id: string }).id
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, username: true, avatar: true, trustScore: true }
  })
  if (!user) redirect('/auth/sign-in')

  const [allOrders, reviewCount, badgeCount] = await Promise.all([
    getOrdersByBuyer(userId),
    prisma.review.count({ where: { reviewerUserId: userId } }),
    prisma.userBadge.count({ where: { userId } })
  ])
  const counts: Record<string, number> = {
    PENDING: allOrders.filter(o => o.status === 'PENDING').length,
    SHIPPED: allOrders.filter(o => o.status === 'SHIPPED').length,
    CONFIRMED: allOrders.filter(o => o.status === 'CONFIRMED').length,
    CANCELLED: allOrders.filter(o => o.status === 'CANCELLED').length,
  }

  const { tier, dots } = getTierDisplay(user.trustScore)
  const tierColor = getTierColor(user.trustScore)
  const dotColor = tierColor === 'default' ? 'var(--mui-palette-secondary-main)' : `var(--mui-palette-${tierColor}-main)`

  return (
    <>
      {/* ── Header (avatar + tier) ── */}
      <Card>
        <CardContent className='flex items-center gap-4'>
          <CustomAvatar src={user.avatar ?? undefined} size={64}>
            {user.displayName.slice(0, 1)}
          </CustomAvatar>
          <div className='flex flex-col gap-1 min-w-0'>
            <Typography className='font-semibold truncate'>{user.displayName}</Typography>
            <Typography variant='body2' color='text.disabled'>
              @{user.username}
            </Typography>
            <div className='flex items-center gap-2 mbs-0.5'>
              <Chip size='small' variant='tonal' color={tierColor} label={tier} />
              <div className='flex items-center gap-1'>
                {[1, 2, 3, 4, 5].map(i => (
                  <span
                    key={i}
                    className='inline-block size-1.5 rounded-full'
                    style={{ background: i <= dots ? dotColor : 'var(--mui-palette-action-disabledBackground)' }}
                  />
                ))}
                <Typography variant='caption' color='text.disabled' className='mis-1'>
                  Trust {user.trustScore}
                </Typography>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── สถานะคำสั่งซื้อ ── */}
      <Card>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <Typography className='font-semibold'>คำสั่งซื้อของฉัน</Typography>
            <Link href='/orders' className='text-[var(--mui-palette-primary-main)] text-sm no-underline flex items-center gap-0.5'>
              ดูประวัติทั้งหมด <i className='tabler-chevron-right text-[16px]' />
            </Link>
          </div>
          <div className='flex items-stretch'>
            {ORDER_STRIP.map(s => (
              <Link key={s.key} href={`/orders?status=${s.key}`} className='flex flex-1 flex-col items-center gap-1 no-underline'>
                <div className='relative'>
                  <CustomAvatar skin='light' variant='rounded' color={s.color} size={44}>
                    <i className={`${s.icon} text-[24px]`} />
                  </CustomAvatar>
                  {counts[s.key] > 0 && (
                    <span className='absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--mui-palette-error-main)] text-white text-[10px] font-semibold flex items-center justify-center'>
                      {counts[s.key]}
                    </span>
                  )}
                </div>
                <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>{s.label}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── เกี่ยวกับฉัน ── */}
      <MenuSection
        title='เกี่ยวกับฉัน'
        rows={[
          { href: '/m/settings/profile/edit', icon: 'tabler-user', label: 'ข้อมูลส่วนตัว' },
          { href: '/settings/verification', icon: 'tabler-shield-check', label: 'ยืนยันตัวตน' },
          { href: '/reviews', icon: 'tabler-star', label: 'รีวิวที่ให้', count: reviewCount },
          { href: '/badges', icon: 'tabler-award', label: 'ความสำเร็จ', count: badgeCount },
          { href: `/u/${user.username}`, icon: 'tabler-external-link', label: 'โปรไฟล์สาธารณะ' },
        ]}
      />

      {/* ── นโยบายและเงื่อนไข ── */}
      <MenuSection
        title='นโยบายและเงื่อนไข'
        rows={[
          { href: '/terms', icon: 'tabler-file-text', label: 'ข้อกำหนดการใช้บริการ' },
          { href: '/privacy', icon: 'tabler-lock', label: 'นโยบายความเป็นส่วนตัว' },
        ]}
      />

      <div className='flex justify-center pbs-2'>
        <SignOutButton />
      </div>
    </>
  )
}
