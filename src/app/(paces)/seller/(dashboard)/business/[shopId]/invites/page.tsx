/**
 * /business/[shopId]/invites — จัดการคำเชิญผู้ดูแล + สมาชิกปัจจุบันของ Business shop (feat 00008 P3-5)
 *
 * Base (shell/card): theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx card shell — chase ผ่าน
 *   src/app/(paces)/seller/(dashboard)/business/create/page.tsx (PageBreadcrumb + card grid pattern)
 * Design Spec: docs/superpowers/specs/2026-07-02-00008-business-ui-design-spec.md §4
 * API: docs/20 - Features/00008 - Business Account & Packages/API.md §4.10-4.14
 *
 * Guard: getServerSession → isShopMember(shopId, userId) → ไม่ใช่สมาชิก → notFound()
 *   (context isolation — ไม่บอกว่า shop มีอยู่จริงหรือไม่ให้คนนอก, ตาม feedback_rsc_dal_authz)
 *
 * PII: `listInvites` คืน invitedContact ดิบ (raw PII) โดยตั้งใจ (ดู comment ใน shop-member.service.ts) —
 *   mask ที่นี่ (RSC boundary) ก่อนส่งเข้า client component เสมอ (feedback_rsc_pii_neutralize_at_source)
 *   maskInviteContact ด้านล่าง duplicate ของ src/app/api/business/shops/[shopId]/invites/route.ts โดยตั้งใจ —
 *   route.ts เป็น Next.js route handler ห้าม export ฟังก์ชันเสริมออกไปใช้ที่อื่น (invalid Route export field)
 *
 * canManage (isOwner): API §4.10/§4.12/§4.14 เป็น owner-only (403 NOT_OWNER ถ้า admin เรียก) — ซ่อนปุ่ม
 *   action ฝั่ง UI ให้ admin viewer กันกดแล้วเจอ error ที่คาดเดาไม่ได้ (แม้ตัว list เป็น member-scoped)
 */

import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isShopMember } from '@/lib/shop-context'
import { listMembers } from '@/services/shop-member.service'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import LockedStateBanner from '../../components/LockedStateBanner'
import CurrentMembersTable from './components/CurrentMembersTable'
import FinanceVisibilityToggle from './components/FinanceVisibilityToggle'

export const metadata: Metadata = { title: 'สมาชิกธุรกิจ' }

// feature 00012: การเชิญพนักงานย้ายไปเป็น "ลิงก์เชิญ" ที่เมนู "พนักงาน" (/admins) แล้ว — เลิกใช้
// contact-match (เบอร์/อีเมล) ตามที่ user ตัดสิน ("ลิงก์อย่างเดียว"). หน้านี้เหลือเป็น member viewer
// ต่อ business (เข้าจากหน้า /business billing) — InviteMemberForm/PendingInvitesTable ถูกถอดออก

interface InvitesPageProps {
  params: Promise<{ shopId: string }>
}

export default async function InvitesPage({ params }: InvitesPageProps) {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')
  const userId = user.id as string

  const { shopId } = await params

  // 1. membership guard — context isolation (ไม่ leak การมีอยู่ของ shop ให้คนนอก)
  if (!(await isShopMember(shopId, userId))) notFound()

  // 2. shop record — เฉพาะ BUSINESS shop เท่านั้นที่มีแนวคิด invite/member (PERSONAL ไม่เกี่ยว)
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true, shopName: true, userId: true, kind: true,
      packageLockedAt: true, packageLockReason: true, deletedAt: true,
      staffCanViewFinance: true,
    },
  })
  if (!shop || shop.kind !== 'BUSINESS' || shop.deletedAt) notFound()

  const isOwner = shop.userId === userId
  const isLocked = shop.packageLockedAt !== null

  // 3. owner's subscription tier — tierPrice ใช้เฉพาะ LockedStateBanner
  const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } })
  const hasActivePackage = sub?.status === 'ACTIVE'
  const tier = sub?.tier as BusinessPackageTier | undefined
  const tierPrice = hasActivePackage && tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].priceBaht : undefined

  // 4. members — เรียก service ตรง (ไม่ fetch HTTP เอง, RSC convention)
  const members = await listMembers(shopId)

  const memberRows = members.map((m) => ({
    id: m.id,
    role: m.role as 'OWNER' | 'ADMIN',
    displayName: m.user.displayName || m.user.username || 'ไม่ระบุชื่อ',
    createdAt: m.createdAt.toISOString(),
  }))

  return (
    <>
      <PageBreadcrumb title={`สมาชิก — ${shop.shopName}`} trail={[{ label: 'ธุรกิจ', href: '/business' }]} />

      {isLocked && (
        <LockedStateBanner
          lockReason={shop.packageLockReason ?? ''}
          packageLockedAt={shop.packageLockedAt}
          tierPrice={tierPrice}
          level="shop"
        />
      )}

      <div className="gap-5 grid grid-cols-1">
        {/* feature 00016 Unit 5C: toggle staffCanViewFinance — owner-only (defense-in-depth, backend ก็ owner-only) */}
        {isOwner && (
          <FinanceVisibilityToggle shopId={shop.id} initial={shop.staffCanViewFinance} locked={isLocked} />
        )}
        {/* feature 00012: การเชิญพนักงานย้ายไปเมนู "พนักงาน" (ลิงก์เชิญ) — แสดงเฉพาะ owner */}
        {isOwner && (
          <div className="card">
            <div className="card-body flex flex-wrap items-center justify-between gap-3">
              <p className="text-default-600 text-sm mb-0">
                เชิญพนักงานเข้าร้านด้วย “ลิงก์เชิญ” ได้ที่เมนูพนักงาน
              </p>
              <Link href="/admins" className="btn btn-sm bg-primary text-white hover:bg-primary-hover">
                ไปหน้าพนักงาน
              </Link>
            </div>
          </div>
        )}
        <CurrentMembersTable members={memberRows} shopId={shopId} canManage={isOwner} />
      </div>
    </>
  )
}
