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
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isShopMember } from '@/lib/shop-context'
import { maskPhone } from '@/lib/phone-mask'
import { listInvites, listMembers } from '@/services/shop-member.service'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import LockedStateBanner from '../../components/LockedStateBanner'
import InviteMemberForm from './components/InviteMemberForm'
import PendingInvitesTable from './components/PendingInvitesTable'
import CurrentMembersTable from './components/CurrentMembersTable'

export const metadata: Metadata = { title: 'จัดการสมาชิกธุรกิจ' }

// mask invitedContact ที่ RSC boundary — ห้ามส่ง PHONE/EMAIL ดิบเข้า client component
// (mirror ของ maskInviteContact ใน src/app/api/business/shops/[shopId]/invites/route.ts — ดู comment บนไฟล์)
function maskInviteContact(contact: string, contactType: string): string {
  if (contactType === 'PHONE') return maskPhone(contact)
  const at = contact.indexOf('@')
  if (at <= 1) return '***' + contact.slice(at)
  return contact[0] + '***' + contact.slice(at)
}

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
    },
  })
  if (!shop || shop.kind !== 'BUSINESS' || shop.deletedAt) notFound()

  const isOwner = shop.userId === userId
  const isLocked = shop.packageLockedAt !== null

  // 3. owner's subscription tier — resolve โควตา maxAdminsPerBusiness (fail-closed: ไม่มี/ไม่ ACTIVE = 0)
  const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } })
  const hasActivePackage = sub?.status === 'ACTIVE'
  const tier = sub?.tier as BusinessPackageTier | undefined
  const maxAdmins = hasActivePackage && tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].maxAdminsPerBusiness : 0
  const tierPrice = hasActivePackage && tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].priceBaht : undefined

  // 4. members + invites — เรียก service ตรง (ไม่ fetch HTTP เอง, RSC convention)
  const [members, invites] = await Promise.all([listMembers(shopId), listInvites(shopId)])

  const adminCount = members.filter((m) => m.role === 'ADMIN').length
  const quotaFull = maxAdmins !== null && adminCount >= maxAdmins
  const quotaLabel = maxAdmins === null ? `${adminCount} ใช้แล้ว` : `${adminCount}/${maxAdmins} ใช้แล้ว`

  let disabledReason: string | null = null
  if (!isOwner) disabledReason = 'เฉพาะเจ้าของร้านเท่านั้นที่เชิญผู้ดูแลได้'
  else if (isLocked) disabledReason = 'ธุรกิจนี้ถูกล็อกอยู่ ไม่สามารถเชิญผู้ดูแลได้'
  else if (!hasActivePackage) disabledReason = 'ไม่มีแพ็กเกจที่ใช้งานอยู่'
  else if (quotaFull) disabledReason = 'ครบโควตาผู้ดูแลของแพ็กเกจนี้แล้ว'
  const formDisabled = disabledReason !== null

  const maskedInvites = invites.map((i) => ({
    id: i.id,
    invitedContact: maskInviteContact(i.invitedContact, i.contactType),
    contactType: i.contactType as 'PHONE' | 'EMAIL',
    createdAt: i.createdAt.toISOString(),
  }))

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
        <InviteMemberForm
          shopId={shopId}
          disabled={formDisabled}
          disabledReason={disabledReason}
          quotaLabel={quotaLabel}
        />
        <PendingInvitesTable invites={maskedInvites} shopId={shopId} canManage={isOwner} />
        <CurrentMembersTable members={memberRows} shopId={shopId} canManage={isOwner} />
      </div>
    </>
  )
}
