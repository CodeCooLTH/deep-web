import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import VerticalLayout from '@/layouts/VerticalLayout'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { sellerMenuItems } from './_seller-menu'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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
  // No session OR token points to a user that no longer exists in DB (stale
  // cookie from the old synthetic-session bypass) → force re-sign-in.
  // proxy rewrite ครอบ /auth/sign-in → /seller/auth/sign-in ให้อัตโนมัติบน seller subdomain
  if (!session || !user?.id) redirect('/auth/sign-in')

  // Every seller MUST have a shop — auto-create a default one on first visit
  // so they land on a usable dashboard instead of a "create shop" CTA.
  const shop = await prisma.shop.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!shop) {
    await prisma.shop.create({
      data: {
        userId: user.id,
        shopName: `ร้านของ ${user.displayName}`,
        businessType: 'INDIVIDUAL',
      },
    })
  }

  return <VerticalLayout menuItems={sellerMenuItems}>{children}</VerticalLayout>
}
