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

  // App-shell จริง: root = fixed inset-0 ตรึงติด viewport (iOS document เลื่อน/เด้งยังไงก็ไม่ขยับ),
  // scroll เกิดใน <main> อย่างเดียว (ซ่อน scrollbar). AppTopBar/AppBottomNav = flex child ตรึงหัว-ท้าย
  return (
    <div className='fixed inset-0 flex flex-col overflow-hidden bg-[var(--mui-palette-background-paper)]'>
      <MScrollReset />
      <AppTopBar />
      {/* root เป็นขาว (safe-area บนสุด = ขาวกลืน AppTopBar ไม่ดูเว้นว่าง); พื้นเทาให้เฉพาะ content */}
      {/* overscroll-contain: เลื่อนแบบเนทีฟ — bar หัว/ท้ายตรึงนิ่ง, เด้ง (rubber-band) แค่ในเนื้อหา ไม่ลามทั้งหน้า */}
      <main
        id='m-scroll'
        className='flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pli-4 pbs-4 pbe-8 flex flex-col gap-5 bg-[var(--mui-palette-background-default)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {children}
      </main>
      <AppBottomNav />
    </div>
  )
}
