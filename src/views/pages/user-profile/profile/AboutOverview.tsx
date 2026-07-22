// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import CardContent from '@mui/material/CardContent'

export type AboutItem = {
  property: string
  value: string
  icon: string
}

export type AboutOverviewData = {
  about: AboutItem[]
  overview: AboutItem[]
  shopInfo?: {
    shopName: string
    description?: string | null
    category?: string | null
  } | null
}

const renderList = (list: AboutItem[]) => {
  return (
    list.length > 0 &&
    list.map((item, index) => (
      <div key={index} className='flex items-center gap-2'>
        <i className={item.icon} />
        <div className='flex items-center flex-wrap gap-2'>
          <Typography className='font-medium'>{`${item.property}:`}</Typography>
          <Typography>{item.value}</Typography>
        </div>
      </div>
    ))
  )
}

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/AboutOverview.tsx
// Adapted: dropped "Contacts" + "Teams" sections (not applicable to SafePay public profile);
// replaced with About (member since, shop) + Overview (trust level, verification) + optional Shop description.
const AboutOverview = ({ data }: { data: AboutOverviewData }) => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent className='flex flex-col gap-6'>
            <div className='flex flex-col gap-4'>
              <Typography variant='body2' color='text.disabled'>
                เกี่ยวกับ
              </Typography>
              {renderList(data.about)}
            </div>
            <div className='flex flex-col gap-4'>
              <Typography variant='body2' color='text.disabled'>
                สรุป
              </Typography>
              {renderList(data.overview)}
            </div>
          </CardContent>
        </Card>
      </Grid>
      {data.shopInfo && (
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent className='flex flex-col gap-3'>
              <Typography variant='body2' color='text.disabled'>
                เกี่ยวกับร้าน
              </Typography>
              <Typography className='font-medium'>{data.shopInfo.shopName}</Typography>
              {data.shopInfo.description && (
                <Typography color='text.secondary' className='text-sm whitespace-pre-wrap'>
                  {data.shopInfo.description}
                </Typography>
              )}
              {data.shopInfo.category && (
                <Typography color='text.secondary' className='text-sm'>
                  หมวดหมู่: {data.shopInfo.category}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  )
}

export default AboutOverview
