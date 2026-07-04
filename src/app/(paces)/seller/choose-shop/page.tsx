/**
 * /choose-shop — Screen 3 ของ feature 00012 "พนักงาน" (Shop Staff Invite Links)
 * เลือกร้านที่จะเข้าใช้งาน เมื่อ session เป็นสมาชิกมากกว่า 1 ร้าน (post-login routing, design spec §4.4)
 *
 * Route ตรง seller/choose-shop (NOT under (dashboard)/(fullscreen)) — เลี่ยง redirect loop
 * เพราะ layout ใต้กลุ่มนั้นจะ force-redirect มา /choose-shop เมื่อ session มี >=2 ร้าน
 * (ตรง pattern "own shell, direct seller route" ของ src/app/(paces)/seller/onboarding/page.tsx)
 *
 * Base: shell = src/app/(paces)/seller/auth/components/AuthCardShell.tsx
 *       page structure (AuthLogo + heading + client form ใน AuthCardShell) =
 *       src/app/(paces)/seller/auth/sign-in/page.tsx
 *       resolve shop list มิเรอร์ src/app/api/business/context/route.ts
 *       (Personal ผ่าน getPersonalShop + business memberships ผ่าน ShopMember)
 *
 * UX spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md (Screen 3)
 */

import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import AuthLogo from '@/components/AuthLogo'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPersonalShop } from '@/lib/shop-context'
import AuthCardShell from '../auth/components/AuthCardShell'
import ChooseShopClient, { type ShopOption } from './components/ChooseShopClient'

export const metadata: Metadata = { title: 'เลือกร้านค้า' }

export default async function ChooseShopPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) redirect('/auth/sign-in')

  // resolve shop list — มิเรอร์ api/business/context/route.ts: Personal (getPersonalShop)
  // + business memberships (ShopMember where shop.kind=BUSINESS ไม่ soft-delete)
  const personalShop = await getPersonalShop(userId)
  const memberships = await prisma.shopMember.findMany({
    where: { userId, shop: { kind: 'BUSINESS', deletedAt: null } },
    select: { role: true, shop: { select: { id: true, shopName: true, logo: true } } },
  })

  const shops: ShopOption[] = [
    ...(personalShop
      ? [{ shopId: personalShop.id, name: personalShop.shopName, logo: personalShop.logo, role: 'OWNER' as const }]
      : []),
    ...memberships.map((m) => ({
      shopId: m.shop.id,
      name: m.shop.shopName,
      logo: m.shop.logo,
      role: m.role as 'OWNER' | 'ADMIN',
    })),
  ]

  // post-login routing (design spec §4.4): 1 ร้าน = เข้าเลยไม่ต้องเลือก
  if (shops.length === 1) redirect('/dashboard')

  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>
      <ChooseShopClient shops={shops} />
    </AuthCardShell>
  )
}
