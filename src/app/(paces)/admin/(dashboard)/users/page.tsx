/**
 * Admin /users list — server component.
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/contacts/page.tsx
 * (Paces contacts-style user list). Card-grid layout swapped for a DataTable
 * to show tabular columns the admin needs (trust score, verification level,
 * flags, registration date). Search input + filter chip row kept from theme;
 * table body uses the same-theme paces DataTable pattern adopted for seller
 * customers.
 *
 * Data: direct Prisma (server→server) — /api/admin/users is the HTTP shape
 * used by clients; for this RSC a direct call is simpler. AuthGuard for
 * isAdmin is enforced by the parent (dashboard) layout (A1).
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDate } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import { getTrustLevel } from '@/services/trust-score.service'
import type { Metadata } from 'next'
import UsersTable from './components/UsersTable'
import type { AdminUserRow } from './components/data'

export const metadata: Metadata = { title: 'ผู้ใช้งาน' }

const thDate = (d: Date): string => formatDate(d)

// Resolve the buyer-facing URL for /u/{username}. Admin runs on `admin.<host>`
// — relative path 404s because admin doesn't serve /u/*. Preference order:
// 1. NEXT_PUBLIC_BUYER_URL (explicit env — safest cross-env)
// 2. Dev default http://deepth.local:4000 (when NODE_ENV != production)
// 3. Prod default https://deepthailand.app (production brand domain)
const resolveProfileUrl = (username: string): string => {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL
  if (envUrl) return `${envUrl.replace(/\/$/, '')}/u/${username}`
  const base =
    process.env.NODE_ENV !== 'production'
      ? 'http://deepth.local:4000'
      : 'https://deepthailand.app'
  return `${base}/u/${username}`
}

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    include: {
      verifications: {
        where: { status: 'APPROVED' },
        select: { level: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const rows: AdminUserRow[] = users.map((u) => {
    const maxLevel = u.verifications.length
      ? Math.max(...u.verifications.map((v) => v.level))
      : 0
    const clamped = (Math.max(0, Math.min(3, maxLevel)) as 0 | 1 | 2 | 3)
    return {
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      avatar: u.avatar,
      phone: u.phone,
      email: u.email,
      trustScore: u.trustScore,
      trustLevel: getTrustLevel(u.trustScore),
      maxVerifiedLevel: clamped,
      isShop: u.isShop,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString(),
      createdAtTh: thDate(u.createdAt),
      profileUrl: resolveProfileUrl(u.username),
    }
  })

  return (
    <>
      <PageBreadcrumb title="ผู้ใช้งาน" trail={[{ label: 'ผู้ดูแล' }, { label: 'ผู้ใช้' }]} />
      <UsersTable users={rows} />
    </>
  )
}
