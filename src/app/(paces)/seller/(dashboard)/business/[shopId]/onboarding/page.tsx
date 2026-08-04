/**
 * /business/[shopId]/onboarding — บังคับตั้งค่าร้าน Business ครั้งแรกก่อนใช้งาน (feat 00008 Phase 4, P4-7)
 * Design Spec: docs/superpowers/specs/2026-07-03-00008-business-full-workspace-design.md §2.4
 * Scope Baseline: docs/scope/2026-07-03-00008-phase4-scope-baseline.md P4-7
 *
 * Base (step-flow state machine — ตัด phone/OTP + step "ที่อยู่" ที่ personal มีแต่
 *   CreateBusinessShopSchema ไม่มี field address ให้ต่อ): src/app/(paces)/seller/onboarding/page.tsx
 *   (personal onboarding wizard — เหลือ 3 จาก 4 step: หมวดหมู่→URL→สินค้าแรก)
 * Base (layout wrapper — หน้านี้อยู่ใต้ (dashboard) มี sidebar/topbar ต่างจาก personal onboarding
 *   ที่เป็น full-screen ก่อนเข้า dashboard จริง): src/app/(paces)/seller/(dashboard)/business/create/page.tsx
 *   (PageBreadcrumb + card mx-auto pattern)
 * Base (field markup step ข้อมูลร้าน — ชื่อ/หมวดหมู่/โลโก้): src/app/(paces)/seller/(dashboard)/shop/components/ShopForm.tsx
 *
 * Guard (owner-only — onboard = ตั้งค่าเริ่มต้นร้าน สงวนสิทธิ์เจ้าของ, ไม่ใช่ admin member ที่ owner เชิญมาทีหลัง):
 *   1. session → ไม่ login → /auth/sign-in
 *   2. shop = findUnique(shopId) → ไม่มี/ไม่ใช่ BUSINESS/ถูกลบ → notFound() (context isolation — mirror
 *      src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx)
 *   3. shop.userId !== userId → notFound() (ซ่อนจาก admin-member ด้วย — onboard ไม่ใช่สิ่งที่ admin ควรรู้ URL)
 *   4. shop.slug มีแล้ว (onboard เสร็จแล้ว) → redirect('/business') กัน onboard ซ้ำ
 */

import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from '@/lib/lodging'
import BusinessOnboardingWizard from './components/BusinessOnboardingWizard'

export const metadata: Metadata = { title: 'ตั้งค่าร้านธุรกิจ' }

interface BusinessOnboardingPageProps {
  params: Promise<{ shopId: string }>
}

export default async function BusinessOnboardingPage({ params }: BusinessOnboardingPageProps) {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')
  const userId = user.id as string

  const { shopId } = await params

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      shopName: true,
      category: true,
      logo: true,
      userId: true,
      kind: true,
      slug: true,
      deletedAt: true,
      // feature 00028 (A2b) — step สุดท้ายของ wizard ต้องรู้ vertical เพื่อแตกฟอร์มให้ถูกประเภท
      vertical: true,
    },
  })

  // ไม่มี/ไม่ใช่ BUSINESS/ถูกลบ → notFound (context isolation, ไม่ leak การมีอยู่ของ shop)
  if (!shop || shop.kind !== 'BUSINESS' || shop.deletedAt) notFound()
  // ไม่ใช่เจ้าของ → notFound เหมือนกัน (แม้เป็น admin member ก็ไม่ควรเห็น URL onboard ของเจ้าของ)
  if (shop.userId !== userId) notFound()
  // onboard เสร็จแล้ว (มี slug) → กันเข้าซ้ำ พากลับหน้าจัดการธุรกิจ
  if (shop.slug) redirect('/business')

  // shop.vertical เป็น String ในสคีมา (constant ไม่ใช่ DB enum ตาม src/lib/lodging.ts) — cast แบบมี guard
  const vertical = isShopVertical(shop.vertical) ? shop.vertical : DEFAULT_SHOP_VERTICAL

  return (
    <>
      <PageBreadcrumb title={`ตั้งค่าร้าน — ${shop.shopName}`} trail={[{ label: 'ธุรกิจ', href: '/business' }]} />
      <BusinessOnboardingWizard
        shopId={shop.id}
        initialShopName={shop.shopName}
        initialCategory={shop.category ?? ''}
        initialLogo={shop.logo ?? ''}
        vertical={vertical}
      />
    </>
  )
}
