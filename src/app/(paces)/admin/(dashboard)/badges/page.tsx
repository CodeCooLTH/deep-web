/**
 * Admin /badges list — server component.
 *
 * Base: src/app/(paces)/admin/(dashboard)/users/page.tsx
 * (same-theme Paces server list pattern, itself derived from
 *  theme/paces/Admin/TS/src/app/(admin)/apps/users/contacts/page.tsx).
 *
 * Swap: UsersTable → BadgesTable. Adds a "เพิ่ม Badge" CTA in the page
 * header (Preline hs-overlay trigger for the BadgeFormDialog). Data is
 * fetched directly via Prisma (server-side) mirroring the /users page;
 * admin guard is enforced by the parent (dashboard) layout.
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import BadgesTable from './components/BadgesTable'
import BadgeFormDialog from './components/BadgeFormDialog'
import type { AdminBadgeRow } from './components/BadgesTable'

export const metadata: Metadata = { title: 'Badges' }

export default async function AdminBadgesPage() {
  const badges = await prisma.badge.findMany({
    include: { _count: { select: { userBadges: true } } },
    orderBy: [{ type: 'asc' }, { nameEN: 'asc' }],
  })

  const rows: AdminBadgeRow[] = badges.map((b) => ({
    id: b.id,
    name: b.name,
    nameEN: b.nameEN,
    icon: b.icon,
    // imageUrl: /api/files/<fileId> หรือ null — ใช้ใน BadgeAvatar เป็น primary visual
    imageUrl: b.imageUrl ?? null,
    type: b.type === 'VERIFICATION' ? 'VERIFICATION' : 'ACHIEVEMENT',
    criteria: (b.criteria as Record<string, unknown>) ?? {},
    awardedCount: b._count.userBadges,
  }))

  return (
    <>
      <PageBreadcrumb title="Badges" trail={[{ label: 'Admin' }, { label: 'Business' }]} />
      <BadgesTable rows={rows} />
      <BadgeFormDialog />
    </>
  )
}
