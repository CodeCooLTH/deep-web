import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getReviewsByBuyer } from '@/services/review.service'

import PageHeader from '@/app/(marketing)/(buyer-app)/_components/PageHeader'
import SearchBox from '@/app/(marketing)/(buyer-app)/_components/SearchBox'
import ManageReviews, { type BuyerReviewRow } from '@views/apps/ecommerce/manage-reviews'

/**
 * Buyer "My Reviews" list.
 *
 * Base:
 *   theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/apps/ecommerce/manage-reviews/page.tsx
 * Adapted: server-side session + Prisma fetch via getReviewsByBuyer; flatten
 *   Date → ISO string so the row payload is JSON-serialisable across the RSC
 *   boundary. Dropped <TotalReviews /> / <ReviewsStatistics /> in the view shell.
 */

export const metadata: Metadata = { title: 'รีวิวที่ให้' }

const VALID_RATINGS = new Set(['ALL', '5', '4', '3', '2', '1'])

export default async function MyReviewsPage({
  searchParams
}: {
  searchParams: Promise<{ rating?: string; q?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/reviews')

  const userId = (session.user as { id: string }).id
  const { rating: rawRating = 'ALL', q = '' } = await searchParams
  const rating = VALID_RATINGS.has(rawRating) ? rawRating : 'ALL'
  const query = q.trim().toLowerCase()

  const allReviews = await getReviewsByBuyer(userId)
  const byRating = rating === 'ALL' ? allReviews : allReviews.filter(r => r.rating === Number(rating))
  // ค้นหา (in-memory): ชื่อร้าน หรือ ข้อความรีวิว
  const reviews = query
    ? byRating.filter(
        r =>
          (r.comment?.toLowerCase().includes(query) ?? false) ||
          r.order.shop.user.displayName.toLowerCase().includes(query)
      )
    : byRating

  // Date is not JSON-safe across the server/client boundary — flatten to ISO.
  const reviewsData: BuyerReviewRow[] = reviews.map(r => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    order: {
      publicToken: r.order.publicToken,
      items: r.order.items.map(it => ({ id: it.id, name: it.name })),
      shop: {
        user: {
          displayName: r.order.shop.user.displayName,
          username: r.order.shop.user.username
        }
      }
    }
  }))

  return (
    <>
      <PageHeader
        title='รีวิวที่ให้'
        subtitle={`รวม ${allReviews.length} รีวิว`}
        action={<SearchBox placeholder='ค้นหาร้าน / ข้อความรีวิว' />}
      />

      <ManageReviews reviewsData={reviewsData} rating={rating} query={q} />
    </>
  )
}
