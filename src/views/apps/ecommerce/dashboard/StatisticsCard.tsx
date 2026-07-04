// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'

// Type Imports
import type { ThemeColor } from '@core/types'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/StatisticsCard.tsx
 * Adapted (design.json): 4 stat "tiles" — tinted mini-cards, big number, real signal hierarchy.
 * เขียว = "สำเร็จแล้ว" (verified-means-green); ม่วง 1 ใบเท่านั้น (One Voice).
 */

type DataType = {
  icon: string
  stats: string
  title: string
  color: ThemeColor
}

type Props = {
  totalOrders: number
  completedOrders: number
  reviewsGiven: number
  badgesEarned: number
}

const StatisticsCard = ({ totalOrders, completedOrders, reviewsGiven, badgesEarned }: Props) => {
  const data: DataType[] = [
    { stats: `${totalOrders}`, title: 'คำสั่งซื้อทั้งหมด', color: 'primary', icon: 'tabler-shopping-bag' },
    { stats: `${completedOrders}`, title: 'สำเร็จแล้ว', color: 'success', icon: 'tabler-circle-check' },
    { stats: `${reviewsGiven}`, title: 'รีวิวที่ให้', color: 'warning', icon: 'tabler-star' },
    { stats: `${badgesEarned}`, title: 'Badge ที่ได้รับ', color: 'info', icon: 'tabler-award' }
  ]

  return (
    <Card className='bs-full flex flex-col'>
      <CardHeader
        title='สถิติของคุณ'
        action={
          <Typography variant='subtitle2' color='text.disabled'>
            อัปเดตล่าสุด
          </Typography>
        }
      />
      <CardContent className='flex grow items-center'>
        <Grid container spacing={4} sx={{ inlineSize: '100%' }}>
          {data.map((item, index) => (
            <Grid key={index} size={{ xs: 6, sm: 3 }}>
              <div
                className='flex flex-col gap-2 plb-4 pli-4 rounded-xl bs-full'
                style={{ backgroundColor: `var(--mui-palette-${item.color}-lightOpacity)` }}
              >
                <i
                  className={`${item.icon} text-[28px]`}
                  style={{ color: `var(--mui-palette-${item.color}-main)` }}
                />
                <Typography variant='h3' className='font-extrabold leading-none' color='text.primary'>
                  {item.stats}
                </Typography>
                <Typography variant='body2' color='text.secondary' className='leading-tight'>
                  {item.title}
                </Typography>
              </div>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

export default StatisticsCard
