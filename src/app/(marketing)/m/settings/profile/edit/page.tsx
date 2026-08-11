import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTrustLevel } from '@/services/trust-score.service'
import { formatDateTH } from '@/lib/format-date'
import { MPageTitle } from '../../../_components/ui'
import ProfileEditMobile from './ProfileEditMobile'
import { sessionUserId } from '@/lib/session-user'

export const metadata: Metadata = { title: 'แก้ไขโปรไฟล์' }

export default async function MobileProfileEditPage() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/settings/profile')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      username: true,
      phone: true,
      email: true,
      trustScore: true,
      createdAt: true,
      _count: { select: { userBadges: true } }
    }
  })
  if (!user) redirect('/auth/sign-in')

  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title='แก้ไขโปรไฟล์' back='/settings/profile' />
      <ProfileEditMobile
        displayName={user.displayName}
        username={user.username}
        phone={user.phone}
        email={user.email}
        summary={{
          trustScore: user.trustScore,
          trustLevel: getTrustLevel(user.trustScore),
          memberSince: formatDateTH(user.createdAt),
          badgeCount: user._count.userBadges
        }}
      />
    </div>
  )
}
