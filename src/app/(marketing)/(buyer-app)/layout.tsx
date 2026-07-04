/**
 * Buyer authed app shell — Shopee-inspired layout (2026-04-18)
 *
 * Sequence:
 *   1. FrontLayout (marketing header + footer) — top menu เห็นเสมอ
 *   2. Boxed container (max-w-7xl, centered)
 *   3. Left AccountSidebar (user card + menu) + right content
 *
 * AuthGuard: redirect → /auth/sign-in ถ้าไม่ login
 *
 * Replaces Vuexy VerticalLayout shell (R2 era) per user request — อยากให้
 * buyer รู้สึกว่ายังอยู่ใน marketing site แทนที่จะเป็น "app dashboard" แยก
 *
 * Base: composed — FrontLayout มาจาก Vuexy front-pages layout,
 * sidebar+content grid จาก Shopee pattern (reference image)
 */
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import type { ChildrenType } from '@core/types'
import FrontLayout from '@components/layout/front-pages'

import { authOptions } from '@/lib/auth'
import BuyerChatWidget from '@/components/chat/BuyerChatWidget'

import AccountSidebar from './_components/AccountSidebar'
import ScrollToTop from './_components/ScrollToTop'

export default async function BuyerAppLayout({ children }: ChildrenType) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/auth/sign-in')
  }

  return (
    <FrontLayout solidHeader>
      <ScrollToTop />
      <div className='min-bs-[100dvh]'>
        {/* ความกว้างต้อง match FrontLayout Header navbar:
             100% - 48px ที่ทุก breakpoint, max-inline-size
             900/1200/1440px ที่ 900/1200/1920px — ดู
             src/components/layout/front-pages/styles.module.css .navbar */}
        <div
          className={[
            'mx-auto w-[calc(100%-48px)]',
            'min-[900px]:max-w-[calc(900px-48px)]',
            'min-[1200px]:max-w-[calc(1200px-48px)]',
            'min-[1920px]:max-w-[calc(1440px-48px)]',
            // Vuexy remap: md=900/lg=1200 → ใช้ min-[768px]: (arbitrary) ให้ตรง 768 เป๊ะ
            // เมนูซ้ายโผล่ตั้งแต่ iPad (768+); มือถือ (<768) stacked รอจัดทีหลัง
            'py-6 min-[768px]:py-10 flex flex-col min-[768px]:flex-row gap-6',
          ].join(' ')}
        >
          <aside className='min-[768px]:w-60 shrink-0'>
            <AccountSidebar />
          </aside>
          <main className='flex-1 min-w-0 flex flex-col gap-6'>{children}</main>
        </div>
      </div>
      {/* ChatWidget floating bubble — mount เฉพาะ authed (layout นี้ redirect ไป sign-in ถ้าไม่มี session แล้วด้านบน) */}
      <BuyerChatWidget />
    </FrontLayout>
  )
}
