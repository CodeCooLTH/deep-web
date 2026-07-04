/**
 * Fullscreen overlay layout สำหรับหน้า seller ที่ต้องการ overlay เต็มจอ (เช่น create-order, create-product)
 *
 * ไม่มี Paces fullscreen-overlay layout ตรง ๆ (Explore E2 ยืนยัน: theme/paces/Admin/TS/src/layouts/
 * มีแต่ Vertical/Horizontal/Main ซึ่งเป็น sidebar-shell ทั้งหมด ไม่มี fullscreen-overlay)
 *
 * Nearest structural ref (SafePay domain component):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *   — header pattern (title + action buttons) + bottom action-bar pattern อ้างอิงมาจากไฟล์นี้
 *
 * Wrapper ชั้นนี้ (fixed inset-0 z-50 bg-card) ไม่มี theme source — เป็น SafePay domain component
 * ที่ออกแบบเฉพาะสำหรับ fullscreen overlay workflow (ไม่ใช่ dialog modal; ไม่ใช่ sidebar shell)
 *
 * Guard: ตรวจ session → redirect /auth/sign-in ถ้าไม่มี session
 *        ตรวจ shop → auto-create ถ้า seller ยังไม่มีร้าน (invariant เดียวกับ (dashboard)/layout.tsx)
 */
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { requireActiveShop } from '@/lib/shop-context'

export default async function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user as
    | {
        id: string
        displayName: string
        username: string
        avatar: string | null
        isShop: boolean
        isAdmin: boolean
        trustScore: number
      }
    | undefined
  if (!session || !user?.id) redirect('/auth/sign-in')

  // feature 00012 (Lazy Personal shop): ไม่ auto-create Personal shop อีกต่อไป — ผู้ถูกเชิญ (ADMIN business)
  // ไม่มีร้านของตัวเอง. resolve active shop; ถ้าไม่มีเลย (nobody, ไม่มีทั้ง Personal + membership) → /choose-shop
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/choose-shop')
  // D4: active = Business ที่ยังไม่ onboard (ไม่มี slug) → บังคับไป onboarding (หน้า onboarding อยู่ใต้
  // (dashboard) ไม่ใช่ fullscreen → redirect ข้ามกลุ่มไม่เกิด loop)
  if (active.kind === 'BUSINESS' && !active.shop.slug) {
    redirect(`/business/${active.shop.id}/onboarding`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-card flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto">
        <div className="w-full p-4 md:p-8">{children}</div>
      </main>
    </div>
  )
}
