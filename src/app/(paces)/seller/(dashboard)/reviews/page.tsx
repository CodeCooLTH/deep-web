/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/reviews/page.tsx
 *
 * Adaptations from theme:
 * - Data จาก getReviewsByShopUser (real DB) ไม่ใช่ productReviewData mock
 * - RSC ทำ auth guard, aggregate stats, mask buyer contact (PDPA)
 * - Date → .toISOString() ก่อนส่งข้ามขอบเขต RSC→client (ไม่มี Date object ข้าม boundary)
 * - Stripped: ApexChart review-trend (ไม่มี time-series data ใน MVP)
 * - Stripped: Delete/Edit actions (SafePay ไม่ให้ seller ลบรีวิว)
 * - Stripped: Export PDF/CSV/Excel (ไม่ใช้ใน MVP)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReviewsByShopUser } from '@/services/review.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import ProductReviews from './components/ProductReviews'
import type { ReviewRow, SummaryData } from './components/data'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'รีวิวจากลูกค้า' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

// PDPA: ซ่อนข้อมูลติดต่อ เหลือแค่ 4 ตัวท้าย
function maskContact(c: string | null): string {
  if (!c || c.length <= 4) return c ?? '—'
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

// ดึงตัวอักษรแรกเพื่อแสดงเป็น avatar initials
function getInitial(label: string): string {
  const first = label.replace(/^[•@\s]+/, '').charAt(0)
  return first ? first.toUpperCase() : '?'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReviewsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  let rawReviews: Awaited<ReturnType<typeof getReviewsByShopUser>> = []
  try {
    rawReviews = await getReviewsByShopUser(user.id)
  } catch {
    rawReviews = []
  }

  // ── Aggregate stats ──────────────────────────────────────────────────────

  const total = rawReviews.length
  const avgRating =
    total > 0 ? rawReviews.reduce((sum, r) => sum + r.rating, 0) / total : 0

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of rawReviews) {
    const star = (Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5)
    distribution[star] = (distribution[star] ?? 0) + 1
  }

  const summary: SummaryData = {
    total,
    avgRating: Math.round(avgRating * 10) / 10,
    distribution,
  }

  // ── Shape rows ───────────────────────────────────────────────────────────
  // Date → ISO string ที่ RSC boundary เพื่อป้องกัน Date object ข้ามไปยัง client component

  const rows: ReviewRow[] = rawReviews.map((review) => {
    const order = review.order as { publicToken: string; items: { name: string }[] }

    const reviewerLabel: string = review.reviewerContact
      ? maskContact(review.reviewerContact)
      : review.reviewerUserId
        ? 'ผู้ใช้ที่ลงทะเบียน'
        : '—'

    const reviewerInitial = getInitial(reviewerLabel)

    // ส่งเป็น ISO string — client component จะ format เป็นภาษาไทย
    const dateISO = new Date(review.createdAt).toISOString()

    const productName = order?.items?.[0]?.name ?? '—'

    return {
      id: review.id,
      reviewerLabel,
      reviewerInitial,
      rating: review.rating,
      comment: review.comment ?? null,
      dateISO,
      productName,
      orderToken: order?.publicToken ?? '',
    }
  })

  return (
    <>
      <PageBreadcrumb title="รีวิว" trail={[{ label: 'การขาย' }]} />
      <ProductReviews reviews={rows} summary={summary} />
    </>
  )
}
