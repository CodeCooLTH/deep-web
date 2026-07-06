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
import MScrollReset from './_components/MScrollReset'

export default async function MobileAppLayout({ children }: ChildrenType) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/sign-in')

  // App-shell จริง: root สูง 100dvh, scroll เกิดใน <main> (ซ่อน scrollbar), AppBottomNav เป็น flex
  // child ชิดล่างเสมอ (ไม่ใช่ fixed) → ไม่มีพื้นเทาลอยใต้แถบ + ไม่มี scrollbar โผล่ข้างขวา
  return (
    <div className='flex flex-col h-[100dvh] overflow-hidden bg-[var(--mui-palette-background-default)]'>
      <MScrollReset />
      <AppTopBar />
      <main
        id='m-scroll'
        className='flex-1 overflow-y-auto overflow-x-hidden pli-4 pbs-4 pbe-8 flex flex-col gap-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {children}
      </main>
      <AppBottomNav />
    </div>
  )
}
