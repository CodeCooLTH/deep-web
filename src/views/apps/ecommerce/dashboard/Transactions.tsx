// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'
import Link from 'next/link'

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

type Props = {
  reviews: DashboardReview[]
}

// ดาว 5 ดวง filled/empty — ชุดเดียวกับ reviews card list (manage-reviews/index.tsx RatingStars)
const RatingStars = ({ value }: { value: number }) => (
  <div className='flex items-center gap-0.5 shrink-0'>
    {[1, 2, 3, 4, 5].map((n) => (
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
            /* 🛑 เลิก `size='small'` — ธีมไล่รัศมีตามขนาดปุ่ม (small = 4px) ⇒ หน้าเดียวมีปุ่ม
               สองทรง (4px กับ 6px) และสูงแค่ 30px ซึ่งต่ำกว่า tap target 44px ที่
               DESIGN.md §Do's บังคับ · กลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้คือผู้สูงวัย */
            sx={{ minHeight: 44 }}
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
                <CustomAvatar skin='light' variant='rounded' color='warning' size={34}>
                  <i className={classnames('tabler-star', 'text-[22px]')} />
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
                  <RatingStars value={review.rating} />
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
