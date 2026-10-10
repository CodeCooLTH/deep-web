/**
 * /business/[shopId]/invites — จัดการคำเชิญพนักงาน + สมาชิกปัจจุบันของ Business shop (feat 00008 P3-5)
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

import { shouldHidePayments } from '@/lib/app-shell-server'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessShopWith } from '@/lib/shop-capability'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import { listMembers } from '@/services/shop-member.service'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import LockedStateBanner from '../../components/LockedStateBanner'
import { isLoginProvider } from '@/components/safepay/LoginProviderLogo'
import CurrentMembersTable from './components/CurrentMembersTable'
import { canUseAppointments } from '@/lib/appointments'
import { listMutedUserIds } from '@/services/notification-pref.service'

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

  // 1. ด่านบทบาท (T2 = เจ้าของ รวมเจ้าของร่วม · มติ C-3) — ผู้ดูแล/คนนอกได้การ์ด ไม่เห็นรายชื่อสมาชิก
  //    ตัดสินกับ "ร้านตาม URL" ไม่ใช่ร้านที่ active จึงใช้ canAccessShopWith · ไม่ยืนยันว่าร้านมีจริง (การ์ดไม่มีชื่อร้าน)
  if (!(await canAccessShopWith(shopId, userId, 'T2'))) {
    return (
      <>
        <PageBreadcrumb title="สมาชิกธุรกิจ" trail={[{ label: 'ธุรกิจ', href: '/business' }]} />
        <NoPermissionCard capability="T2" viewerRoles={[]} />
      </>
    )
  }

  // 2. shop record — เฉพาะ BUSINESS shop เท่านั้นที่มีแนวคิด invite/member (PERSONAL ไม่เกี่ยว)
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true, shopName: true, userId: true, kind: true, vertical: true,
      packageLockedAt: true, packageLockReason: true, deletedAt: true,
    },
  })
  if (!shop || shop.kind !== 'BUSINESS' || shop.deletedAt) notFound()

  const isOwner = shop.userId === userId
  const isLocked = shop.packageLockedAt !== null

  // 3. owner's subscription tier — tierPrice ใช้เฉพาะ LockedStateBanner
  const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId: shop.userId } })
  const hasActivePackage = sub?.status === 'ACTIVE'
  const tier = sub?.tier as BusinessPackageTier | undefined
  /**
   * 🛑 ในแอป iOS ห้ามให้ราคาแพ็กเกจหลุดออกไปถึงหน้าจอเลย (Guideline 3.1.1)
   * หน้านี้ไม่ได้ถูกกันทั้งหน้าเพราะเป็นหน้า "จัดการพนักงาน" ซึ่งผู้ขายต้องใช้ได้ในแอป —
   * ตัดเฉพาะส่วนที่ชวนจ่ายเงินออก ไม่ใช่ตัดฟีเจอร์
   */
  const hidePayments = await shouldHidePayments()
  const tierPrice =
    !hidePayments && hasActivePackage && tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].priceBaht : undefined

  // 4. members — เรียก service ตรง (ไม่ fetch HTTP เอง, RSC convention)
  const members = await listMembers(shopId)

  // (ส่วนขยาย 00025 2026-08-12) ใครปิดแจ้งเตือนของร้านนี้ไว้ — fail-closed เงียบ:
  // อ่านไม่ได้ = ไม่ติดป้าย (ดีกว่าทำให้หน้าสมาชิกล่มทั้งหน้าเพราะป้ายเสริมอันเดียว)
  const mutedUserIds = await listMutedUserIds(shopId).catch(() => new Set<string>())

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
    isSelf: m.userId === userId,
    notificationsOff: mutedUserIds.has(m.userId),
  }))

  return (
    <>
      <PageBreadcrumb title={`สมาชิก — ${shop.shopName}`} trail={[{ label: 'ธุรกิจ', href: '/business' }]} />

      {isLocked && (
        <LockedStateBanner
          lockReason={shop.packageLockReason ?? ''}
          packageLockedAt={shop.packageLockedAt}
          tierPrice={tierPrice}
          hidePayments={hidePayments}
          level="shop"
        />
      )}

      <div className="gap-5 grid grid-cols-1">
        {/* feature 00012: การเชิญพนักงานย้ายไปเมนู "พนักงาน" (ลิงก์เชิญ) — แสดงเฉพาะ owner */}
        {isOwner && (
          <div className="card">
            <div className="card-body flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-default-600 text-sm mb-0">เชิญพนักงานเข้าร้านด้วย “ลิงก์เชิญ” ได้ที่เมนูพนักงาน</p>
                <p className="text-default-700 text-sm mt-1 mb-0">
                  ข้อมูลการเงินของร้าน (ยอดขายรวม กำไร ต้นทุน ค่าใช้จ่าย ยอดซื้อสะสมของลูกค้า และกระเป๋าเงินของร้าน) เห็นได้เฉพาะเจ้าของร้าน พนักงานทุกบทบาทจะไม่เห็นตัวเลขเหล่านี้
                </p>
              </div>
              <Link href="/admins" className="btn btn-sm bg-primary text-white hover:bg-primary-hover">
                ไปหน้าพนักงาน
              </Link>
            </div>
          </div>
        )}
        <CurrentMembersTable members={memberRows} shopId={shopId} canManage={members.some((m) => m.userId === userId && m.role === 'OWNER')}
          billingAvailable={canUseAppointments(shop)}
        />
      </div>
    </>
  )
}
