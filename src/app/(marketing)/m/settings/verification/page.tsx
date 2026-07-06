import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserVerifications } from '@/services/verification.service'
import { MPageTitle } from '../../_components/ui'
import VerificationMobile from './VerificationMobile'

export const metadata: Metadata = { title: 'ยืนยันตัวตน' }

export default async function MobileVerificationPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/settings/verification')
  const userId = (session.user as { id: string }).id

  const [user, records] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
    getUserVerifications(userId)
  ])
  if (!user) redirect('/auth/sign-in')

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <MPageTitle title='ยืนยันตัวตน' back='/settings/profile' />
        <p className='text-[13px] m-0 mbs-0.5 text-[var(--mui-palette-text-secondary)]'>ยิ่งยืนยันมาก Trust Score ยิ่งสูง</p>
      </div>
      <VerificationMobile
        phoneVerified={!!user.phone}
        records={records.map(r => ({
          id: r.id,
          type: r.type,
          level: r.level,
          status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
          rejectedReason: r.rejectedReason,
          createdAt: r.createdAt.toISOString()
        }))}
      />
    </div>
  )
}
