// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

// Project Imports
import { formatDateTime } from '@/lib/format-date'

type ReviewItem = {
  id: string
  rating: number
  comment: string | null
  createdAt: string // ISO string (serialized in server component)
  itemName: string | null
}

// Base: composed from Vuexy ActivityTimeline card pattern (list of entries inside a Card)
// No direct "public reviews" widget in the theme; we reuse the Card + stacked divider pattern.

const RecentReviews = ({
  reviews,
  avgRating,
}: {
  reviews: ReviewItem[]
  avgRating: number
}) => {
  return (
    <Card>
      <CardContent>
        <div className='flex items-center justify-between mb-4'>
          <Typography variant='body2' color='text.disabled'>
            รีวิวล่าสุด
          </Typography>
          {reviews.length > 0 && (
            <div className='flex items-center gap-1 text-[var(--mui-palette-warning-main)]'>
              <i className='tabler-star-filled' />
              <Typography className='text-sm font-medium'>
                {avgRating.toFixed(1)} · {reviews.length}+ รีวิว
              </Typography>
            </div>
          )}
        </div>
        {reviews.length === 0 ? (
          <Typography color='text.secondary' className='text-sm py-8 text-center'>
            ยังไม่มีรีวิว
          </Typography>
        ) : (
          <div className='flex flex-col'>
            {reviews.map((r, idx) => (
              <div key={r.id}>
                <div className='py-4'>
                  <div className='flex items-center justify-between gap-3 mb-2'>
                    <div className='flex items-center gap-1 text-[var(--mui-palette-warning-main)]'>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <i
                          key={i}
                          className={
                            i < r.rating
                              ? 'tabler-star-filled'
                              : 'tabler-star text-[var(--mui-palette-text-disabled)]'
                          }
                        />
                      ))}
                    </div>
                    <Typography color='text.disabled' className='text-xs'>
                      {formatDateTime(r.createdAt)}
                    </Typography>
                  </div>
                  {r.itemName && (
                    <Typography color='text.secondary' className='text-xs mb-1'>
                      {r.itemName}
                    </Typography>
                  )}
                  {r.comment && (
                    <Typography className='text-sm whitespace-pre-wrap'>{r.comment}</Typography>
                  )}
                </div>
                {idx < reviews.length - 1 && <Divider />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default RecentReviews
