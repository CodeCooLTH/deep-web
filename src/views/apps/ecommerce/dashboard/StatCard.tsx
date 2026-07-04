// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

/**
 * การ์ดสถิติเดี่ยว (buyer dashboard) — clean, equal-height ในแถวเดียว.
 * Base: theme/vuexy/typescript-version/full-version/src/@core/components/card-statistics/Horizontal.tsx
 */

type Props = {
  icon: string
  stats: string
  title: string
  color: ThemeColor
}

const StatCard = ({ icon, stats, title, color }: Props) => (
  <Card className='bs-full'>
    <CardContent className='flex items-center gap-4'>
      <CustomAvatar variant='rounded' skin='light' color={color} size={48}>
        <i className={`${icon} text-[26px]`} />
      </CustomAvatar>
      <div className='min-w-0'>
        <Typography variant='h4' className='font-extrabold leading-tight'>
          {stats}
        </Typography>
        <Typography variant='body2' color='text.secondary' className='truncate'>
          {title}
        </Typography>
      </div>
    </CardContent>
  </Card>
)

export default StatCard
