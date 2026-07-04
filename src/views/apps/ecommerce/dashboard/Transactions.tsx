// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'
import Link from 'next/link'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { LinkButton } from '@/app/(marketing)/_components/mui-link'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/Transactions.tsx
 * Adapted: list of recent reviews the buyer authored. Each row links to the seller's public
 *          profile (/u/{username}). Trailing element is a star-count chip instead of an amount.
 */

type SellerMini = {
  displayName: string
  username: string | null
}

export type DashboardReview = {
  id: string
  rating: number
  comment: string | null
  order: {
    publicToken: string
    shop: {
      user: SellerMini
    }
  }
}

const RATING_COLOR: Record<number, ThemeColor> = {
  1: 'error',
  2: 'error',
  3: 'warning',
  4: 'success',
  5: 'success'
}

type Props = {
  reviews: DashboardReview[]
}

const Transactions = ({ reviews }: Props) => {
  return (
    <Card className='bs-full flex flex-col'>
      <CardHeader
        title='รีวิวที่ให้ล่าสุด'
        subheader={`คุณให้รีวิวทั้งหมด ${reviews.length} รายการ`}
        action={
          <LinkButton
            href='/reviews'
            variant='text'
            size='small'
            endIcon={<i className='tabler-chevron-right' />}
          >
            ทั้งหมด
          </LinkButton>
        }
      />
      <CardContent className='flex grow gap-y-[18px] lg:gap-y-5 flex-col justify-between max-sm:gap-5'>
        {reviews.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-2 grow plb-8 text-center'>
            <CustomAvatar skin='light' variant='rounded' color='secondary' size={46}>
              <i className='tabler-star text-[26px]' />
            </CustomAvatar>
            <Typography color='text.secondary'>ยังไม่มีรีวิวที่ให้</Typography>
          </div>
        ) : (
          reviews.map((review) => {
            const seller = review.order.shop.user
            const ratingColor = RATING_COLOR[review.rating] ?? 'warning'
            const SellerName = seller.username ? (
              <Link
                href={`/u/${seller.username}`}
                className='font-medium no-underline hover:text-[var(--mui-palette-primary-main)]'
              >
                {seller.displayName}
              </Link>
            ) : (
              <Typography className='font-medium' color='text.primary'>
                {seller.displayName}
              </Typography>
            )
            return (
              <div key={review.id} className='flex items-center gap-4'>
                <CustomAvatar skin='light' variant='rounded' color={ratingColor} size={34}>
                  <i className={classnames('tabler-star-filled', 'text-[22px]')} />
                </CustomAvatar>
                <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                  <div className='flex flex-col min-w-0'>
                    {SellerName}
                    {review.comment ? (
                      <Typography variant='body2' className='line-clamp-1'>
                        {review.comment}
                      </Typography>
                    ) : (
                      <Typography variant='body2' color='text.disabled'>
                        ไม่มีความเห็น
                      </Typography>
                    )}
                  </div>
                  <div className='flex items-center gap-1 text-[var(--mui-palette-warning-main)] text-sm'>
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <i key={i} className='tabler-star-filled' />
                    ))}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export default Transactions
