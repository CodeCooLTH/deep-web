/**
 * Mobile web app shell (/m/*) — แยกจาก desktop/tablet 100%.
 * เข้าถึงผ่าน proxy.ts rewrite เมื่อ detect มือถือ (URL เดิม เช่น /dashboard → render /m).
 * ไม่มี marketing header/footer; ใช้ AppTopBar (sticky) + AppBottomNav (fixed) แบบแอปจริง.
 */
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import type { ChildrenType } from '@core/types'
import { authOptions } from '@/lib/auth'

import AppTopBar from './_components/AppTopBar'
import AppBottomNav from './_components/AppBottomNav'
import ScrollToTop from '@/app/(marketing)/(buyer-app)/_components/ScrollToTop'

export default async function MobileAppLayout({ children }: ChildrenType) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/sign-in')

  return (
    <div className='flex flex-col min-bs-[100dvh] bg-[var(--mui-palette-background-default)]'>
      <ScrollToTop />
      <AppTopBar />
      {/* pb-24 กัน content ทับ bottom nav (fixed); flex-col gap ให้ re-exported page (header+list) เว้นระยะ */}
      <main className='flex-1 pli-4 pbs-4 pbe-24 flex flex-col gap-5'>{children}</main>
      <AppBottomNav />
    </div>
  )
}
