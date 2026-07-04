// MUI Imports
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'

// Next Imports
import Link from 'next/link'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { LinkChip } from '@/app/(marketing)/_components/mui-link'

// Utils
import { formatDateTimeTH } from '@/lib/format-date'

// ตัวกรองดาว — mirror สไตล์ chips สถานะของ /orders
const RATING_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: '5', label: '5 ดาว' },
  { key: '4', label: '4 ดาว' },
  { key: '3', label: '3 ดาว' },
  { key: '2', label: '2 ดาว' },
  { key: '1', label: '1 ดาว' }
]

/**
 * Buyer "รีวิวที่ให้" — server-rendered card list (เชื่อมสไตล์กับ /orders card list + dashboard).
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/Transactions.tsx (row list)
 * เปลี่ยนจาก TanStack client table เดิม (ManageReviewsTable) → server component: เบา ไม่มี client JS,
 * แถวเดียวกับ OrderList (avatar + เนื้อหา + trailing) เพื่อความ cohesive ทั้ง buyer-app.
 *
 * ผู้เรียก (reviews/page.tsx) ต้องส่ง createdAt เป็น ISO string มาแล้ว (Date ไม่ serialise ข้าม RSC boundary).
 */

export type BuyerReviewRow = {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  order: {
    publicToken: string
    items: { id: string; name: string }[]
    shop: {
      user: { displayName: string; username: string }
    }
  }
}

const RatingStars = ({ value }: { value: number }) => (
  <div className='flex items-center gap-0.5 shrink-0'>
    {[1, 2, 3, 4, 5].map(n => (
      <i
        key={n}
        className={
          n <= value
            ? 'tabler-star-filled text-[16px] text-[var(--mui-palette-warning-main)]'
            : 'tabler-star text-[16px] text-[var(--mui-palette-action-disabled)]'
        }
      />
    ))}
  </div>
)

const ManageReviews = ({
  reviewsData,
  rating = 'ALL',
  query = ''
}: {
  reviewsData: BuyerReviewRow[]
  rating?: string
  query?: string
}) => {
  // คง q ไว้ตอนสลับ chip ดาว (search + filter ทำงานร่วมกัน)
  const qParam = query.trim() ? `q=${encodeURIComponent(query.trim())}` : ''
  const chipHref = (key: string) => {
    const parts = [key === 'ALL' ? '' : `rating=${key}`, qParam].filter(Boolean)
    return parts.length ? `/reviews?${parts.join('&')}` : '/reviews'
  }

  return (
    <div className='flex flex-col gap-6'>
      {/* ตัวกรองดาว */}
      <div className='flex flex-wrap gap-2'>
        {RATING_FILTERS.map(f => {
          const active = rating === f.key

          return (
            <LinkChip
              key={f.key}
              href={chipHref(f.key)}
              label={f.label}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
            />
          )
        })}
      </div>

      <Card>
        {reviewsData.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-3 plb-16 text-center'>
            <CustomAvatar skin='light' variant='rounded' color='secondary' size={52}>
              <i className={`${query.trim() ? 'tabler-search-off' : 'tabler-star'} text-[30px]`} />
            </CustomAvatar>
            <Typography color='text.secondary'>
              {query.trim() ? `ไม่พบรีวิวที่ตรงกับ "${query.trim()}"` : 'ยังไม่มีรีวิวที่ให้'}
            </Typography>
          </div>
        ) : (
        <div className='flex flex-col'>
          {reviewsData.map(review => {
            const first = review.order.items[0]
            const extra = review.order.items.length - 1
            const sellerName = review.order.shop.user.displayName

            return (
              <Link
                key={review.id}
                href={`/o/${review.order.publicToken}`}
                className='flex items-start gap-4 pli-5 plb-4 no-underline border-b border-[var(--mui-palette-divider)] last:border-b-0 hover:bg-[var(--mui-palette-action-hover)] transition-colors'
              >
                <CustomAvatar skin='light' variant='rounded' color='warning' size={44}>
                  <i className='tabler-star text-[24px]' />
                </CustomAvatar>

                <div className='flex flex-col min-w-0 grow gap-1'>
                  <div className='flex items-center justify-between gap-3'>
                    <Typography className='font-medium truncate' color='text.primary'>
                      {sellerName}
                    </Typography>
                    <RatingStars value={review.rating} />
                  </div>
                  <Typography variant='body2' color='text.secondary' className='truncate'>
                    {first?.name ?? 'คำสั่งซื้อ'}
                    {extra > 0 && ` + อีก ${extra} รายการ`} · {formatDateTimeTH(review.createdAt)}
                  </Typography>
                  {review.comment && (
                    <Typography variant='body2' color='text.primary' className='line-clamp-2'>
                      {review.comment}
                    </Typography>
                  )}
                </div>
              </Link>
            )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export default ManageReviews
