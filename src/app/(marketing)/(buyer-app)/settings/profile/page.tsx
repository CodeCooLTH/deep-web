// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/AboutOverview.tsx
// + theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Adapted: owner-facing edit surface for /settings/profile — AboutOverview pattern (about + summary)
// plus an avatar card. Dropped teams/connections/activity-timeline (not relevant for self edit).

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTrustLevel } from '@/services/trust-score.service'
import { formatDateTH } from '@/lib/format-date'

import ProfileForm from './ProfileForm'
import PageHeader from '@/app/(marketing)/(buyer-app)/_components/PageHeader'
import DeleteAccountSection from '@/app/(marketing)/(buyer-app)/_components/DeleteAccountSection'

export const metadata: Metadata = { title: 'ตั้งค่าบัญชี' }

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/settings/profile')

  const userId = (session.user as { id: string }).id
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userBadges: true },
  })
  if (!user) redirect('/auth/sign-in')

  const trustLevel = getTrustLevel(user.trustScore)
  const memberSince = formatDateTH(user.createdAt)
  const badgeCount = user.userBadges.length

  return (
    <>
      <PageHeader title='ตั้งค่าบัญชี' subtitle='จัดการข้อมูลส่วนตัวของคุณ' />

      <ProfileForm
        user={{
          id: user.id,
          displayName: user.displayName,
          username: user.username,
          avatar: user.avatar,
          phone: user.phone,
          email: user.email,
        }}
        summary={{
          trustScore: user.trustScore,
          trustLevel,
          memberSince,
          badgeCount,
        }}
      />

      {/* ลบบัญชี — ท้ายสุดของหน้าเสมอ (App Store 5.1.1(v) บังคับให้มีในแอป)
          วางไว้ล่างสุดเพราะเป็นการกระทำที่ย้อนกลับไม่ได้ ไม่ควรอยู่ปนกับฟอร์มแก้ข้อมูลปกติ
          ที่ผู้ใช้เข้ามาทำเป็นประจำ — ดูหัวไฟล์ DeleteAccountSection.tsx */}
      <div className='mbs-6'>
        <DeleteAccountSection />
      </div>
    </>
  )
}
