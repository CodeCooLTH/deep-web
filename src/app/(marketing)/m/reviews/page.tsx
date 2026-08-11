import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getReviewsByBuyer } from '@/services/review.service'
import { formatDateTimeTH } from '@/lib/format-date'
import SearchBox from '@/app/(marketing)/(buyer-app)/_components/SearchBox'
import { MPageTitle, MEmpty } from '../_components/ui'
import { sessionUserId } from '@/lib/session-user'

export const metadata: Metadata = { title: 'รีวิวที่ให้' }

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: '5', label: '5 ดาว' },
  { key: '4', label: '4 ดาว' },
  { key: '3', label: '3 ดาว' },
  { key: '2', label: '2 ดาว' },
  { key: '1', label: '1 ดาว' }
]
const VALID = new Set(FILTERS.map(f => f.key))

const chipHref = (key: string, q: string) => {
  const p = new URLSearchParams()
  if (key !== 'ALL') p.set('rating', key)
  if (q) p.set('q', q)
  const qs = p.toString()
  return `/reviews${qs ? `?${qs}` : ''}`
}

const Stars = ({ value }: { value: number }) => (
  <span className='flex items-center gap-0.5 shrink-0'>
    {[1, 2, 3, 4, 5].map(n => (
      <i
        key={n}
        className={`${n <= value ? 'tabler-star-filled' : 'tabler-star'} text-[14px]`}
        style={{ color: n <= value ? 'var(--mui-palette-warning-main)' : 'var(--mui-palette-action-disabled)' }}
      />
    ))}
  </span>
)

export default async function MobileReviewsPage({
  searchParams
}: {
  searchParams: Promise<{ rating?: string; q?: string }>
}) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/reviews')

  const { rating: rawRating = 'ALL', q = '' } = await searchParams
  const rating = VALID.has(rawRating) ? rawRating : 'ALL'
  const query = q.trim().toLowerCase()

  const allReviews = await getReviewsByBuyer(userId)
  const byRating = rating === 'ALL' ? allReviews : allReviews.filter(r => r.rating === Number(rating))
  const reviews = !query
    ? byRating
    : byRating.filter(
        r =>
          (r.comment?.toLowerCase().includes(query) ?? false) ||
          r.order.shop.user.displayName.toLowerCase().includes(query)
      )

  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title='รีวิวที่ให้' back='/settings/profile' />

      <SearchBox placeholder='ค้นหาร้าน / ข้อความรีวิว' />

      <div className='flex gap-2 overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {FILTERS.map(f => {
          const active = f.key === rating
          return (
            <Link
              key={f.key}
              href={chipHref(f.key, q)}
              className={`shrink-0 h-8 flex items-center pli-3.5 rounded-full text-[13px] no-underline border transition-colors ${
                active
                  ? 'bg-[var(--mui-palette-primary-main)] text-white border-[var(--mui-palette-primary-main)]'
                  : 'bg-[var(--mui-palette-background-paper)] text-[var(--mui-palette-text-secondary)] border-[var(--mui-palette-divider)]'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {reviews.length === 0 ? (
        <MEmpty
          icon={query ? 'tabler-search-off' : 'tabler-star'}
          text={query ? `ไม่พบรีวิวที่ตรงกับ "${q}"` : 'ยังไม่มีรีวิวที่ให้'}
        />
      ) : (
        <div className='flex flex-col gap-2.5'>
          {reviews.map(r => {
            const first = r.order.items[0]
            return (
              <Link
                key={r.id}
                href={`/o/${r.order.publicToken}`}
                className='no-underline rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-3.5 flex flex-col gap-1.5'
              >
                <div className='flex items-center justify-between gap-2'>
                  <div className='flex items-center gap-1.5 min-w-0'>
                    <i className='tabler-building-store text-[16px] text-[var(--mui-palette-text-secondary)] shrink-0' />
                    <span className='text-[14px] font-medium truncate text-[var(--mui-palette-text-primary)]'>
                      {r.order.shop.user.displayName}
                    </span>
                  </div>
                  <Stars value={r.rating} />
                </div>
                <p className='text-[12px] m-0 text-[var(--mui-palette-text-disabled)] truncate'>
                  {first?.name ?? 'คำสั่งซื้อ'} · {formatDateTimeTH(r.createdAt)}
                </p>
                {r.comment && (
                  <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)] line-clamp-2 leading-snug'>
                    {r.comment}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
