/**
 * Badges page — seller earned/locked badge grid (Design Spec T8b + T8c)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products-grid/page.tsx
 *   — grid layout + section header row pattern
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products-grid/components/ProductCard.tsx
 *   — card shell (Paces `card`, padding, border, hover-lift)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx
 *   — progress bar markup (Examples section: bg-default-100 h-4 overflow-hidden rounded + fill bg-primary)
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx (redirect ถ้าไม่มี session)
 * BadgeGrid เป็น 'use client' island — ถือ selectedBadge state + click handler + modal
 * ไม่แตะ RSC contract ของ page นี้
 *
 * T8c: CRITERIA_CATEGORY_LABEL / getCategoryLabel / EarnedCard / LockedCard ย้ายไปที่:
 *   - _constants/badge-labels.ts (utility)
 *   - BadgeGrid.tsx (client island)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBadgeProgress } from '@/services/badge.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import type { Metadata } from 'next'
import type { BadgeProgress } from '@/types/badge'
import { BadgeGrid } from './BadgeGrid'


export const metadata: Metadata = { title: 'ความสำเร็จของร้านค้า' }
// หมายเหตุ: ไม่ต้องตั้ง dynamic — getServerSession (อ่าน cookie) ทำให้หน้า dynamic
// อยู่แล้ว เหมือน reviews/dashboard sibling. force-dynamic บน child ทำ Paces
// AppProvidersWrapper/LayoutProvider แตก (MenuToggler crash)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BadgesPage() {
  // auth narrowing — layout ทำ redirect แล้ว; type-narrow เหมือน reviews/page.tsx
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  let items: BadgeProgress[] = []
  try {
    items = await getBadgeProgress(user.id, 'SELLER')
  } catch {
    items = []
  }

  // ทำไม earned = filter(earned) แล้ว locked sort desc by progressRatio (ใกล้ถึงก่อน):
  // ผู้ขายควรเห็น badge ที่ใกล้ได้รับก่อน เพื่อ motivate ให้ทำต่อ
  const earned = items.filter((i) => i.earned)
  const locked = items
    .filter((i) => !i.earned)
    .sort((a, b) => b.progressRatio - a.progressRatio)

  return (
    <>
      <PageBreadcrumb title="ความสำเร็จ" trail={[{ label: 'ภาพรวม' }]} />

      {/* BadgeGrid: client island รับผิดชอบ render card + modal state */}
      <BadgeGrid earned={earned} locked={locked} />
    </>
  )
}
