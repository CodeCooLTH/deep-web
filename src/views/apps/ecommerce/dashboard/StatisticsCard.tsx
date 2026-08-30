// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Type Imports
import type { ThemeColor } from '@core/types'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/StatisticsCard.tsx
 * Adapted (design.json / Impeccable): 4 stat tiles 2×2 เต็มความสูงการ์ด (flex rows grow) —
 * แก้ปัญหาการ์ดโล่ง. เขียว = สำเร็จ (verified-means-green); ม่วง 1 ใบ (One Voice).
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

const Tile = ({ item }: { item: DataType }) => (
  <div
    className='flex-1 min-w-0 flex flex-col justify-between gap-3 plb-5 pli-5 rounded-2xl transition-shadow duration-200 hover:shadow-sm'
    style={{ backgroundColor: `var(--mui-palette-${item.color}-lightOpacity)` }}
  >
    <div
      className='flex items-center justify-center rounded-lg bs-[42px] is-[42px]'
      style={{ backgroundColor: `var(--mui-palette-${item.color}-main)` }}
    >
      <i className={`${item.icon} text-[24px] text-white`} />
    </div>
    <div>
      <Typography variant='h3' className='font-extrabold leading-none mbe-1' color='text.primary'>
        {item.stats}
      </Typography>
      <Typography variant='body2' color='text.secondary' className='leading-tight'>
        {item.title}
      </Typography>
    </div>
  </div>
)

const StatisticsCard = ({ totalOrders, completedOrders, reviewsGiven, badgesEarned }: Props) => {
  const data: DataType[] = [
    { stats: `${totalOrders}`, title: 'คำสั่งซื้อทั้งหมด', color: 'primary', icon: 'tabler-shopping-bag' },
    { stats: `${completedOrders}`, title: 'สำเร็จแล้ว', color: 'success', icon: 'tabler-circle-check' },
    { stats: `${reviewsGiven}`, title: 'รีวิวที่ให้', color: 'warning', icon: 'tabler-star' },
    { stats: `${badgesEarned}`, title: 'Badge ที่ได้รับ', color: 'info', icon: 'tabler-award' }
  ]

  const rows = [data.slice(0, 2), data.slice(2, 4)]

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
      <CardContent className='grow flex flex-col gap-4'>
        {rows.map((row, ri) => (
          <div key={ri} className='flex gap-4 grow'>
            {row.map((item, ii) => (
              <Tile key={ii} item={item} />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default StatisticsCard
