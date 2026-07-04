/**
 * Admin /subscriptions list — server component (read-only).
 *
 * Base: src/app/(paces)/admin/(dashboard)/users/page.tsx
 * (RSC query + map + render pattern เดียวกัน — direct Prisma, take:200, resolveProfileUrl helper)
 *
 * Goal: ให้ admin เห็นภาพรวมว่าแต่ละร้านใช้แพ็กเกจอะไร (Stock Pro รายร้าน + Business Package
 * ระดับเจ้าของ) — read-only เท่านั้น (S-13, D-2). ไม่มี action ใด ๆ ในตาราง.
 *
 * PII (S-15): select ไม่ดึง phone/email ของเจ้าของเด็ดขาด (neutralize-by-omission) — กัน PII หลุด
 * เข้า RSC flight (หน้าอยู่ใต้ client layout ของ Paces AppProvidersWrapper).
 *
 * AuthGuard สำหรับ isAdmin บังคับที่ parent (dashboard) layout แล้ว (A1) — หน้านี้ไม่ต้องเช็คซ้ำ.
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import SubscriptionsTable from './components/SubscriptionsTable'
import { toAdminSubscriptionRow, type AdminSubscriptionRow } from './components/data'

export const metadata: Metadata = { title: 'แพ็กเกจ' }

// Resolve the buyer-facing URL for /u/{username}. Admin runs on `admin.<host>`
// — relative path 404s because admin doesn't serve /u/*. Preference order:
// 1. NEXT_PUBLIC_BUYER_URL (explicit env — safest cross-env)
// 2. Dev default http://deepth.local:4000 (when NODE_ENV != production)
// 3. Prod default https://deepthailand.app (production brand domain)
// (คัดลอกจาก admin/users/page.tsx — page-local helper เดิม ไม่ export จากที่นั้น)
const resolveProfileUrl = (username: string): string => {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL
  // .trim() กัน env ที่มี trailing newline/space (กัน URL พังกลางทาง); ตัด trailing slash ซ้ำ
  if (envUrl) return `${envUrl.trim().replace(/\/+$/, '')}/u/${username}`
  const base =
    process.env.NODE_ENV !== 'production'
      ? 'http://deepth.local:4000'
      : 'https://deepthailand.app'
  return `${base}/u/${username}`
}

export default async function AdminSubscriptionsPage() {
  const shops = await prisma.shop.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      shopName: true,
      kind: true,
      logo: true,
      wallet: { select: { balance: true } },
      inventoryEntitlement: { select: { status: true, package: true, nextRenewalAt: true } },
      user: {
        select: {
          displayName: true,
          username: true,
          // 🛑 ห้ามเพิ่ม phone/email ที่นี่ — PII เจ้าของไม่จำเป็นต่อหน้านี้ (S-15)
          businessPackageSubscription: { select: { tier: true, status: true, nextRenewalAt: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const rows: AdminSubscriptionRow[] = shops.map((s) => toAdminSubscriptionRow(s, resolveProfileUrl))

  return (
    <>
      <PageBreadcrumb title="แพ็กเกจ" trail={[{ label: 'ผู้ดูแล' }, { label: 'แพ็กเกจ' }]} />
      <SubscriptionsTable rows={rows} />
    </>
  )
}
