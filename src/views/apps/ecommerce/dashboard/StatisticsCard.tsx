// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/StatisticsCard.tsx
 * Adapted: 4 buyer stats — total orders / completed / reviews given / badges earned.
 * เขียว = "สำเร็จแล้ว" (verified-means-green); ตัวเลขรวม = primary; รีวิว = amber(ดาว); badge = info.
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
        <Grid container spacing={6} sx={{ inlineSize: '100%' }}>
          {data.map((item, index) => (
            <Grid key={index} size={{ xs: 6, sm: 3 }} className='flex items-center gap-4'>
              <CustomAvatar color={item.color} variant='rounded' size={44} skin='light'>
                <i className={`${item.icon} text-[26px]`} />
              </CustomAvatar>
              <div className='flex flex-col'>
                <Typography variant='h4' className='font-extrabold leading-tight'>
                  {item.stats}
                </Typography>
                <Typography variant='body2' color='text.secondary'>
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
