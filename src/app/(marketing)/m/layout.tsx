/**
 * Mobile web app shell (/m/*) — แยกจาก desktop/tablet 100%.
 * เข้าถึงผ่าน proxy.ts rewrite เมื่อ detect มือถือ (URL เดิม เช่น /dashboard → render /m).
 * ไม่มี marketing header/footer; ใช้ AppTopBar (sticky) + AppBottomNav (fixed) แบบแอปจริง.
 */
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import classnames from 'classnames'

import type { ChildrenType } from '@core/types'
import { authOptions } from '@/lib/auth'

import AppTopBar from './_components/AppTopBar'
import AppBottomNav from './_components/AppBottomNav'
import MScrollReset from './_components/MScrollReset'
import MBodyBg from './_components/MBodyBg'

export default async function MobileAppLayout({ children }: ChildrenType) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/sign-in')

  // เปิดใน WebView ของ Deep-App (native) → cookie `deep_shell=app` (แอปตั้งผ่าน injected JS)
  // ซ่อน "แถบล่าง" (AppBottomNav) อย่างเดียว เพราะซ้ำกับ native tab bar (= ปุ่ม nav ซ้อน 2 ชั้น)
  // คง AppTopBar ไว้ (โลโก้ + เช็กก่อนโอน + กระดิ่งแจ้งเตือน) — ไม่ชนกับ native + เป็นทางเข้าแจ้งเตือน/เช็ก
  const isApp = (await cookies()).get('deep_shell')?.value === 'app'

  // App-shell จริง: root = fixed inset-0 ตรึงติด viewport เต็มจอ (iOS document เลื่อน/เด้งไม่ขยับ);
  // scroll เกิดใน <main> อย่างเดียว (ซ่อน scrollbar). AppTopBar/AppBottomNav = flex child ตรึงหัว-ท้าย
  return (
    <div className='fixed inset-0 flex flex-col overflow-hidden bg-[var(--mui-palette-background-paper)]'>
      <MScrollReset />
      <MBodyBg />
      <AppTopBar />
      {/* root เป็นขาว (safe-area บนสุด = ขาวกลืน AppTopBar ไม่ดูเว้นว่าง); พื้นเทาให้เฉพาะ content */}
      {/* overscroll-contain: เลื่อนแบบเนทีฟ — bar หัว/ท้ายตรึงนิ่ง, เด้ง (rubber-band) แค่ในเนื้อหา ไม่ลามทั้งหน้า */}
      <main
        id='m-scroll'
        className={classnames(
          'flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pli-4 pbs-4 flex flex-col gap-5 bg-[var(--mui-palette-background-default)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          // เว้นท้ายพ้น AppBottomNav (76px) เฉพาะตอนมีแถบ; ในแอป native ไม่มีแถบเว็บ → เว้นปกติ
          isApp ? 'pbe-6' : 'pbe-[76px]'
        )}
      >
        {children}
      </main>
      {!isApp && <AppBottomNav />}
    </div>
  )
}
