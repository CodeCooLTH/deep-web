/**
 * /admins — จัดการลิงก์เชิญพนักงาน + สมาชิกทั้งหมดของ Business shop (feature 00012, Task 4.3)
 *
 * Base (card shell): theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card>card-header+card-body)
 * chase ผ่าน src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx
 *   (members/quota RSC pattern — session guard, subscription tier lookup, memberRows mapping)
 * UX Spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md Screen 1
 * Design Spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-design.md §5.2
 *
 * Guard: active.kind==='BUSINESS' && active.role==='OWNER' → notFound() ถ้าไม่ใช่ (ผู้ถูกเชิญ/ADMIN และ
 *   Personal shop เข้าตรง URL ไม่ได้ — mirror การซ่อนเมนูด้วย applyCapabilityMenu (BUSINESS_ONLY_SLUGS) ใน role-nav.ts แต่ต้อง
 *   gate ที่ RSC ด้วยเพราะ URL เข้าตรงได้เสมอ ไม่ได้ผูกกับเมนู)
 *
 * PII: หน้านี้ไม่มี raw contact (phone/email) ใด ๆ — invite link เป็น capability-URL ไม่ผูก contact
 *   ผู้ถูกเชิญคนใดคนหนึ่ง (ต่างจาก ShopInvite เดิม), displayName ของสมาชิกไม่ใช่ raw PII เทียบเท่า
 *   phone/email (mirror invites/page.tsx เดิม — ไม่ mask) จึงไม่ต้อง mask เพิ่มที่นี่
 */

import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import { listMembers } from '@/services/shop-member.service'
import { listActiveInviteLinks } from '@/services/invite-link.service'
import { buildInviteUrl } from '@/lib/invite-link'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { isLoginProvider } from '@/components/safepay/LoginProviderLogo'
import { canUseAppointments } from '@/lib/appointments'
import CurrentMembersTable from '../business/[shopId]/invites/components/CurrentMembersTable'
import InviteLinkModal from './components/InviteLinkModal'

export const metadata: Metadata = { title: 'พนักงาน' }

export default async function AdminsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // 00071 T2: บทบาทที่ไม่มีสิทธิ์เห็นการ์ดบอกเหตุผล (ไม่ใช่ 404 เงียบ) — ตัดก่อน query ข้อมูลของหน้า
  const gate = await gatePage(session, 'T2')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="พนักงาน" />
        <NoPermissionCard capability="T2" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  // ไม่ใช่ owner ของ Business shop → notFound() (context isolation — ไม่บอกเหตุผลให้คนนอกเดา)
  if (!active || active.kind !== 'BUSINESS' || active.role !== 'OWNER') notFound()

  const shop = active.shop
  // BILLING เลือกได้เฉพาะร้านบริการ — คำนวณฝั่ง server แล้วส่งลงไป (ไม่ให้ client เดาเอง)
  const billingAvailable = canUseAppointments(shop)

  // owner's subscription tier — resolve โควตา maxAdminsPerBusiness (mirror invites/page.tsx)
  const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } })
  const hasActivePackage = sub?.status === 'ACTIVE'
  const tier = sub?.tier as BusinessPackageTier | undefined
  const maxAdmins = hasActivePackage && tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].maxAdminsPerBusiness : 0
  const tierLabel = hasActivePackage && tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].label : null

  const [members, links] = await Promise.all([
    listMembers(shop.id),
    listActiveInviteLinks(shop.id),
  ])

  // โควตานับทุกคนยกเว้นเจ้าของหลัก — เจ้าของร่วมก็นับ (EXT 00012 BR-MR-06, staffCountWhere)
  const adminCount = members.filter((m) => m.userId !== shop.userId).length
  const quotaLabel = tierLabel
    ? `สมาชิก ${adminCount}${maxAdmins !== null ? `/${maxAdmins}` : ''} คน ไม่นับเจ้าของหลัก (แพ็กเกจ ${tierLabel})`
    : `สมาชิก ${adminCount} คน ไม่นับเจ้าของหลัก (ไม่มีแพ็กเกจ)`

  const memberRows = members.map((m) => ({
    id: m.id,
    role: m.role as 'OWNER' | 'ADMIN',
    roles: m.roles,
    displayName: m.user.displayName || m.user.username || 'ไม่ระบุชื่อ',
    avatar: m.user.avatar,
    providers: [
      ...[...new Set(m.user.authAccounts.map((a) => a.provider))].filter(isLoginProvider),
      ...(m.user.hasPassword ? (['PASSWORD'] as const) : []),
    ],
    createdAt: m.createdAt.toISOString(),
    isPrimary: m.userId === shop.userId,
    isSelf: m.userId === user.id,
  }))

  const linkRows = links.map((l) => ({
    url: buildInviteUrl(l.slug),
    slug: l.slug,
    expiresAt: l.expiresAt.toISOString(),
    roles: l.roles,
  }))

  return (
    <>
      {/* ลิงก์เชิญย้ายจากการ์ดบนหน้า → โมดัลที่เรียกจากปุ่มระดับหน้า (feature 00012 ext)
          หน้าจึงเหลือเนื้อหาหลักอย่างเดียว = รายชื่อสมาชิก */}
      <PageBreadcrumb title="พนักงาน" action={<InviteLinkModal links={linkRows} billingAvailable={billingAvailable} />} />

      <div className="gap-5 grid grid-cols-1">
        <CurrentMembersTable
          members={memberRows}
          shopId={shop.id}
          canManage
          billingAvailable={billingAvailable}
          title={`สมาชิกทั้งหมด (${members.length})`}
          headerRight={<span className="badge bg-default-100 text-default-600 text-2xs">{quotaLabel}</span>}
        />
      </div>
    </>
  )
}
